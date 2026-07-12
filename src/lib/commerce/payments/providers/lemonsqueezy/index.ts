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
import { initLS, getStoreId } from "@/lib/payment/lemonsqueezy";
import { getUiTranslations } from "@/lib/i18n/ui-translations";
import type {
  CheckoutSession,
  CreateCheckoutInput,
  PaymentEvent,
  PaymentProvider,
  ProviderPayment,
  RawWebhook,
} from "../../types";

export class LemonSqueezyPaymentProvider implements PaymentProvider {
  readonly slug = "lemonsqueezy" as const;

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
    const lang = locale.split("-")[0];
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

  async parseWebhook(_input: RawWebhook): Promise<PaymentEvent> {
    throw new NotImplementedError(
      "lemonsqueezy.parseWebhook not implemented yet (Phase 2: webhook inbox).",
      { code: "NOT_IMPLEMENTED_PHASE_2" },
    );
  }

  async retrievePayment(_reference: string): Promise<ProviderPayment> {
    throw new NotImplementedError(
      "lemonsqueezy.retrievePayment not implemented yet (Phase 4: admin reconciliation).",
      { code: "NOT_IMPLEMENTED_PHASE_4" },
    );
  }
}

export const lemonSqueezyProvider = new LemonSqueezyPaymentProvider();
