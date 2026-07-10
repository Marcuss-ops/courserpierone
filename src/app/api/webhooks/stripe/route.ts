import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/payment/stripe";
import { processOrder } from "@/lib/services/order-service";
import { withRateLimit } from "@/lib/utils/rate-limit";
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
  // Stripe guarantees event.id is unique per event. We insert a
  // ProcessedWebhook record BEFORE processing. If the insert fails
  // with a unique constraint violation (P2002), the webhook was
  // already processed — ack immediately to prevent duplicate orders.
  const deliveryId = event.id;

  try {
    await prisma.processedWebhook.create({
      data: {
        provider: "stripe",
        deliveryId,
        eventType: event.type,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      // Already processed — ack silently
      return NextResponse.json({ received: true });
    }
    throw error;
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
      const session = event.data.object as Stripe.Checkout.Session;

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

    // ── invoice.payment_failed → log warning (no automatic revoke) ──
    // TODO: add stripeSubscriptionId to Order model to enable targeted revoke.
    // Mass-revoking ALL orders for the customer is too aggressive.
    if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object as Stripe.Invoice;
      console.warn(
        `[Stripe] invoice.payment_failed for ${invoice.customer_email ?? "unknown"} — ` +
        `manual intervention may be required. ` +
        `TODO: add stripeSubscriptionId to Order for automatic targeted revoke.`
      );
    }

    // ── charge.refunded → mark order as refunded (auto-revoke access) ──
    // Only revoke on FULL refunds — partial refunds should not block access.
    if (event.type === "charge.refunded") {
      const charge = event.data.object as Stripe.Charge;

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

    // ── customer.subscription.deleted → log warning (no automatic revoke) ──
    // TODO: add stripeSubscriptionId to Order model to enable targeted revoke.
    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object as Stripe.Subscription;
      console.warn(
        `[Stripe] Subscription ${subscription.id} deleted for customer ${subscription.customer} — ` +
        `manual intervention may be required. ` +
        `TODO: add stripeSubscriptionId to Order for automatic targeted revoke.`
      );
    }
  } catch (error) {
    // Processing failed — delete the idempotency record so Stripe
    // can retry the webhook. Only delete if we created it above.
    await prisma.processedWebhook
      .delete({ where: { deliveryId } })
      .catch(() => {
        // Silently ignore — record might have been cleaned up already
      });

    const msg = error instanceof Error ? error.message : String(error);
    const isTransient = msg.includes("ECONNREFUSED") || msg.includes("timeout") || msg.includes("rate limit");
    console.error(`[Stripe] Failed to process order (${isTransient ? "retryable" : "permanent"}):`, error);
    if (isTransient) {
      return NextResponse.json({ error: "Temporary failure" }, { status: 503 });
    }
  }

  return NextResponse.json({ received: true });
}

export const POST = withRateLimit(POST_IMPL, "WEBHOOK");
