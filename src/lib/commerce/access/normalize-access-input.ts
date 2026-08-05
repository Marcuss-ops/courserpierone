/**
 * src/lib/commerce/access/normalize-access-input.ts
 *
 * SINGLE normalizing adapter for `/api/access` inputs (canonical order
 * identity). The route must NOT guess how to key orders — this adapter
 * disambiguates the legacy `orderId` field (which historically could
 * carry EITHER an internal `Order.id` OR a provider order id) into the
 * canonical `{ internalOrderId, providerOrderId }` contract before
 * anything reaches `resolveProductAccess`.
 *
 * Rules (this adapter is the ONLY place that maps legacy → canonical;
 * pages/consumers must never reimplement this logic):
 *
 *   1. `providerOrderId` present → forwarded explicitly (canonical).
 *      It also WINS when `orderId` is present too (explicit beats
 *      legacy/ambiguous).
 *   2. `orderId` present → treated as an internal `Order.id` and
 *      forwarded as `internalOrderId`. If the value does NOT look like
 *      an internal id (Prisma cuid), a `console.warn` flags the legacy
 *      misuse (a provider id smuggled through `orderId`). The value is
 *      forwarded unchanged — the resolver treats `internalOrderId`
 *      strictly as the internal primary key, so a provider id passed
 *      this way fails closed (`order_not_found`).
 *   3. Neither → `{ productId }` only.
 *
 * Empty strings are treated as absent (query params can be `""`).
 */

/** Prisma cuid v1 shape used for internal Order.id values. */
const INTERNAL_ID_RE = /^c[0-9a-z]{24}$/;

export interface LegacyAccessInput {
  productId: string;
  orderId?: string;
  providerOrderId?: string;
}

export interface CanonicalAccessInput {
  productId: string;
  /** Internal `Order.id` only — never a provider id. */
  internalOrderId?: string;
  providerOrderId?: string;
}

export function normalizeAccessInput(
  input: LegacyAccessInput,
): CanonicalAccessInput {
  if (input.providerOrderId) {
    return {
      productId: input.productId,
      providerOrderId: input.providerOrderId,
    };
  }

  if (input.orderId) {
    if (!INTERNAL_ID_RE.test(input.orderId)) {
      console.warn(
        `[legacy] External provider identifier received through orderId: ${input.orderId} — ` +
          "pass providerOrderId explicitly for the canonical path",
      );
    }
    return {
      productId: input.productId,
      internalOrderId: input.orderId,
    };
  }

  return { productId: input.productId };
}
