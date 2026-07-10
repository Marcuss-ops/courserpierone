import { NextRequest, NextResponse } from "next/server";
import { processOrder } from "@/lib/services/order-service";
import { withRateLimit } from "@/lib/utils/rate-limit";
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

  try {
    await prisma.processedWebhook.create({
      data: {
        provider: "lemonsqueezy",
        deliveryId,
        eventType: eventName,
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
    // Processing failed — delete the idempotency record so LS
    // can retry the webhook.
    await prisma.processedWebhook
      .delete({ where: { deliveryId } })
      .catch(() => {
        // Silently ignore — record might have been cleaned up already
      });

    console.error("Failed to process LS webhook:", error);
    return NextResponse.json({ error: "Temporary failure" }, { status: 503 });
  }

  return NextResponse.json({ received: true });
}

export const POST = withRateLimit(POST_IMPL, "WEBHOOK");
