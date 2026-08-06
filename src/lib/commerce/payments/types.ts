import { z } from "zod";
import { PAYMENT_PROVIDER_SLUGS } from "@/domains/commerce";
export { PAYMENT_PROVIDER_SLUGS } from "@/domains/commerce";
import { ValidationError } from "@/lib/errors";
import {
  asCurrencyCode,
  asLocale,
  asMoneyMinorUnits,
  type CurrencyCode,
  type Locale,
  type MoneyMinorUnits,
} from "@/lib/domain-types";

/**
 * src/lib/commerce/payments/types.ts
 *
 * Phase 1 of MCR — Payment Provider types.
 *
 * Defines the canonical PaymentProvider interface and the DTOs that
 * flow through it. Lemon Squeezy implements this contract.
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
  /** Provider that produced this session — typed alias for future PRs. */
  provider: PaymentProviderSlug;
}

// ─── Phase 2 (future): parseWebhook ────────────────────────────────────
// Normalized representation of an inbound provider webhook. The webhook
// route will hand the untrusted raw body to the provider, receive the
// normalized PaymentEvent, then push it onto the inbox for async
// processing. This avoids the F5-Dec-2021 style "verify signature then
// immediately call business logic" anti-pattern.

export interface RawWebhook {
  provider: "lemonsqueezy";
  /** Provider-computed delivery id (LS: data.id + event_name). */
  deliveryId: string;
  /** Raw request body string — provider implements HMAC verification itself. */
  rawBody: string;
  /** HMAC signature header value, if the provider uses header-based signing. */
  signature?: string | null;
}

export interface PaymentEvent {
  provider: "lemonsqueezy";
  eventType: string;
  deliveryId: string;
  /** Unique provider identifier (LS order id). */
  correlationKey: string;
  payload: Record<string, unknown>;
}

// ─── Phase 4 (future): retrievePayment for admin reconciliation ───────

export interface ProviderPayment {
  provider: "lemonsqueezy";
  /** Provider-owned order identifier (LS order id) — canonical name. */
  providerOrderId: string;
  status: "pending" | "completed" | "refunded" | "failed";
  email: string;
  amountCents: number;
  currency: string;
  variantIdOrPriceId: string;
  /** Provider response — opaque, kept raw for audit. */
  raw: Record<string, unknown>;
}

// === Domain layer: provider-agnostic DTOs + port extension (Step 7) ===

/**
 * Slug tuple of every payment provider registered with this app.
 * Lives in the domain Commerce catalog (and not registry.ts) so consumers
 * can import it WITHOUT triggering the registry's module-load side-effects.
 *
 * Step 7 uses the **const-as-type** pattern: the runtime array IS the
 * source of truth, and the type is DERIVED from it. Adding a provider
 * is a one-line change to the array — the type, the registry's
 * runtime warning, and the call-site autocomplete all stay in sync
 * automatically. To extend: add `"stripe"` to the canonical
 * `src/domains/commerce/payment-provider-catalog.ts` catalog.
 *
 * Phase 1: LS-only MoR. The array currently has a single element.
 */
// Public runtime surface — registry.ts imports this for the unknown-slug
// warning check. The canonical value lives in the domain Commerce catalog.
export type PaymentProviderSlug = (typeof PAYMENT_PROVIDER_SLUGS)[number];
const paymentProviderSchema = z.enum(PAYMENT_PROVIDER_SLUGS);

/**
 * The only product references accepted by the paid-order use case.
 *
 * The discriminator makes it impossible for a caller to provide an
 * ambiguous combination of product id, public slug and provider variant.
 * Resolution is performed exactly once from the selected branch.
 */
export type ProductLocator =
  | { kind: "product_id"; value: string }
  | { kind: "product_slug"; value: string }
  | { kind: "variant_id"; value: string };

/**
 * Canonical command for the verified payment → order → grant flow.
 *
 * This command is deliberately stricter than provider payloads: it can only
 * be created after a provider has supplied a non-empty order id and exactly
 * one product locator. `createCompletePaidOrderCommand` is the runtime gate
 * at the provider/process boundary.
 */
export interface CompletePaidOrderCommand {
  paymentProvider: PaymentProviderSlug;
  providerOrderId: string;
  product: ProductLocator;
  customer: {
    email: string;
    name?: string;
  };
  amount: MoneyMinorUnits;
  currency: CurrencyCode;
  locale: Locale;
  customerCountry?: string | null;
  channelId?: string | null;
}

const productLocatorSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("product_id"), value: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("product_slug"), value: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("variant_id"), value: z.string().min(1) }).strict(),
]);

const completePaidOrderCommandSchema = z
  .object({
    paymentProvider: paymentProviderSchema,
    providerOrderId: z.string().min(1),
    product: productLocatorSchema,
    customer: z
      .object({
        email: z.string().email(),
        name: z.string().optional(),
      })
      .strict(),
    amount: z.number().int().nonnegative(),
    currency: z.string().min(1),
    locale: z.string().min(1),
    customerCountry: z.string().nullable().optional(),
    channelId: z.string().nullable().optional(),
  })
  .strict();

