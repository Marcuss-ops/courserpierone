import { NextRequest, NextResponse } from "next/server";
import { processOrder } from "@/lib/services/order-service";
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

  // ─── Helper: process LS order/subscription ──────────────────
  async function handleLsOrder(attributes: any, orderId: string) {
    const customData = attributes?.first_order_item?.product_options?.custom_data ?? {};
    const customerEmail = attributes?.user_email ?? attributes?.customer_email ?? "";

    if (!customerEmail) {
      console.error("Missing customer email in LS order", orderId);
      return;
    }

    const variantId = String(attributes?.first_order_item?.variant_id ?? "");
    const amount = attributes?.total ?? 0;
    const currency = attributes?.currency ?? "usd";
    const productSlug = customData.courseSlug ?? customData.productSlug ?? "";
    const customerName = attributes?.user_name ?? "";

    await processOrder({
      email: customerEmail,
      customerName,
      productSlug,
      variantId,
      providerOrderId: orderId,
      paymentProvider: "lemonsqueezy",
      amount,
      currency,
      locale: customData.locale ?? "it",
    });
  }

  // ─── Order Created ──────────────────────────────────────────
  if (eventName === "order_created") {
    const attributes = data.attributes;
    const orderId = String(data.id);

    console.log(`[LS Webhook] order_created: ${orderId}, email: ${attributes?.user_email ?? attributes?.customer_email}`);

    try {
      await handleLsOrder(attributes, orderId);
    } catch (error) {
      console.error("Failed to process order from LS webhook:", error);
    }
  }

  // ─── Subscription Created ───────────────────────────────────
  if (eventName === "subscription_created") {
    const attributes = data.attributes;
    const orderId = String(data.id);
    const customerEmail = attributes?.user_email ?? attributes?.customer_email ?? "";

    if (customerEmail) {
      const variantId = String(attributes?.variant_id ?? attributes?.product_variant_id ?? "");
      const customData = attributes?.custom_data ?? {};
      const productSlug = customData.courseSlug ?? "";
      const customerName = attributes?.user_name ?? "";

      try {
        await processOrder({
          email: customerEmail,
          customerName,
          productSlug,
          variantId,
          providerOrderId: orderId,
          paymentProvider: "lemonsqueezy",
          amount: attributes?.total ?? 0,
          currency: attributes?.currency ?? "usd",
          locale: customData.locale ?? "it",
        });
      } catch (error) {
        console.error("Failed to process subscription from LS webhook:", error);
      }
    }

    console.log("[LS Webhook] subscription_created:", data.id);
  }

  return NextResponse.json({ received: true });
}
