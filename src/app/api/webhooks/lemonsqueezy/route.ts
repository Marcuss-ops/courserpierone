import { NextRequest, NextResponse } from "next/server";
import { processOrder } from "@/lib/services/order-service";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import crypto from "crypto";

// Force dynamic — webhook non può essere statico
export const dynamic = "force-dynamic";

async function POST_IMPL(request: NextRequest) {
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

  // ─── Idempotency guard ──────────────────────────────────────
  // LemonSqueezy doesn't have a dedicated delivery_id. We use a
  // composite of data.id + event_name as the unique key.
  const deliveryId = `LS-${data.id}-${eventName}`;

  const alreadyProcessed = await prisma.processedWebhook.findUnique({
    where: { deliveryId },
  });
  if (alreadyProcessed) {
    return NextResponse.json({ received: true });
  }

  // ─── Process the event ──────────────────────────────────────
  try {
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
        customerCountry: attributes?.customer_country ?? attributes?.country ?? null,
      });
    }

    // ─── Order Created ──────────────────────────────────────────
    if (eventName === "order_created") {
      const attributes = data.attributes;
      const orderId = String(data.id);

      console.log(`[LS Webhook] order_created: ${orderId}, email: ${attributes?.user_email ?? attributes?.customer_email}`);

      await handleLsOrder(attributes, orderId);
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
          customerCountry: attributes?.customer_country ?? attributes?.country ?? null,
        });
      }

      console.log("[LS Webhook] subscription_created:", data.id);
    }

    // ── subscription_cancelled → revoke access ─────────────────
    if (eventName === "subscription_cancelled") {
      const orderId = String(data.id);

      const updated = await prisma.order.updateMany({
        where: {
          paymentProvider: "lemonsqueezy",
          providerOrderId: orderId,
          status: "completed", // only downgrade completed orders
        },
        data: { status: "failed" },
      });

      if (updated.count > 0) {
        console.log(
          `[LS Webhook] subscription_cancelled: revoked ${updated.count} order(s) for ${orderId}`
        );
      }
    }

    // ── subscription_payment_failed → revoke access ────────────
    if (eventName === "subscription_payment_failed") {
      const orderId = String(data.id);

      const updated = await prisma.order.updateMany({
        where: {
          paymentProvider: "lemonsqueezy",
          providerOrderId: orderId,
          status: "completed",
        },
        data: { status: "failed" },
      });

      if (updated.count > 0) {
        console.log(
          `[LS Webhook] subscription_payment_failed: revoked ${updated.count} order(s) for ${orderId}`
        );
      }
    }

    // ── order_refunded → mark order as refunded (auto-revoke access) ──
    if (eventName === "order_refunded") {
      const orderId = String(data.id);

      const updated = await prisma.order.updateMany({
        where: {
          paymentProvider: "lemonsqueezy",
          providerOrderId: orderId,
          status: "completed",
        },
        data: { status: "refunded" },
      });

      if (updated.count > 0) {
        console.log(
          `[LS Webhook] order_refunded: marked ${updated.count} order(s) as refunded for ${orderId}`
        );
      }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const isTransient = msg.includes("ECONNREFUSED") || msg.includes("timeout") || msg.includes("rate limit");
    console.error(`[LS Webhook] Failed to process event (${isTransient ? "retryable" : "permanent"}):`, error);
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
  // by unique constraints (@@unique([paymentProvider, providerOrderId])).
  try {
    await prisma.processedWebhook.create({
      data: {
        provider: "lemonsqueezy",
        deliveryId,
        eventType: eventName,
      },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      // Already recorded by a concurrent request — safe to ack.
    } else {
      console.error("[LS Webhook] Failed to record processed webhook:", err);
    }
  }

  return NextResponse.json({ received: true });
}

export const POST = POST_IMPL;
