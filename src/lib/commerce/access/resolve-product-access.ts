/**
 * src/lib/commerce/access/resolve-product-access.ts
 *
 * Centralized product access resolver. SINGLE SOURCE OF TRUTH for
 * "does this user have access to this product?" — every consumer
 * (course portal, dashboard, certificate, ebook download, progress,
 * messaging permission, GET /api/access) routes through this function
 * instead of duplicating Order/AccessGrant queries inline.
 *
 * ─── Result contract (this revision) ──────────────────────────
 *
 * Uniform result shape:
 *
 *   { hasAccess: boolean; reason: ProductAccessReason; productId: string; orderId: string | null }
 *
 *   - `hasAccess` is the verdict consumers branch on.
 *   - `reason` classifies WHY (actionable for UX: show "payment
 *     pending" screen vs "buy now" vs "your order was refunded").
 *   - `productId` is the canonical Product.id the verdict applies to
 *     (the raw input when the product could not be resolved).
 *   - `orderId` is the Order behind the verdict when one exists
 *     (grant.sourceId for order grants, the pending/refunded order,
 *     or the resolved anonymous order) — null otherwise (admin,
 *     free_enrollment/admin/bundle grants, no order at all).
 *
 * Reason vocabulary (canonical):
 *   - `active_purchase`  — active AccessGrant (any sourceType) OR
 *                          admin bypass. Access granted. Note: free
 *                          courses / admin grants also surface here
 *                          (the vocabulary has no dedicated literals
 *                          for them; hasAccess is what matters).
 *   - `subscription_active` — RESERVED. The Order model has no
 *                          subscription-type flag, so this literal is
 *                          never emitted today; kept for contract
 *                          parity with the canonical identity spec.
 *   - `payment_pending`  — an Order exists with status="pending"
 *                          (payment in flight — no grant yet).
 *   - `refunded`         — Order.status="refunded" (the AccessGrant
 *                          was revoked atomically by revoke-order.ts).
 *   - `not_purchased`    — no active grant and no pending/refunded
 *                          order for this user; also covers
 *                          "order belongs to another buyer",
 *                          "product does not exist" (fail-closed) and
 *                          a completed order whose grant was
 *                          revoked/expired (no dedicated literal; the
 *                          vocabulary is per the canonical spec).
 *   - `order_not_found`  — anonymous post-checkout path: the orderId
 *                          from the URL matched no Order (id OR
 *                          providerOrderId) for the product.
 *
 * ─── Verdict source ───────────────────────────────────────────
 *
 * AccessGrant is the source of truth for the ALLOW verdict:
 *   - `status = "active"` is the only accepted status.
 *   - `expiresAt` may be null (no expiry) OR a future timestamp.
 *   - All `sourceType` values are honored uniformly: `order`, `
 *     free_enrollment`, `admin`, `bundle`, `watchlist`.
 *
 * Order is read ONLY to classify DENY reasons (payment_pending vs
 * refunded vs not_purchased) and to translate the anonymous
 * post-checkout provider + providerOrderId → internal Order.id. The
 * allow decision never depends on Order.status.
 *
 * ─── Access-route consolidation ───────────────────────────────
 *
 * `GET /api/access` no longer contains access logic: it parses the
 * request and delegates the ENTIRE decision here. To support that,
 * the resolver also owns:
 *
 *   1. Product resolution — `productId` may be a Prisma cuid OR a
 *      Product.slug. cuid-shaped inputs are canonical ids and skip
 *      the product lookup (the grant query is keyed on productId
 *      directly — an extra round-trip would be pure overhead on the
 *      hot path, e.g. AccessGate on every portal render). Any other
 *      shape (slug, or a future non-cuid id format) goes through a
 *      single OR lookup; unknown products deny (fail-closed, no info
 *      leak). NOTE: a slug that happens to match the cuid shape is
 *      treated as an id and will not resolve — practically impossible
 *      (cuid v1 is 25 lowercase alphanumeric chars starting with "c")
 *      and fail-closed either way.
 *   2. Admin bypass — `userRole === "admin"` short-circuits to allow
 *      WITHOUT requiring a grant row. For non-cuid inputs the product
 *      existence gate still runs first (admin + unknown slug -> deny);
 *      cuid inputs skip the lookup, so admin + any well-formed id
 *      resolves to allow (admin bypass semantics).
 *   3. Anonymous post-checkout path — `provider` + `providerOrderId`
 *      resolve the provider-scoped Order, then its internal `Order.id`
 *      is used for the canonical grant lookup. A legacy `orderId` may
 *      still identify an internal Order.id directly. This fixes the
 *      Pattern B mismatch where the provider id never matched the
 *      grant's sourceId (written by `processOrder` as Order.id).
 *
 * Performance:
 *   - Allow path (session): 1 indexed grant seek
 *     (`@@index([userId, productId, status])`).
 *   - Deny path (session): +1 Order seek (status classification).
 *   - Slug productId: +1 indexed OR lookup.
 *   - Anonymous path: +2 indexed seeks (order + grant).
 *
 * Error handling:
 *   Prisma errors propagate to the caller. The function does NOT
 *   catch — the consumer is expected to translate to HTTP 500 / 503
 *   via `apiErrorResponse` or the equivalent.
 */

