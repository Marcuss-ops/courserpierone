/**
 * src/lib/commerce/payments/providers/lemonsqueezy/index.ts
 *
 * Phase 1 of MCR — Lemon Squeezy provider implementation.
 *
 * Extracted verbatim from src/lib/services/checkout-service.ts, with
 * one structural change: `saveAbandonedCheckout` is no longer called
 * inside this provider. Provider methods return ONLY a CheckoutSession;
 * the orchestrator (CheckoutService) decides whether to write an
 * AbandonedCheckout row after URL arrives. This separation aligns
 * with the modular monolith rule:
 *
 *   "Provider concerns = createCheckout/parseWebhook/retrievePayment."
 *   "Orchestration concerns = abandoned-cart side-effects, recovery, etc."
 *
 * `parseWebhook` and `retrievePayment` are stubbed with explicit
 * PaymentError NOT_IMPLEMENTED_PHASE_* so the missing capability is
 * loud at runtime, not silently null-returned. See src/lib/commerce/
 * payments/types.ts for the full surface contract.
 */

import { createCheckout as lsCreateCheckout } from "@lemonsqueezy/lemonsqueezy.js";
import { env } from "@/lib/env";
import { CheckoutError, NotImplementedError } from "@/lib/errors";
import { initLS, getStoreId, getWebhookSecret } from "@/lib/payment/lemonsqueezy";
import { getUiTranslations } from "@/lib/i18n/ui-translations";
import { localeToLanguage } from "@/lib/i18n/locale-resolver";
import { verifyHmacSignature } from "@/lib/commerce/webhooks/verifier";
import {
  InvalidJsonError,
  WebhookAckError,
} from "@/lib/commerce/webhooks/error-classifier";
import type {
  CheckoutSession,
  CreateCheckoutInput,
  OrderCreatedEvent,
  OrderRevokedEvent,
  PaymentDomainAction,
  PaymentEvent,
  PaymentProvider,
  ProviderPayment,
  RawWebhook,
} from "../../types";

// ===== LS provider-private shape (Step 7) =====
// Kept module-private: processors and orchestrators consume only the
// domain DTOs returned by translateEvent(), never the raw LS payload.

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

/**
 * Canonical LS events the adapter translates into a domain action.
 * Drift-guard for tests: the set must stay in sync with the switch in
 * `extractOrderCreated` / `extractOrderRevoked` below — adding a new
 * event means adding the mapping here AND extending the switch.
 */
export const LS_EVENT_PROCESSABLE = new Set([
  "order_created",
  "subscription_created",
  "order_refunded",
  "subscription_cancelled",
  "subscription_payment_failed",
]);

export class LemonSqueezyPaymentProvider implements PaymentProvider {
  readonly slug = "lemonsqueezy" as const;

  /**
   * Translate a parsed+verified LS event into a domain action.
   *
   * Imports the LS-specific payload shape (LsOrderAttributes /
   * LsCustomData fallback chain) and emits the provider-agnostic
   * OrderCreatedEvent / OrderRevokedEvent used by orders/.
   *
   * Events the adapter doesn't recognize (test pings, future LS event
   * types arriving before this provider is updated) quietly return
   * `{ type: "ignore", reason }` so the webhook processor logs a
   * warning rather than crashing.
   */
  translateEvent(event: PaymentEvent): PaymentDomainAction {
    switch (event.eventType) {
      case "order_created":
      case "subscription_created":
        return translateOrderCreated(event);
      case "order_refunded":
        return translateOrderRevoked(event, "refunded");
      case "subscription_cancelled":
      case "subscription_payment_failed":
        return translateOrderRevoked(event, "failed");
      default:
        return {
          type: "ignore",
          reason: `Unhandled event type: ${event.eventType} (deliveryId=${event.deliveryId})`,
        };
    }
  }

  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession> {
    const { product, pricing, locale, userEmail, channelId } = input;

    const storeId = product.lemonStoreId ?? getStoreId();
    if (!storeId) {
      throw new CheckoutError(
        "Lemon Squeezy store not configured. Set LEMONSQUEEZY_STORE_ID in .env or lemonStoreId on the product.",
      );
    }

    initLS();

    const variantId = parseInt(pricing.lemonVariantId ?? "", 10);
    if (Number.isNaN(variantId)) {
      throw new CheckoutError("Invalid lemonVariantId");
    }

    const customData: Record<string, string> = {
      courseSlug: product.slug,
      locale,
    };
    if (userEmail) customData.email = userEmail;
    if (channelId) customData.channelId = channelId;

    const appUrl = env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const redirectUrl = `${appUrl}/${locale}/${product.slug}/download?lang=${locale}&order_id=[order_id]`;

    // Localize Lemon Squeezy hosted-checkout receipt button text so ES/FR
    // buyers see "Descargar tu libro" / "Téléchargez votre livre" instead
    // of the previous hardcoded Italian. Falls back to English via the
    // FALLBACK chain in getUiTranslations.
    const lang = localeToLanguage(locale);
    const receiptButtonText = getUiTranslations(lang).dlTitle;

    const checkout = await lsCreateCheckout(storeId, variantId, {
      checkoutData: {
        email: userEmail || undefined,
        custom: customData,
        discountCode: pricing.discountCode,
      },
      productOptions: {
        redirectUrl,
        receiptButtonText,
        receiptLinkUrl: redirectUrl,
      },
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    });

    if (checkout.error || !checkout.data) {
      throw new CheckoutError("Checkout creation failed");
    }

    return {
      url: checkout.data.data.attributes.url,
      provider: "lemonsqueezy",
    };
  }

