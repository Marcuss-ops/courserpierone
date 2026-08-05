/**
 * src/lib/commerce/access/resolve-product-access.ts
 *
 * Centralized product access resolver. SINGLE SOURCE OF TRUTH for
 * "does this user have access to this product?" — every consumer
 * (course portal, dashboard, certificate, ebook download, progress,
 * messaging permission, GET /api/access) routes through this function
 * instead of duplicating Order/AccessGrant queries inline.
 *
 * ─── MCR Phase 3 cutover ───────────────────────────────────────
 *
 * AccessGrant is the source of truth for access. The legacy
 * Order.findFirst branch and the `USE_ACCESS_GRANT_RESOLVER` feature
 * flag have been REMOVED. Every session-keyed call site reads
 * AccessGrant unconditionally:
 *   - `status = "active"` is the only accepted status.
 *   - `expiresAt` may be null (no expiry) OR a future timestamp.
 *     Past expiry is treated as a transient denial until the owner
 *     flips the grant to status="revoked" (recommended, persistent).
 *   - All `sourceType` values are honored uniformly: `order` (paid
 *     purchase), `free_enrollment` (no-cost bypass), `admin` (manual
 *     grant by an admin), `bundle` (included in another product),
 *     `watchlist` (forward-looking; not yet written by app code).
 *     The resolver does not branch on sourceType — any active grant
 *     qualifies the user for access.
 *
 * ─── Access-route consolidation (this revision) ────────────────
 *
 * `GET /api/access` no longer contains access logic: it parses the
 * request and delegates the ENTIRE decision here. To support that,
 * the resolver now also owns:
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
 *      WITHOUT requiring a grant row. Previously this lived inline in
 *      the /api/access route (and separately in /api/videos/stream
 *      and /api/progress, which keep their own pre-checks — harmless
 *      double coverage, their short-circuit runs first). For
 *      non-cuid inputs the product existence gate still runs first
 *      (admin + unknown slug -> deny, preserving the prior route
 *      semantics); cuid inputs skip the lookup, so admin + any
 *      well-formed id resolves to allow (admin bypass semantics).
 *   3. Anonymous post-checkout path — `orderId` (the value Lemon
 *      Squeezy substitutes into `redirectUrl`, i.e. the LS order id
 *      which is stored as `Order.providerOrderId`, OR the internal
 *      `Order.id` cuid) is translated to the canonical grant lookup:
 *      resolve the Order scoped to the product, then read the grant
 *      by `(sourceType='order', sourceId=order.id)`. This is the fix
 *      for the previous Pattern B mismatch: the grant is written by
 *      `processOrder` with `sourceId = Order.id`, so the provider id
 *      MUST be translated before the grant can be found. The verdict
 *      stays AccessGrant-based (Order is used only as a key-
 *      translation step), and refunds are covered because
 *      `revoke-order.ts` flips `AccessGrant.status` atomically.
 *
 * Performance:
 *   - Session path (userId + cuid productId): 1 indexed round-trip
 *     (grant seek on `@@index([userId, productId, status])`).
 *   - Session path (userId + slug): +1 indexed OR lookup.
 *   - Anonymous path: +2 indexed seeks (order by
 *     `@@index([providerOrderId])`/PK + grant by sourceType/sourceId).
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

/**
 * Stable, stringified deny reasons. Single post-cutover reason.
 * Consumers should NOT compare against the hardcoded string —
 * use the named key instead.
 */
export const ProductAccessDenyReason = {
  /** No AccessGrant.status='active' row for the given identity/product. */
  NoActiveAccessGrant: "no_active_access_grant",
} as const;

export type ProductAccessDenyReason =
  (typeof ProductAccessDenyReason)[keyof typeof ProductAccessDenyReason];

