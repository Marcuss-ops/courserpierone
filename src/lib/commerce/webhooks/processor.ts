/**
 * src/lib/commerce/webhooks/processor.ts
 *
 * Inbound-webhook orchestrator (provider-agnostic since Step 7).
 *
 * Receives a normalized `PaymentEvent` (output of `provider.parseWebhook`)
 * and dispatches to the matching domain action via the
 * `PaymentProvider.translateEvent` port. The processor itself is fully
 * provider-agnostic: there is no Lemon Squeezy–specific code here.
 *
 *   order_created            → processOrder
 *   subscription_created     → processOrder
 *   order_refunded           → revokeOrder({ status: "refunded" })
 *   subscription_cancelled   → revokeOrder({ status: "failed"   })
 *   subscription_payment_failed → revokeOrder({ status: "failed" })
 *   subscription_updated    → ignored_unsupported (audit-only, no domain write)
 *   (any other eventType)    → ignore (warn-log, no DB write)
 *
 * Provider-specific shape parsing (LS `meta.custom_data` fallback
 * chain, subscription lifecycle mapping, etc.) lives in the adapter
 * (`PaymentProvider.translateEvent`) — this module only knows about
 * `OrderCreatedEvent` / `OrderRevokedEvent` and dispatches accordingly.
 */

import { processOrder } from "@/lib/commerce/orders/complete-order";
import { revokeOrder } from "@/lib/commerce/orders/revoke-order";
import { paymentProviderRegistry } from "@/lib/commerce/payments/init";
import type {
  PaymentDomainAction,
  PaymentEvent,
} from "@/lib/commerce/payments/types";

/**
 * Move a normalized PaymentEvent into the matching domain action.
 *
 * Throws domain errors (NotFoundError, ValidationError, transient
 * upstream errors). The route handler is responsible for translating
 * those into HTTP responses; this module never speaks NextResponse.
 *
 * Idempotency: this function does NOT mutate `ProcessedWebhook`.
 * The route handler (`/api/webhooks/lemonsqueezy/route.ts` and its
 * future per-provider analogues) acquires an atomic reservation BEFORE
 * calling this function and records the terminal outcome afterward.
 * Idempotency lives at the transport layer, not here.
 */
export async function processWebhookEvent(
  event: PaymentEvent,
): Promise<PaymentDomainAction> {
  const provider = paymentProviderRegistry.get(event.provider);
  const action = provider.translateEvent(event);

  switch (action.type) {
    case "order_created":
      await processOrder(action.data);
      return action;

    case "order_revoked": {
      const { count } = await revokeOrder(action.data);
      console.log(
        count > 0
          ? `[webhook-processor] ${event.eventType}: ${action.data.orderStatus} ${count} order(s) and revoked ${count} AccessGrant(s) for ${action.data.providerOrderId}`
          : `[webhook-processor] ${event.eventType}: no completed orders found for ${action.data.providerOrderId} (already revoked or never existed)`,
      );
      return action;
    }

    case "ignore":
      console.warn(
        `[webhook-processor] Ignored event (deliveryId=${event.deliveryId}): ${action.reason}`,
      );
      return action;

    case "ignored_unsupported":
      console.warn(
        `[webhook-processor] Unsupported event (deliveryId=${event.deliveryId}): ${action.reason}`,
      );
      return action;
  }
}