  async parseWebhook(input: RawWebhook): Promise<PaymentEvent> {
    // 1. HMAC verification using crypto.timingSafeEqual. Throws
    //    HmacVerificationError on missing/invalid signature; the
    //    route handler translates that into a 400 response.
    verifyHmacSignature({
      rawBody: input.rawBody,
      signature: input.signature ?? null,
      secret: getWebhookSecret(),
    });

    // 2. JSON parse. Malformed body is a deterministic 4xx — the
    //    provider can stop retrying immediately. Use the dedicated
    //    `InvalidJsonError` so the route classifier routes it to 400
    //    (NOT to the 200-ack branch that handles business errors).
    let payload: unknown;
    try {
      payload = JSON.parse(input.rawBody);
    } catch {
      throw new InvalidJsonError();
    }

    // 3. Shape check. LS always wraps events as { meta, data }. Missing
    //    fields mean the payload is either malformed or a test ping —
    //    ack-style (200) per LS docs so deliveries stop piling up.
    const meta = (payload as { meta?: { event_name?: string } }).meta;
    const data = (payload as {
      data?: { id?: string | number };
    }).data;
    const eventName = meta?.event_name;
    const dataId = data?.id;

    if (!eventName || dataId === undefined || dataId === null) {
      // LS sends ping-style payloads (test or pre-subscription) with
      // meta.event_name missing. Per LS docs, the correct response is
      // 200 with no side effect — signal to the route to ack and stop
      // retries. WebhookAckError triggers that exact flow without
      // recording a ProcessedWebhook row.
      throw new WebhookAckError(
        "LS webhook missing meta.event_name or data.id — silently acked",
      );
    }

    // 4. Normalize to PaymentEvent. The deliveryId is the LS-equivalent
    //    of Stripe's `event.id` — composite of (resource id + event_name)
    //    so re-deliveries of the same event produce the same key.
    const deliveryId = `LS-${String(dataId)}-${eventName}`;

    return {
      provider: "lemonsqueezy",
      eventType: eventName,
      deliveryId,
      // correlationKey is the resource id (LS order_id for order events,
      // LS subscription_id for subscription events). The processor uses
      // this to find the matching Order row.
      correlationKey: String(dataId),
      payload: payload as Record<string, unknown>,
    };
  }

  async retrievePayment(_reference: string): Promise<ProviderPayment> {
    throw new NotImplementedError(
      "lemonsqueezy.retrievePayment not implemented yet (Phase 4: admin reconciliation).",
      { code: "NOT_IMPLEMENTED_PHASE_4" },
    );
  }
}

export const lemonSqueezyProvider = new LemonSqueezyPaymentProvider();

// ===== Module-private translation helpers =====

/**
 * Map an `order_created` / `subscription_created` LS event to the
 * provider-agnostic `OrderCreatedEvent`. Encapsulates the LS-shape
 * fallback chain so the webhook processor / orders/* never know
 * about `meta.custom_data` vs `first_order_item.product_options.custom_data`.
 */
function translateOrderCreated(event: PaymentEvent): PaymentDomainAction {
  const { payload, correlationKey } = event;
  const data = (payload as { data?: { attributes?: LsOrderAttributes } }).data;
  const meta = (payload as { meta?: { custom_data?: LsCustomData } }).meta;
  const attributes = data?.attributes;

  if (!attributes) {
    // Missing attributes LS-side: ignore-ack via the same channel the
    // processor would use; route handler logs + returns 200.
    return {
      type: "ignore",
      reason: `LS order_created payload missing data.attributes (deliveryId=${event.deliveryId})`,
    };
  }

  const customerEmail = attributes.user_email ?? attributes.customer_email ?? "";
  if (!customerEmail) {
    return {
      type: "ignore",
      reason: `Missing customer email in LS event ${event.deliveryId}`,
    };
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

  return {
    type: "order_created",
    data: {
      paymentProvider: "lemonsqueezy",
      providerOrderId: correlationKey,
      email: customerEmail,
      customerName: attributes.user_name ?? "",
      productSlug: customData.courseSlug ?? customData.productSlug ?? "",
      variantId,
      amount: attributes.total ?? 0,
      currency: attributes.currency ?? "usd",
      locale: customData.locale ?? "it",
      customerCountry:
        attributes.customer_country ?? attributes.country ?? null,
      channelId: customData.channelId ?? null,
    },
  };
}

/**
 * Map `order_refunded` / `subscription_cancelled` / `subscription_payment_failed`
 * LS events to the provider-agnostic `OrderRevokedEvent`.
 */
function translateOrderRevoked(
  event: PaymentEvent,
  status: "refunded" | "failed",
): PaymentDomainAction {
  return {
    type: "order_revoked",
    data: {
      paymentProvider: "lemonsqueezy",
      providerOrderId: event.correlationKey,
      orderStatus: status,
    },
  };
}