function normalizeLocaleForCommand(value: string): Locale {
  const [language, region] = value.split("-");
  return asLocale(
    region
      ? `${language.toLowerCase()}-${region.toUpperCase()}`
      : language.toLowerCase(),
  );
}

/**
 * Runtime boundary for the paid-order command. Provider adapters call this
 * after signature verification; processOrder calls it again defensively so
 * untyped queue/replay callers cannot bypass the contract.
 */
export function createCompletePaidOrderCommand(
  input: unknown,
): CompletePaidOrderCommand {
  const parsed = completePaidOrderCommandSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      `Invalid CompletePaidOrderCommand: ${parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "command"} ${issue.message}`)
        .join(", ")}`,
    );
  }

  return {
    ...parsed.data,
    amount: asMoneyMinorUnits(parsed.data.amount),
    currency: asCurrencyCode(parsed.data.currency.toUpperCase()),
    locale: normalizeLocaleForCommand(parsed.data.locale),
  };
}

/**
 * Provider-agnostic action payload for a completed order. Kept as a named
 * alias so webhook adapters/tests can describe the domain action without
 * reintroducing the old multi-locator DTO.
 */
export type OrderCreatedEvent = CompletePaidOrderCommand;

/**
 * Provider-agnostic DTO for order- or subscription-revocation events.
 * Used by `revokeOrder()` in orders/revoke-order.ts via the same
 * `paymentProvider`+`providerOrderId` lookup pattern as the creation
 * path.
 */
export interface OrderRevokedEvent {
  paymentProvider: PaymentProviderSlug;
  providerOrderId: string;
  /**
   * Matches `RevokeOrderInput.orderStatus` (revoke-order.ts) so the
   * webhook processor can pass `OrderRevokedEvent` directly to
   * `revokeOrder(...)` without a re-mapping step. The earlier `status`
   * field name collided semantically with the Prisma `Order.status`
   * column and forced the processor to log/inspect `action.data.status`
   * while `revokeOrder` expected `orderStatus`.
   */
  orderStatus: "refunded" | "failed";
}

/**
 * Discriminated-union output of `PaymentProvider.translateEvent`. The
 * webhook processor switches on `type` and dispatches:
 *   - `order_created`   → processOrder(event.data)
 *   - `order_revoked`   → revokeOrder(event.data)
 *   - `ignore`          → no-op for an unknown/non-domain event
 *   - `ignored_unsupported` → terminal audit state without functional completion
 * Adding a new event category means adding a new union variant — the
 * processor's switch will surface the missing case at compile time.
 */
export type PaymentDomainAction =
  | { type: "order_created"; data: OrderCreatedEvent }
  | { type: "order_revoked"; data: OrderRevokedEvent }
  | { type: "ignore"; reason: string }
  | { type: "ignored_unsupported"; reason: string };

// ─── The contract ─────────────────────────────────────────────────────

export interface PaymentProvider {
  /**
   * Stable registry key. Typed as `string` (NOT `PaymentProviderSlug`) so
   * test stubs and future providers can register without first extending
   * the alias union. The `PaymentProviderSlug` alias is still the
   * discriminant at the *call site* (e.g. `CheckoutSession.provider`,
   * `OrderRevokedEvent.paymentProvider`) where it carries a real
   * type-system signal.
   */
  readonly slug: string;

  /**
   * Create a hosted-checkout session and return the redirect URL.
   * Provider MUST throw `CheckoutError` (400-range) on bad inputs and
   * `PaymentError` (502) on upstream provider failure.
   */
  createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession>;

  /**
   * Verify HMAC and normalize a webhook payload into a `PaymentEvent`.
   * Throws `HmacVerificationError` / `InvalidJsonError` / `WebhookAckError`
   * for terminal-class failures — the route handler translates these
   * to the appropriate HTTP response (400 / 400 / 200-ack).
   */
  parseWebhook(input: RawWebhook): Promise<PaymentEvent>;

  /**
   * Translate a normalized `PaymentEvent` (already HMAC-verified and
   * JSON-parsed by `parseWebhook`) into a `PaymentDomainAction`.
   * The translation encapsulates provider-specific payload shape
   * (LS custom_data fallback chain, subscription lifecycle, etc.)
   * behind a stable interface so the webhook processor stays
   * provider-agnostic. Step 7 of the audit moves ownership of these
   * provider-specific shapes into the adapter module.
   *
   * Returns `{ type: "ignore", reason }` for events that pass HMAC
   * but are not relevant to the order/accessGrant pipeline (LS test
   * pings, future event types, malformed-but-ackable payloads).
   */
  translateEvent(event: PaymentEvent): PaymentDomainAction;

  /**
   * Fetch a payment by its provider order id (admin reconciliation).
   * Stub in this PR (Phase 4: reconciliation).
   */
  retrievePayment(providerOrderId: string): Promise<ProviderPayment>;
}
