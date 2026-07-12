import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/payment/stripe";
import { processOrder } from "@/lib/services/order-service";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import Stripe from "stripe";

// Force dynamic — webhook non può essere statico
export const dynamic = "force-dynamic";

async function POST_IMPL(request: NextRequest) {
  const body = await request.text();
  const sig = request.headers.get("stripe-signature");

  if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = getStripe().webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // ─── Idempotency guard ──────────────────────────────────────
  // Stripe guarantees event.id is unique per event. We check whether
  // this delivery was already processed; if so, ack immediately.
  // The record is created only after successful processing so that a
  // Vercel timeout does not leave a stale "processed" marker and block
  // legitimate retries.
  const deliveryId = event.id;

  const alreadyProcessed = await prisma.processedWebhook.findUnique({
    where: { deliveryId },
  });
  if (alreadyProcessed) {
    return NextResponse.json({ received: true });
  }

  // ─── Process the event ──────────────────────────────────────
  try {
    // ── checkout.session.completed → create completed order ────
    if (event.type === "checkout.session.completed") {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      const session = event.data.object as Stripe.Checkout.Session;

      const productId = session.metadata?.productId;
      const locale = session.metadata?.locale ?? "it";
      const customerEmail =
        session.customer_details?.email ?? session.metadata?.email ?? "";

      if (!productId) {
        console.error("Missing productId in session metadata:", session.id);
        return NextResponse.json({ received: true });
      }

      if (!customerEmail) {
        console.error("Missing customer email in session:", session.id);
        return NextResponse.json({ received: true });
      }

      await processOrder({
        email: customerEmail,
        productId,
        stripeSessionId: session.id,
        stripeSubscriptionId:
          typeof session.subscription === "string"
            ? session.subscription
            : undefined,
        paymentProvider: "stripe",
        amount: session.amount_total ?? 0,
        currency: session.currency ?? "eur",
        locale,
        customerCountry: session.metadata?.customer_country ?? null,
      });

      console.log(`[Stripe] Order processed for session ${session.id}`);
    }

    // ── checkout.session.expired → mark order as failed ───────
    if (event.type === "checkout.session.expired") {
      const session = event.data.object;

      if (!session.id) {
        return NextResponse.json({ received: true });
      }

      const updated = await prisma.order.updateMany({
        where: {
          stripeSessionId: session.id,
          status: "completed", // only downgrade completed orders
        },
        data: { status: "failed" },
      });

      if (updated.count > 0) {
        console.log(
          `[Stripe] Marked ${updated.count} order(s) as failed for expired session ${session.id}`
        );
      }
    }

    // ── invoice.payment_failed → revoke access for subscription orders ──
    if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sub = (invoice as any).subscription;
      const subscriptionId = typeof sub === "string" ? sub : undefined;

      if (subscriptionId) {
        const updated = await prisma.order.updateMany({
          where: {
            stripeSubscriptionId: subscriptionId,
            status: "completed",
          },
          data: { status: "failed" },
        });

        if (updated.count > 0) {
          console.log(
            `[Stripe] invoice.payment_failed: revoked ${updated.count} order(s) for subscription ${subscriptionId}`
          );
        } else {
          console.log(
            `[Stripe] invoice.payment_failed for subscription ${subscriptionId} — no matching completed orders found`
          );
        }
      } else {
        console.warn(
          `[Stripe] invoice.payment_failed without subscription ID — cannot revoke`
        );
      }
    }

    // ── charge.refunded → mark order as refunded (auto-revoke access) ──
    // Only revoke on FULL refunds — partial refunds should not block access.
    if (event.type === "charge.refunded") {
      const charge = event.data.object;

      // charge.refunded (the boolean field) is true only when FULLY refunded
      if (!charge.refunded) {
        console.log(
          `[Stripe] charge.refunded — partial refund for ${charge.id}, skipping revoke`
        );
        return NextResponse.json({ received: true });
      }

      const paymentIntent = charge.payment_intent as string | undefined;

      if (paymentIntent) {
        // Find the checkout session linked to this payment intent
        const sessions = await getStripe().checkout.sessions.list({
          payment_intent: paymentIntent,
          limit: 1,
        });
        const stripeSessionId = sessions.data[0]?.id;

        if (stripeSessionId) {
          const updated = await prisma.order.updateMany({
            where: {
              stripeSessionId,
              status: "completed",
            },
            data: { status: "refunded" },
          });

          if (updated.count > 0) {
            console.log(
              `[Stripe] charge.refunded: marked ${updated.count} order(s) as refunded for session ${stripeSessionId}`
            );
          }
        } else {
          console.log(
            `[Stripe] charge.refunded for payment_intent ${paymentIntent} — no checkout session found, skipping`
          );
        }
      }
    }

    // ── customer.subscription.deleted → revoke access for subscription ──
    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object;
      const subscriptionId = subscription.id;

      const updated = await prisma.order.updateMany({
        where: {
          stripeSubscriptionId: subscriptionId,
          status: "completed",
        },
        data: { status: "failed" },
      });

      if (updated.count > 0) {
        console.log(
          `[Stripe] Subscription deleted: revoked ${updated.count} order(s) for subscription ${subscriptionId}`
        );
      }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const isTransient = msg.includes("ECONNREFUSED") || msg.includes("timeout") || msg.includes("rate limit");
    console.error(`[Stripe] Failed to process order (${isTransient ? "retryable" : "permanent"}):`, error);
    if (isTransient) {
      return NextResponse.json({ error: "Temporary failure" }, { status: 503 });
    }
    // Deterministic business errors (e.g., product not found, invalid metadata)
    // are acknowledged so the provider stops retrying. Transient/upstream
    // errors (including PaymentError) are left to retry.
    if (error instanceof NotFoundError || error instanceof ValidationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 200 });
    }
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  // Record successful processing. Concurrent requests for the same event
  // may race here; P2002 is ignored because the order itself is protected
  // by unique constraints (stripeSessionId / providerOrderId).
  try {
    await prisma.processedWebhook.create({
      data: {
        provider: "stripe",
        deliveryId,
        eventType: event.type,
      },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      // Already recorded by a concurrent request — safe to ack.
    } else {
      console.error("[Stripe] Failed to record processed webhook:", err);
    }
  }

  return NextResponse.json({ received: true });
}

export const POST = POST_IMPL;