import { prisma } from "@/lib/db/prisma";

/**
 * cuid v1 shape (Prisma `@default(cuid())`): 25 lowercase
 * alphanumeric chars starting with "c". Used to recognize canonical
 * Product.id inputs so the product OR-lookup is skipped on the hot
 * path (the grant query is keyed on productId directly).
 */
const CUID_RE = /^c[0-9a-z]{24}$/;

/** Canonical reason vocabulary (see header for semantics). */
export type ProductAccessReason =
  | "active_purchase"
  | "subscription_active"
  | "not_purchased"
  | "refunded"
  | "payment_pending"
  | "order_not_found";

/** Uniform resolver result. Consumers branch on `hasAccess`. */
export interface ProductAccessResult {
  hasAccess: boolean;
  reason: ProductAccessReason;
  /** Canonical Product.id the verdict applies to (input when unresolvable). */
  productId: string;
  /** Order behind the verdict (grant sourceId / pending / refunded /
   *  anonymous order) — null when none applies. */
  orderId: string | null;
}

export interface ResolveProductAccessInput {
  /**
   * User.id (Postgres cuid). Required for the session-keyed path.
   * Optional for the anonymous post-checkout path (which is keyed on
   * `orderId` instead). Falsy values skip the session grant query
   * defensively.
   */
  userId?: string;
  /**
   * User.role column value. `"admin"` short-circuits to allow without
   * a grant row.
   */
  userRole?: string;
  /**
   * Product.id (Postgres cuid) OR Product.slug — cuid inputs are used
   * as-is; any other shape is resolved via a single OR lookup.
   * REQUIRED — falsy values deny without any DB hit.
   */
  productId: string;
  /**
   * Payment provider slug for the anonymous post-checkout lookup.
   * Required together with `providerOrderId`; a missing provider never
   * triggers an unscoped provider-order search.
   */
  provider?: string;
  /**
   * Provider-owned order identifier from the checkout redirect. It is
   * resolved with `provider` to an internal `Order.id` before reading
   * AccessGrant.sourceId.
   */
  providerOrderId?: string;
  /**
   * Legacy/internal Order.id lookup. Kept for existing callers that
   * already possess the canonical Prisma id.
   */
  orderId?: string;
}

/**
 * Check whether the caller has access to `productId`.
 *
 * Resolution order (fail-closed):
 *   1. productId falsy -> deny (not_purchased) without DB hit.
 *   2. Non-cuid productId: resolve product (slug OR id). Unknown -> deny.
 *   3. userRole === "admin" -> allow (no grant required).
 *   4. userId present -> active-grant read; on miss, classify the
 *      deny reason via the user's Order (pending/refunded/none).
 *   5. provider + providerOrderId (or legacy internal orderId) present
 *      -> anonymous order translation + grant read.
 *   6. Otherwise -> deny (not_purchased).
 */
