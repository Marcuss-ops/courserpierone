import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { sendPurchaseConfirmation } from "@/lib/email";
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
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Gestisci il evento checkout.session.completed
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;

    const userId = session.metadata?.userId;
    const productId = session.metadata?.productId;
    const locale = session.metadata?.locale;

    if (!userId || !productId) {
      console.error("Missing metadata in session:", session.id);
      return NextResponse.json({ received: true });
    }

    try {
      await prisma.order.create({
        data: {
          userId,
          productId,
          stripeSessionId: session.id,
          amount: session.amount_total || 0,
          currency: session.currency || "eur",
          locale: locale || "it",
          status: "completed",
        },
      });

      // Generate magic link for the user so they can access the course
      const customerEmail = session.customer_details?.email || session.metadata?.email;
      if (customerEmail) {
        const { randomBytes } = await import("crypto");
        const token = randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year

        await prisma.magicLink.create({
          data: {
            email: customerEmail,
            token,
            productId,
            expiresAt,
          },
        });

        const magicUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/login/verify?token=${token}`;
        console.log(`Magic link generated for ${customerEmail}: ${magicUrl}`);

        // Send purchase confirmation email
        const product = await prisma.product.findUnique({ where: { id: productId } });
        if (product) {
          const courseUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/${product.slug}/curso/lesson-1?lang=${locale || "it"}&token=${token}`;
          try {
            await sendPurchaseConfirmation(customerEmail, product.slug, courseUrl);
          } catch (emailErr) {
            console.error("[Stripe] Failed to send purchase confirmation email:", emailErr);
          }
        }

        // Track purchase analytics event
        await prisma.analyticEvent.create({
          data: {
            productId,
            eventType: "purchase",
            metadata: JSON.stringify({ amount: session.amount_total, currency: session.currency }),
            userId,
          },
        }).catch((e) => console.warn("[Stripe Webhook] Failed to track analytics event:", e));
      }

      console.log(`Order created for user ${userId}, product ${productId}`);
    } catch (error) {
      console.error("Failed to create order:", error);
    }
  }

  return NextResponse.json({ received: true });
}
