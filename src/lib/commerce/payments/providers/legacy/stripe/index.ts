/**
 * src/lib/commerce/payments/providers/legacy/stripe/index.ts
 *
 * Phase 1 of MCR — Legacy Stripe provider (V1.5 fallback-only).
 *
 * Behaviors:
 *   - `createCheckout` is gated by `ENABLE_STRIPE_CHECKOUT` env: if
 *     absent/false, throws `CheckoutError` with an actionable message.
 *   - The provider assumes gating is also enforced at the route layer
 *     (`src/app/api/checkout/route.ts` has a defense-in-depth gate for
 *     the same condition). This redundancy is intentional: provider
 *     failures give clearer diagnostics than a generic 400.
 *   - The webhook handler `src/app/api/webhooks/stripe/route.ts` does
 *     NOT need the gate — it processes legacy orders that pre-date the
 *     ENABLE_STRIPE_CHECKOUT flag.
 *
 * Implementation extracted from createStripeCheckout in
 * src/lib/services/checkout-service.ts. saveAbandonedCheckout was
 * separated out (orchestrator concern, not provider concern).
 */

import { env } from "@/lib/env";
import { CheckoutError, NotImplementedError } from "@/lib/errors";
import { getStripe } from "@/lib/payment/stripe";
import type {
  CheckoutSession,
  CreateCheckoutInput,
  PaymentEvent,
  PaymentProvider,
  ProviderPayment,
  RawWebhook,
} from "../../../types";

// Stripe Checkout's `locale` enum is a curated list (NOT the full
// IETF tag set). Full list as of API 2024-12 — keep in sync if Stripe
// publishes new entries (https://stripe.com/docs/api/checkout/sessions).
const SUPPORTED_STRIPE_LOCALES = [
  "ar", "bg", "cs", "da", "de", "el", "en", "es", "et", "fi", "fil",
  "fr", "he", "hr", "hu", "id", "it", "ja", "ko", "lt", "lv", "ms",
  "nb", "nl", "pl", "pt", "ro", "ru", "sk", "sl", "sv", "th", "tr",
  "vi", "zh",
] as const;

export class LegacyStripePaymentProvider implements PaymentProvider {
  readonly slug = "stripe" as const;

  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession> {
    if (env.ENABLE_STRIPE_CHECKOUT !== "true") {
      throw new CheckoutError(
        "Stripe legacy disabled (V1.5: LS is primary MoR). " +
          "Set ENABLE_STRIPE_CHECKOUT=true to enable new-session creation.",
      );
    }

    const { product, pricing, locale, userEmail, country } = input;

    if (!pricing.stripePriceId) {
      throw new CheckoutError("Missing stripePriceId for Stripe checkout");
    }

    const appUrl = env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const lang = locale.split("-")[0];
    const stripeLocale = (SUPPORTED_STRIPE_LOCALES as readonly string[]).includes(lang)
      ? lang
      : "auto";

    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price: pricing.stripePriceId,
          quantity: 1,
        },
      ],
      customer_email: userEmail || undefined,
      locale: stripeLocale as never, // Stripe types are not exhaustive across SDK versions
      allow_promotion_codes: true,
      success_url: `${appUrl}/${locale}/${product.slug}/download?lang=${locale}&order_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/${locale}/${product.slug}?canceled=1`,
      metadata: {
        productId: product.id,
        locale,
        customer_country: country ?? "",
      },
    });

    return {
      url: session.url ?? "",
      provider: "stripe",
    };
  }

  async parseWebhook(_input: RawWebhook): Promise<PaymentEvent> {
    throw new NotImplementedError(
      "stripe.parseWebhook not implemented yet (Phase 2: webhook inbox).",
      { code: "NOT_IMPLEMENTED_PHASE_2" },
    );
  }

  async retrievePayment(_reference: string): Promise<ProviderPayment> {
    throw new NotImplementedError(
      "stripe.retrievePayment not implemented yet (Phase 4: admin reconciliation).",
      { code: "NOT_IMPLEMENTED_PHASE_4" },
    );
  }
}

export const legacyStripeProvider = new LegacyStripePaymentProvider();
