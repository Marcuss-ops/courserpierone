/**
 * src/lib/commerce/payments/types.ts
 *
 * Phase 1 of MCR — Payment Provider types.
 *
 * Defines the canonical PaymentProvider interface and the DTOs that
 * flow through it. Both providers (Lemon Squeezy and the legacy
 * Stripe fallback) implement this contract.
 *
 * Surface scope:
 *   - `createCheckout`  — fully implemented for both providers in this PR.
 *   - `parseWebhook`    — stub for Phase 2 (Webhook Inbox + retry queue).
 *   - `retrievePayment` — stub for Phase 4 (admin reconciliation endpoint).
 *
 * The stub methods throw `PaymentError { code: NOT_IMPLEMENTED_PHASE_* }`
 * so consumers get a clear, signal-rich failure rather than a silent
 * NotImplemented. Phase 2 + Phase 4 PRs will replace the stubs with
 * real implementations without touching the public interface.
 *
 * Naming convention follows the existing project pattern (interfaces
 * live alongside consumers in `src/lib/<domain>/<concept>/types.ts`,
 * not in `src/types/` or a global barrel — see also
 * src/lib/messaging/resolve-message-permission.ts for the parallel
 * pattern of resolving-vs-deferring design responsibility).
 */

// ─── Phase 1 (this PR): createCheckout inputs/outputs ────────────────

export interface CreateCheckoutInput {
  /** Product identity used to resolve the provider variant. */
  product: {
    id: string;
    slug: string;
    /** Optional per-product override for the LS store (rarely needed). */
    lemonStoreId?: string | null;
  };
  /** Pricing/pricing-identifier resolved upstream by PricingService. */
  pricing: {
    lemonVariantId?: string | null;
    stripePriceId?: string | null;
    discountCode?: string;
  };
  /** Locale at time of checkout, e.g. "it-it", "en-us". */
  locale: string;
  /** Optional buyer email — captured pre-checkout by Phase 3 CheckoutIntent. */
  userEmail?: string;
  /** YouTube channel attribution (YouTubeChannel.id). */
  channelId?: string;
  /** ISO 3166-1 alpha-2 country code, optional. */
  country?: string | null;
}

export interface CheckoutSession {
  url: string;
  provider: "lemonsqueezy" | "stripe";
}

// ─── Phase 2 (future): parseWebhook ────────────────────────────────────
// Normalized representation of an inbound provider webhook. The webhook
// route will hand the untrusted raw body to the provider, receive the
// normalized PaymentEvent, then push it onto the inbox for async
// processing. This avoids the F5-Dec-2021 style "verify signature then
// immediately call business logic" anti-pattern.

export interface RawWebhook {
  provider: "lemonsqueezy" | "stripe";
  /** Provider-computed delivery id (LS: data.id + event_name, Stripe: event.id). */
  deliveryId: string;
  /** Raw request body string — provider implements HMAC verification itself. */
  rawBody: string;
  /** HMAC signature header value, if the provider uses header-based signing. */
  signature?: string | null;
}

export interface PaymentEvent {
  provider: "lemonsqueezy" | "stripe";
  eventType: string;
  deliveryId: string;
  /** Unique provider identifier (LS order id, Stripe payment_intent/session id). */
  correlationKey: string;
  payload: Record<string, unknown>;
}

// ─── Phase 4 (future): retrievePayment for admin reconciliation ───────

export interface ProviderPayment {
  provider: "lemonsqueezy" | "stripe";
  reference: string;
  status: "pending" | "completed" | "refunded" | "failed";
  email: string;
  amountCents: number;
  currency: string;
  variantIdOrPriceId: string;
  /** Provider response — opaque, kept raw for audit. */
  raw: Record<string, unknown>;
}

// ─── The contract ─────────────────────────────────────────────────────

export interface PaymentProvider {
  /** Stable registry key (used by `paymentProviderRegistry.get(slug)`). */
  readonly slug: string;

  /**
   * Create a hosted-checkout session and return the redirect URL.
   * Provider MUST throw `CheckoutError` (400-range) on bad inputs and
   * `PaymentError` (502) on upstream provider failure.
   */
  createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession>;

  /**
   * Verify HMAC and normalize a webhook payload into a `PaymentEvent`.
   * Stub in this PR (Phase 2: webhook inbox).
   */
  parseWebhook(input: RawWebhook): Promise<PaymentEvent>;

  /**
   * Fetch a payment by provider reference (admin reconciliation).
   * Stub in this PR (Phase 4: reconciliation).
   */
  retrievePayment(reference: string): Promise<ProviderPayment>;
}
