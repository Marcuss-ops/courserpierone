/**
 * src/lib/commerce/webhooks/processor.ts
 *
 * Inbound-webhook orchestrator. Receives a normalized `PaymentEvent`
 * (output of `provider.parseWebhook`) and dispatches to the matching
 * domain action:
 *
 *   - order_created            → processOrder
 *   - subscription_created     → processOrder
 *   - order_refunded           → revokeOrder({ status: "refunded" })
 *   - subscription_cancelled   → revokeOrder({ status: "failed"   })
 *   - subscription_payment_failed → revokeOrder({ status: "failed" })
 *
 * The processor is intentionally provider-agnostic in shape (it only
 * reads `event.eventType` + LS-flattened `event.payload`); future
 * providers emit their own eventType taxonomy and the dispatcher grows.
 *
 * The 3 revoke event variants funnel through the same domain action
 * (`revokeOrder`) — symmetric to how the 2 order-creation events
 * funnel through `processOrder`. This collapse prevents the
 * "3 nearly-identical revoke branches" drift the old route had.
 */

import { processOrder } from "@/lib/commerce/orders/complete-order";
import { revokeOrder } from "@/lib/commerce/orders/revoke-order";
import type { PaymentEvent } from "@/lib/commerce/payments/types";

/**
 * Map of LS order attribute payload shape (subset needed for processOrder).
 * Kept inline — extracted only when a third provider ships.
 */
interface LsOrderAttributes {
  user_email?: string;
  customer_email?: string;
  user_name?: string;
  total?: number;
  currency?: string;
  customer_country?: string;
  country?: string;
  variant_id?: number;
  product_variant_id?: number;
  first_order_item?: {
    variant_id?: number;
    product_options?: { custom_data?: Record<string, string> };
  };
  custom_data?: Record<string, string>;
}

interface LsCustomData {
  courseSlug?: string;
  productSlug?: string;
  locale?: string;
  channelId?: string;
}

const LS_EVENT_PROCESSABLE = new Set([
  "order_created",
  "subscription_created",
  "order_refunded",
  "subscription_cancelled",
  "subscription_payment_failed",
]);

/**
 * Move a normalized PaymentEvent into the matching domain action.
 *
 * Throws domain errors (NotFoundError, ValidationError, transient
 * upstream errors). The route handler is responsible for translating
 * those into HTTP responses; this module never speaks NextResponse.
 */
export async function processWebhookEvent(event: PaymentEvent): Promise<void> {
  const { eventType } = event;

  if (!LS_EVENT_PROCESSABLE.has(eventType)) {
    console.warn(
      `[webhook-processor] Unhandled event type: ${eventType} (deliveryId=${event.deliveryId})`,
    );
    return;
  }

  switch (eventType) {
    case "order_created":
    case "subscription_created":
      return handleOrderOrSubscriptionCreated(event);
    case "order_refunded":
      return revokeByEvent(event, "refunded");
    case "subscription_cancelled":
    case "subscription_payment_failed":
      return revokeByEvent(event, "failed");
    default:
      // Defensive: LS_EVENT_PROCESSABLE gated it, but TS doesn't know.
      return;
  }
}

async function handleOrderOrSubscriptionCreated(
  event: PaymentEvent,
): Promise<void> {
  const { payload, correlationKey } = event;
  const data = (payload as { data?: { attributes?: LsOrderAttributes } }).data;
  const meta = (payload as { meta?: { custom_data?: LsCustomData } }).meta;
  const attributes = data?.attributes;

  if (!attributes) {
    throw new Error("LS order_created payload missing data.attributes");
  }

  const customerEmail = attributes.user_email ?? attributes.customer_email ?? "";
  if (!customerEmail) {
    console.error(
      `[webhook-processor] Missing customer email in LS event ${event.deliveryId}`,
    );
    return;
  }

  // Canonical LS customData path: meta.custom_data. Defensive fallback
  // to first_order_item.product_options.custom_data (older payloads,
  // pre-2024) and attributes.custom_data (subscription path variant).
  const customData: LsCustomData =
    meta?.custom_data ??
    attributes.first_order_item?.product_options?.custom_data ??
    attributes.custom_data ??
    {};

  const variantId = String(
    attributes.first_order_item?.variant_id ??
      attributes.variant_id ??
      attributes.product_variant_id ??
      "",
  );

  await processOrder({
    email: customerEmail,
    customerName: attributes.user_name ?? "",
    productSlug: customData.courseSlug ?? customData.productSlug ?? "",
    variantId,
    providerOrderId: correlationKey,
    paymentProvider: "lemonsqueezy",
    amount: attributes.total ?? 0,
    currency: attributes.currency ?? "usd",
    locale: customData.locale ?? "it",
    customerCountry:
      attributes.customer_country ?? attributes.country ?? null,
    channelId: customData.channelId ?? null,
  });
}

async function revokeByEvent(
  event: PaymentEvent,
  orderStatus: "refunded" | "failed",
): Promise<void> {
  const { count } = await revokeOrder({
    paymentProvider: "lemonsqueezy",
    providerOrderId: event.correlationKey,
    orderStatus,
  });
  console.log(
    count > 0
      ? `[webhook-processor] ${event.eventType}: ${orderStatus} ${count} order(s) and revoked ${count} AccessGrant(s) for ${event.correlationKey}`
      : `[webhook-processor] ${event.eventType}: no completed orders found for ${event.correlationKey} (already revoked or never existed)`,
  );
}
