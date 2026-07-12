import { prisma } from "@/lib/db/prisma";
import { CheckoutError } from "@/lib/errors";
import { paymentProviderRegistry } from "@/lib/commerce/payments/registry";
import { lemonSqueezyProvider } from "@/lib/commerce/payments/providers/lemonsqueezy";
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
type ResolvedPricing = CreateCheckoutInput["pricing"];

/**
 * Phase 1 of MCR — provider registration.
 *
 * Only LemonSqueezy is registered for new-session creation. The
 * registry throws on duplicate slug if this file is ever imported
 * twice (e.g., HMR) — that's a programmer error, surfaced loudly.
 *
 * Phase 7 cleanup: the legacy Stripe provider is no longer registered
 * for new sessions. The `legacy/stripe/index.ts` file is kept around
 * for the legacy webhook (`/api/webhooks/stripe/route.ts`) which
 * still processes pre-cutover refund/dispute events, but no new
 * checkout session is ever created via Stripe.
 */
paymentProviderRegistry.register(lemonSqueezyProvider);

/**
 * CheckoutService — orchestrator (NOT provider).
 *
 * Responsibility split (Phase 1 of MCR + Phase 7 cleanup):
 *   • Provider module (src/lib/commerce/payments/providers/lemonsqueezy):
 *       owns the network call to the upstream payment provider (LS).
 *   • Orchestrator (this class):
 *       delegates to the LS provider via the registry, captures the
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
    // ─── Lemon Squeezy (primary MoR) ─────────────────────────────
    // Single active new-session provider as of Phase 7. A product
    // without a `lemonVariantId` cannot be checked out — that's the
    // correct V1.5+ contract: every product ships with an LS variant.
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

    // ─── Fallthrough: no provider could be selected ──────────────────
    throw new CheckoutError(
      "Nessun metodo di pagamento disponibile per questo prodotto. " +
        "Configura un Lemon Squeezy variant ID sul prodotto (V1.5: LS è l'unico MoR per le nuove sessioni).",
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
    // Phase 7: provider arg is now effectively always "lemonsqueezy"
    // (Stripe new-session is removed). Keeping the union type for
    // backward compat with the cron worker that still reads
    // AbandonedCheckout.paymentProvider as a free-form string.
    void input.provider;
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
