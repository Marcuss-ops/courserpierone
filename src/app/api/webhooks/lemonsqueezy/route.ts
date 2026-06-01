import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendPurchaseConfirmation } from "@/lib/email";
import crypto from "crypto";

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("x-signature");

  const webhookSecret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  // Verify signature
  if (!signature) {
    return NextResponse.json({ error: "Missing x-signature header" }, { status: 400 });
  }

  const hmac = crypto.createHmac("sha256", webhookSecret);
  const digest = hmac.update(body).digest("hex");

  // Timing-safe comparison to prevent timing attacks
  const expected = Buffer.from(digest);
  const actual = Buffer.from(signature);

  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  let payload: any;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventName = payload.meta?.event_name;
  const data = payload.data;

  if (!eventName || !data) {
    return NextResponse.json({ received: true });
  }

  // ─── Order Created ──────────────────────────────────────────
  if (eventName === "order_created") {
    const attributes = data.attributes;
    const customData = attributes?.first_order_item?.product_options?.custom_data || {};
    const customerEmail = attributes?.user_email || attributes?.customer_email || "";
    const variantId = String(attributes?.first_order_item?.variant_id || "");
    const orderId = String(data.id);
    const amount = attributes?.total || 0; // in cents
    const currency = attributes?.currency || "usd";
    const productSlug = customData.courseSlug || customData.productSlug || "";

    console.log(`[LS Webhook] order_created: ${orderId}, email: ${customerEmail}, variant: ${variantId}`);

    if (!customerEmail) {
      console.error("Missing customer email in LS order", orderId);
      return NextResponse.json({ received: true });
    }

    // Find or create user
    let user = await prisma.user.findUnique({ where: { email: customerEmail } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: customerEmail,
          name: attributes?.user_name || customerEmail.split("@")[0],
        },
      });
    }

    // Find the product by slug or variant ID
    let product = productSlug
      ? await prisma.product.findUnique({ where: { slug: productSlug } })
      : null;

    if (!product) {
      product = await prisma.product.findFirst({
        where: { lemonVariantId: variantId },
      });
    }

    if (!product) {
      console.error(`Product not found for variant ${variantId} or slug ${productSlug}`);
      return NextResponse.json({ received: true });
    }

    // Create order
    try {
      const existingOrder = await prisma.order.findFirst({
        where: {
          paymentProvider: "lemonsqueezy",
          providerOrderId: orderId,
        },
      });

      if (existingOrder) {
        console.log(`Order ${orderId} already exists, skipping`);
        return NextResponse.json({ received: true });
      }

      await prisma.order.create({
        data: {
          userId: user.id,
          productId: product.id,
          paymentProvider: "lemonsqueezy",
          providerOrderId: orderId,
          amount,
          currency,
          locale: customData.locale || "it",
          status: "completed",
        },
      });

      // Generate magic link for the user
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year

      await prisma.magicLink.create({
        data: {
          email: customerEmail,
          token,
          productId: product.id,
          expiresAt,
        },
      });

      const magicUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/login/verify?token=${token}`;
      console.log(`[LS] Magic link for ${customerEmail}: ${magicUrl}`);

      // Send purchase confirmation email
      const courseUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/${product.slug}/curso/lesson-1?lang=${customData.locale || "it"}&token=${token}`;
      
      try {
        await sendPurchaseConfirmation(customerEmail, product.slug, courseUrl);
      } catch (emailErr) {
        console.error("[LS] Failed to send purchase confirmation email:", emailErr);
      }

      // Track purchase analytics event
      await prisma.analyticEvent
        .create({
          data: {
            productId: product.id,
            eventType: "purchase",
            metadata: JSON.stringify({
              provider: "lemonsqueezy",
              amount,
              currency,
              providerOrderId: orderId,
            }),
            userId: user.id,
          },
        })
        .catch((e) => console.warn("[LS Webhook] Failed to track analytics event:", e));

      console.log(`[LS] Order ${orderId} created for user ${user.id}, product ${product.slug}`);
    } catch (error) {
      console.error("Failed to create order from LS webhook:", error);
    }
  }

  // ─── Subscription Created (for recurring products) ──────────
  if (eventName === "subscription_created") {
    const attributes = data.attributes;
    const customerEmail = attributes?.user_email || attributes?.customer_email || "";
    const variantId = String(attributes?.variant_id || attributes?.product_variant_id || "");
    const orderId = String(data.id);
    const customData = attributes?.custom_data || {};
    const productSlug = customData.courseSlug || "";

    if (customerEmail) {
      // Find or create user
      let user = await prisma.user.findUnique({ where: { email: customerEmail } });
      if (!user) {
        user = await prisma.user.create({
          data: {
            email: customerEmail,
            name: attributes?.user_name || customerEmail.split("@")[0],
          },
        });
      }

      // Find product
      let product = productSlug
        ? await prisma.product.findUnique({ where: { slug: productSlug } })
        : null;
      if (!product && variantId) {
        product = await prisma.product.findFirst({ where: { lemonVariantId: variantId } });
      }

      if (product) {
        // Idempotency check
        const existingOrder = await prisma.order.findFirst({
          where: { paymentProvider: "lemonsqueezy", providerOrderId: orderId },
        });

        if (!existingOrder) {
          await prisma.order.create({
            data: {
              userId: user.id,
              productId: product.id,
              paymentProvider: "lemonsqueezy",
              providerOrderId: orderId,
              amount: attributes?.total || 0,
              currency: attributes?.currency || "usd",
              locale: customData.locale || "it",
              status: "completed",
            },
          });

          console.log(`[LS] Subscription ${orderId} created for user ${user.id}, product ${product.slug}`);
        }
      }
    }
    console.log("[LS Webhook] subscription_created:", data.id);
    // Future: handle recurring subscriptions
  }

  return NextResponse.json({ received: true });
}
