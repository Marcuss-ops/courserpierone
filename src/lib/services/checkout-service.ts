import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { CheckoutError } from "@/lib/errors";
import { paymentProviderRegistry } from "@/lib/commerce/payments/registry";
import { lemonSqueezyProvider } from "@/lib/commerce/payments/providers/lemonsqueezy";
import { legacyStripeProvider } from "@/lib/commerce/payments/providers/legacy/stripe";
import type {
  CheckoutSession,
  CreateCheckoutInput,
} from "@/lib/commerce/payments/types";

/**
 * Prodotto opaco passato al provider — mantiene la shape minima che
 * entrambi i provider si aspettano (id, slug, lemonStoreId opzionale).
 * Il tipo completo Product non è importato qui per evitare un ciclo
 * Prisma → services a livello di import-time.
 */
export type CheckoutProduct = CreateCheckoutInput["product"];

/**
 * Pricing risolta dal PricingService — mantiene la shape usata dai
 * provider per determinare il `variantId` / `priceId` da invocare.
 */
export type ResolvedPricing = CreateCheckoutInput["pricing"];

/**
 * Phase 1 of MCR — provider registration.
 *
 * Both providers are registered exactly once at module-load. The
 * registry throws on duplicate slug if this file is ever imported
 * twice (e.g., HMR) — that's a programmer error, surfaced loudly.
 *
 * In production the only active new-session provider is LemonSqueezy;
 * `legacyStripeProvider` is registered too but refuses actual checkout
 * creation when `ENABLE_STRIPE_CHECKOUT` is not 'true' (V1.5 fallback).
 */
paymentProviderRegistry.register(lemonSqueezyProvider);
paymentProviderRegistry.register(legacyStripeProvider);

/**
 * CheckoutService — orchestrator (NOT provider).
 *
 * Responsibility split (Phase 1 of MCR):
 *   • Provider module (src/lib/commerce/payments/providers/<slug>/):
 *       owns the network call to the upstream payment provider.
 *   • Orchestrator (this class):
 *       decides which provider runs (priority rules), captures the
 *       `AbandonedCheckout` row AFTER the URL has been generated
 *       (so abandoned carts are recovered even when checkout creation
 *       succeeds but the redirect is never followed), and shapes the
 *       error surface upstream.
 *
 * Note: this class NO LONGER instantiates Stripe/Lemon Squeezy clients
 * nor constructs checkout requests inline — those concerns have moved
 * into the providers. The orchestrator's only "in-flight" computation
 * is the abandoned-cart side-effect after URL arrives.
 */
export class CheckoutService {
  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession> {
    // ─── Priority 1: Lemon Squeezy (preferred, primary MoR) ───────────
    // When a product carries a `lemonVariantId`, LS wins regardless of
    // the Stripe gate. This preserves the V1.5 contract documented in
    // src/app/api/checkout/route.ts.
    if (input.pricing.lemonVariantId) {
      const session = await paymentProviderRegistry
        .get("lemonsqueezy")
        .createCheckout(input);
      await this.saveAbandonedCheckout({
        product: input.product,
        locale: input.locale,
        userEmail: input.userEmail,
        url: session.url,
        provider: "lemonsqueezy",
      });
      return session;
    }

    // ─── Priority 2: Legacy Stripe fallback (V1.5 gated) ─────────────
    // Only active when ENABLE_STRIPE_CHECKOUT=true AND the product has
    // a stripePriceId. The provider itself enforces the gate — the
    // route also gates upstream for diagnostic clarity on the failure
    // path (`No provider available` gets a more specific message).
    if (
      env.ENABLE_STRIPE_CHECKOUT === "true" &&
      input.pricing.stripePriceId
    ) {
      const session = await paymentProviderRegistry
        .get("stripe")
        .createCheckout(input);
      await this.saveAbandonedCheckout({
        product: input.product,
        locale: input.locale,
        userEmail: input.userEmail,
        url: session.url,
        provider: "stripe",
      });
      return session;
    }

    // ─── Fallthrough: no provider could be selected ──────────────────
    throw new CheckoutError(
      "Nessun metodo di pagamento disponibile per questo prodotto. " +
        "Configura un Lemon Squeezy variant ID (consigliato) oppure, per " +
        "il fallback legacy Stripe, imposta ENABLE_STRIPE_CHECKOUT=true.",
    );
  }

  /**
   * Capture the (email, product, checkoutUrl) triple behind the soon-to-
   * be-replaced `AbandonedCheckout` table so that the cron worker can
   * send a recovery email if the redirect is never followed.
   *
   * Side-effect-tolerant: failures here MUST NOT fail the checkout.
   * The `processOrder` happy-path will flip matching rows to
   * `status='recovered'` after a successful payment.
   *
   * Isolated from providers to keep the registry boundary clean —
   * there's no good reason for a LemonSqueezy provider implementation
   * to know about Postgres side-effects.
   */
  private async saveAbandonedCheckout(input: {
    product: CheckoutProduct;
    locale: string;
    userEmail?: string;
    url: string;
    provider: "lemonsqueezy" | "stripe";
  }): Promise<void> {
    if (!input.userEmail) return;

    try {
      const existing = await prisma.abandonedCheckout.findFirst({
        where: {
          email: input.userEmail,
          productId: input.product.id,
          status: "pending",
        },
      });

      if (existing) {
        await prisma.abandonedCheckout.update({
          where: { id: existing.id },
          data: {
            checkoutUrl: input.url,
            locale: input.locale,
            paymentProvider: input.provider,
          },
        });
      } else {
        await prisma.abandonedCheckout.create({
          data: {
            email: input.userEmail,
            productId: input.product.id,
            locale: input.locale,
            paymentProvider: input.provider,
            checkoutUrl: input.url,
            status: "pending",
          },
        });
      }
    } catch (err) {
      // Non-critical: log but don't fail checkout. Operationally the
      // cron worker can re-surface abandoned carts via the existing
      //   /api/cron/abandoned-checkouts
      // endpoint which has its own dedupe on (email, productId).
      console.error("[CheckoutService] Failed to track abandoned checkout:", err);
    }
  }
}

// ─── Re-exports for ergonomics ───────────────────────────────────────
//
// Existing callers (`src/app/api/checkout/route.ts`) import the type
// from "./checkout-service" — keep those imports stable for one PR.
// Future consumers should import from "@/lib/commerce/payments/types"
// directly.
export type { CreateCheckoutInput, CheckoutSession };