export async function resolveProductAccess(
  input: ResolveProductAccessInput,
): Promise<ProductAccessResult> {
  // Defensive guard — productId required. Falsy values skip the query,
  // mirroring the pre-existing defense against Prisma dropping
  // undefined keys from the WHERE clause (which can leak cross-user
  // data when the identifier accidentally drops).
  if (!input.productId) {
    return deny("not_purchased", input.productId);
  }

  // Product resolution (cuid fast-path OR slug/id lookup).
  // Unknown product = deny (fail-closed, no info leak).
  const productId = CUID_RE.test(input.productId)
    ? input.productId
    : await resolveProductId(input.productId);

  if (!productId) {
    return deny("not_purchased", input.productId);
  }

  // Admin bypass — explicit role, no grant row needed. Verified AFTER
  // the (non-cuid) product resolution so `admin + unknown slug` stays
  // deny (the pre-consolidation route behaved the same way).
  if (input.userRole === "admin") {
    return { hasAccess: true, reason: "active_purchase", productId, orderId: null };
  }

  // Session-keyed path: any active non-expired grant qualifies.
  if (input.userId) {
    const grant = await findActiveGrant({
      userId: input.userId,
      productId,
    });
    if (grant) {
      return {
        hasAccess: true,
        reason: "active_purchase",
        productId,
        // order grants carry the internal Order.id as sourceId.
        orderId: grant.sourceType === "order" ? grant.sourceId : null,
      };
    }
    // No active grant: classify the denial (payment_pending /
    // refunded / not_purchased) from the user's Order rows.
    return classifyDenial({ userId: input.userId, productId });
  }

  // Anonymous post-checkout path: resolve the provider-owned id to the
  // internal Order.id, then read the `sourceType='order'` grant. The
  // provider is part of the lookup so the same providerOrderId cannot
  // cross provider boundaries. A legacy orderId is accepted only as the
  // internal primary key. Both paths are scoped to the product and use
  // sourceType='order' (a free_enrollment/admin/bundle grant sharing the
  // same sourceId must NOT satisfy this path).
  if (input.providerOrderId || input.orderId) {
    const order = input.providerOrderId
      ? input.provider
        ? await prisma.order.findFirst({
            where: {
              paymentProvider: input.provider,
              providerOrderId: input.providerOrderId,
              productId,
            },
            select: { id: true, status: true },
          })
        : null
      : await prisma.order.findFirst({
          where: { id: input.orderId, productId },
          select: { id: true, status: true },
        });
    if (!order) {
      // No provider-scoped or legacy internal Order matches this product.
      return deny("order_not_found", productId);
    }
    const grant = await findActiveGrant({
      sourceType: "order",
      sourceId: order.id,
      productId,
    });
    if (grant) {
      return {
        hasAccess: true,
        reason: "active_purchase",
        productId,
        orderId: order.id,
      };
    }
    // Order exists but carries no active grant: classify by its status.
    return {
      hasAccess: false,
      reason:
        order.status === "pending"
          ? "payment_pending"
          : order.status === "refunded"
            ? "refunded"
            : "not_purchased",
      productId,
      orderId: order.id,
    };
  }

  // No identity at all (anonymous without an order reference) — deny.
  return deny("not_purchased", productId);
}

/** Resolve a non-cuid product identifier (slug OR id) to the canonical
 *  Product.id. Returns null when the product does not exist. */
async function resolveProductId(
  productId: string,
): Promise<string | null> {
  const product = await prisma.product.findFirst({
    where: {
      OR: [{ id: productId }, { slug: productId }],
    },
    select: { id: true },
  });
  return product?.id ?? null;
}

/** Shared active-grant seek: status="active" + null-or-future expiresAt. */
async function findActiveGrant(where: {
  userId?: string;
  sourceType?: string;
  sourceId?: string;
  productId: string;
}): Promise<{ id: string; sourceType: string | null; sourceId: string | null } | null> {
  const grant = await prisma.accessGrant.findFirst({
    where: {
      ...where,
      status: "active",
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: { id: true, sourceType: true, sourceId: true },
  });
  return grant;
}

/** Classify a session-path denial: latest user Order for the product
 *  determines payment_pending / refunded / not_purchased. */
async function classifyDenial(input: {
  userId: string;
  productId: string;
}): Promise<ProductAccessResult> {
  const order = await prisma.order.findFirst({
    where: {
      userId: input.userId,
      productId: input.productId,
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true },
  });

  if (!order) {
    // No order at all for (user, product) — includes the
    // "order belongs to another buyer" case (this user never bought).
    return deny("not_purchased", input.productId);
  }
  if (order.status === "pending") {
    return { hasAccess: false, reason: "payment_pending", productId: input.productId, orderId: order.id };
  }
  if (order.status === "refunded") {
    return { hasAccess: false, reason: "refunded", productId: input.productId, orderId: order.id };
  }
  // completed (but grant revoked/expired) or failed → generic denial.
  return deny("not_purchased", input.productId);
}

function deny(
  reason: ProductAccessReason,
  productId: string,
): ProductAccessResult {
  return { hasAccess: false, reason, productId, orderId: null };
}
