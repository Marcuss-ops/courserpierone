import { NextRequest, NextResponse } from "next/server";
import { processOrder } from "@/lib/services/order-service";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import crypto from "crypto";
import type {
  LsWebhookPayload,
  LsWebhookMeta,
  LsOrderAttributes,
} from "./types";

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

  let payload: LsWebhookPayload;
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
    // Reads customData from `meta.custom_data` (canonical LS path per
    // https://docs.lemonsqueezy.com/help/checkout/passing-custom-data)
    // with defensive fallbacks to the older per-resource paths so a
    // legacy/migrated payload still resolves cleanly.
    async function handleLsOrder(meta: LsWebhookMeta, attributes: LsOrderAttributes | undefined, orderId: string) {
      const customData =
        meta?.custom_data ??
        attributes?.first_order_item?.product_options?.custom_data ??
        {};
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
        channelId: customData.channelId ?? null,
      });
    }

    // ─── Order Created ──────────────────────────────────────────
    if (eventName === "order_created") {
      const attributes = data.attributes;
      const orderId = String(data.id);

      console.log(`[LS Webhook] order_created: ${orderId}, email: ${attributes?.user_email ?? attributes?.customer_email}`);

      await handleLsOrder(payload.meta, attributes, orderId);
    }

    // ─── Subscription Created ───────────────────────────────────
    if (eventName === "subscription_created") {
      const attributes = data.attributes;
      const orderId = String(data.id);
      const customerEmail = attributes?.user_email ?? attributes?.customer_email ?? "";

      if (customerEmail) {
        const variantId = String(attributes?.variant_id ?? attributes?.product_variant_id ?? "");
        // Canonical path: meta.custom_data. Legacy fallback: attributes.custom_data
        // (per LS docs, subscriptions carry customData at meta.custom_data, but
        //  defensive in case a payload has the older shape).
        const customData =
          payload.meta?.custom_data ??
          attributes?.custom_data ??
          {};
        const productSlug = customData.courseSlug ?? customData.productSlug ?? "";
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
          channelId: customData.channelId ?? null,
        });
      }

      console.log("[LS Webhook] subscription_created:", data.id);
    }

    // ── subscription_cancelled → revoke access (Order + AccessGrant atomically) ──
    // Mirror of the order_refunded pattern (see comment above). Subscription
    // events use `data.id` as the LS subscription_id, which was stored on
    // `Order.providerOrderId` by the subscription_created handler. The
    // status="completed" filter on findMany + status="active" filter on
    // accessGrant.updateMany together prevent double-revocation on re-
    // delivery: if the grant is already "revoked", the second webhook
    // hit becomes a no-op for the grant while the order's findMany
    // continues to match (then the order status flips to "failed" again
    // — idempotent under the existing idempotency gate).
    if (eventName === "subscription_cancelled") {
      const { count } = await revokeCompletedLsOrders(String(data.id), "failed");
      console.log(
        count > 0
          ? `[LS Webhook] subscription_cancelled: failed ${count} order(s) and revoked ${count} AccessGrant(s) for ${String(data.id)}`
          : `[LS Webhook] subscription_cancelled: no completed orders found for ${String(data.id)} (already revoked or never existed)`,
      );
    }

    // ── subscription_payment_failed → revoke access (Order + AccessGrant atomically) ──
    // Same pattern as subscription_cancelled above. Conceptually a
    // payment-processor-driven revocation (Stripe-equivalent for LS).
    if (eventName === "subscription_payment_failed") {
      const { count } = await revokeCompletedLsOrders(String(data.id), "failed");
      console.log(
        count > 0
          ? `[LS Webhook] subscription_payment_failed: failed ${count} order(s) and revoked ${count} AccessGrant(s) for ${String(data.id)}`
          : `[LS Webhook] subscription_payment_failed: no completed orders found for ${String(data.id)} (already revoked or never existed)`,
      );
    }

    // ─── Helper: revoke completed LS orders + their dual-written AccessGrant ───
    // Mirrors the MCR Phase 2 invariant: an Order.status and its
    // AccessGrant.status MUST agree (revoked when the order is no-longer-
    // completed), so we always update both atomically in a single
    // $transaction. This centralizes the pattern so the 3 event
    // handlers (order_refunded + subscription_cancelled +
    // subscription_payment_failed) don't drift independently.
    //
    // Params:
    //   providerOrderId — LS resource id (order.id for order_refunded,
    //                       subscription id for subscription_* events)
    //   orderStatus     — the new Order.status to set
    //                       ("refunded" for orders, "failed" for subscriptions)
    //
    // Returns: { count } where count = number of orders (and grants,
    // by atomicity) revoked. count==0 means no completed orders existed
    // (caller should log a no-op + ack).
    //
    // Idempotency:
    //   - The processedWebhook gate (above) prevents re-delivery from
    //     rerunning the handler.
    //   - Within a single delivery: findMany's status="completed"
    //     filter ensures already-revoked orders are NOT re-matched,
    //     so the updateMany is a true no-op on re-entry.
    //   - accessGrant.updateMany's status="active" filter prevents
    //     double-revocation of already-revoked grants (won't update
    //     revokedAt a second time).
    async function revokeCompletedLsOrders(
      providerOrderId: string,
      orderStatus: "refunded" | "failed",
    ): Promise<{ count: number }> {
      const ordersToRevoke = await prisma.order.findMany({
        where: {
          paymentProvider: "lemonsqueezy",
          providerOrderId,
          status: "completed",
        },
        select: { id: true },
      });

      if (ordersToRevoke.length === 0) {
        return { count: 0 };
      }

      const orderInternalIds = ordersToRevoke.map((o) => o.id);

      await prisma.$transaction([
        prisma.order.updateMany({
          where: { id: { in: orderInternalIds } },
          data: { status: orderStatus },
        }),
        prisma.accessGrant.updateMany({
          where: {
            sourceType: "order",
            sourceId: { in: orderInternalIds },
            status: "active", // don't double-revoke: skip already-revoked grants
          },
          data: {
            status: "revoked",
            revokedAt: new Date(),
          },
        }),
      ]);

      return { count: orderInternalIds.length };
    }

    // ── order_refunded → mark order as refunded AND revoke its AccessGrant ──
    // Historically the handler inlined the findMany + $transaction. With
    // 3 callers, it's now extracted into revokeCompletedLsOrders above.

    // ── order_refunded → mark order as refunded AND revoke its AccessGrant ──
    // Once MCR Phase 2 cuts over (USE_ACCESS_GRANT_RESOLVER=true), the
    // AccessGrant is the source of truth for "is this user authorized to
    // access this product" — Order.status='refunded' alone won't deny
    // access through the new resolver. The two updates run atomically
    // in a single transaction so the order and its grant always agree.
    if (eventName === "order_refunded") {
      const { count } = await revokeCompletedLsOrders(String(data.id), "refunded");
      console.log(
        count > 0
          ? `[LS Webhook] order_refunded: refunded ${count} order(s) and revoked ${count} AccessGrant(s) for ${String(data.id)}`
          : `[LS Webhook] order_refunded: no completed orders found for ${String(data.id)} (already refunded or never existed)`,
      );
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
