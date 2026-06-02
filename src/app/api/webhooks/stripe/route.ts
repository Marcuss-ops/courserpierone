import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/payment/stripe";
import { processOrder } from "@/lib/services/order-service";
import Stripe from "stripe";

export async function POST(request: NextRequest) {
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

    try {
      await processOrder({
        email: customerEmail,
        productId,
        stripeSessionId: session.id,
        paymentProvider: "stripe",
        amount: session.amount_total ?? 0,
        currency: session.currency ?? "eur",
        locale,
      });

      console.log(`[Stripe] Order processed for session ${session.id}`);
    } catch (error) {
      console.error("[Stripe] Failed to process order:", error);
    }
  }

  return NextResponse.json({ received: true });
}