/**
 * Discriminated union (spec-literal shape).
 *
 * - `allowed: true`  carries `grantId` — always set on the 'grant'
 *   branch; `null` on the 'admin' branch (admins bypass grants and
 *   have no grant row). `source` is `"grant"` | `"admin"`.
 * - `allowed: false` exposes `reason` (stable string) that consumers
 *   map to their preferred error UX.
 *
 *   | { allowed: true; grantId: string | null; source: "grant" | "admin" }
 *   | { allowed: false; reason: ProductAccessDenyReason }
 */
export type ProductAccessResult =
  | { allowed: true; grantId: string | null; source: "grant" | "admin" }
  | { allowed: false; reason: ProductAccessDenyReason };

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
   * Post-checkout order id from the request URL. May be the internal
   * `Order.id` cuid OR the provider's order id (`Order.providerOrderId`,
   * e.g. the Lemon Squeezy id substituted into the checkout redirect).
   * Enables the anonymous post-checkout path; ignored when `userId`
   * already resolves a grant.
   */
  orderId?: string;
}

/**
 * Check whether the caller has access to `productId`.
 *
 * Resolution order (fail-closed):
 *   1. productId falsy -> deny without DB hit.
 *   2. Non-cuid productId: resolve product (slug OR id). Unknown -> deny.
 *   3. userRole === "admin" -> allow (no grant required).
 *   4. userId present -> grant read by (userId, productId).
 *   5. orderId present -> anonymous grant read keyed on the resolved
 *      Order (see header for the sourceId translation rationale).
 *   6. Otherwise -> deny.
 */
export async function resolveProductAccess(
  input: ResolveProductAccessInput,
): Promise<ProductAccessResult> {
  // Defensive guard — productId required. Falsy values skip the query,
  // mirroring the pre-existing defense against Prisma dropping
  // undefined keys from the WHERE clause (which can leak cross-user
  // data when the identifier accidentally drops).
  if (!input.productId) {
    return {
      allowed: false,
      reason: ProductAccessDenyReason.NoActiveAccessGrant,
    };
  }

  // Product resolution (cuid fast-path OR slug/id lookup).
  // Unknown product = deny (fail-closed, no info leak).
  const productId = CUID_RE.test(input.productId)
    ? input.productId
    : await resolveProductId(input.productId);

  if (!productId) {
    return {
      allowed: false,
      reason: ProductAccessDenyReason.NoActiveAccessGrant,
    };
  }

  // Admin bypass — explicit role, no grant row needed. Verified AFTER
  // the (non-cuid) product resolution so `admin + unknown slug` stays
  // deny (the pre-consolidation route behaved the same way).
  if (input.userRole === "admin") {
    return { allowed: true, grantId: null, source: "admin" };
  }

  // Session-keyed path: any active non-expired grant qualifies.
  if (input.userId) {
    const grant = await findActiveGrant({
      userId: input.userId,
      productId,
    });
    if (grant) {
      return { allowed: true, grantId: grant.id, source: "grant" };
    }
  }

  // Anonymous post-checkout path: translate the order id (internal
  // cuid OR provider id) to the internal Order.id, then read the
  // `sourceType='order'` grant. Scoped to the product (cross-product
  // scope-leak defense) and strictly sourceType='order' (a
  // free_enrollment/admin/bundle grant sharing the same sourceId must
  // NOT satisfy this path).
  if (input.orderId) {
    const order = await prisma.order.findFirst({
      where: {
        OR: [{ id: input.orderId }, { providerOrderId: input.orderId }],
        productId,
      },
      select: { id: true },
    });
    if (order) {
      const grant = await findActiveGrant({
        sourceType: "order",
        sourceId: order.id,
        productId,
      });
      if (grant) {
        return { allowed: true, grantId: grant.id, source: "grant" };
      }
    }
  }

  return {
    allowed: false,
    reason: ProductAccessDenyReason.NoActiveAccessGrant,
  };
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
}): Promise<{ id: string } | null> {
  return prisma.accessGrant.findFirst({
    where: {
      ...where,
      status: "active",
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: { id: true },
  });
}
