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
    if (event.type === "checkout.session.completed") {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- Stripe union types don't narrow automatically
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
