import { prisma } from "@/lib/db/prisma";
import { CheckoutError } from "@/lib/errors";
// Step 7: import the registry from payments/init.ts so the LS-provider
// registration side-effect runs exactly once, regardless of which
// module pulls the registry into the bundle (route, orchestrator,
// etc.). Direct `register(lemonSqueezyProvider)` here would couple
// orchestrator code to the concrete LS adapter and prevent the port
// pattern from holding together.
import { paymentProviderRegistry } from "@/lib/commerce/payments/init";
import type {
  CheckoutSession,
  CreateCheckoutInput,
  PaymentProviderSlug,
} from "@/lib/commerce/payments/types";

/**
 * Prodotto opaco passato al provider — mantiene la shape minima che
 * entrambi i provider si aspettano (id, slug, lemonStoreId opzionale).
 * Il tipo completo Product non è importato qui per evitare un ciclo
 * Prisma → services a livello di import-time.
 */
export type CheckoutProduct = CreateCheckoutInput["product"];

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
 * Note: this class NO LONGER instantiates Lemon Squeezy clients
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
        paymentProvider: "lemonsqueezy",
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
    paymentProvider: PaymentProviderSlug;
  }): Promise<void> {
    // Phase 1 of MCR + Step 7: AbandonedCheckout rows now carry the
    // `paymentProvider` resolved by the orchestrator (the only module
    // that knows which provider produced the checkout). The cron
    // worker (and any historical data migration scripts) read the
    // provider slug back as a string — no LS-only literal here.
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
            paymentProvider: input.paymentProvider,
          },
        });
      } else {
        await prisma.abandonedCheckout.create({
          data: {
            email: input.userEmail,
            productId: input.product.id,
            locale: input.locale,
            paymentProvider: input.paymentProvider,
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
