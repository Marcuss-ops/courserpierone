/**
 * src/lib/commerce/access/resolve-product-access.ts
 *
 * Centralized product access resolver. SINGLE SOURCE OF TRUTH for
 * "does this user have access to this product?" — every consumer
 * (course portal, dashboard, certificate, ebook download, progress,
 * messaging permission) routes through this function instead of
 * duplicating Order/AccessGrant queries inline.
 *
 * ─── MCR Phase 3 cutover (this revision) ─────────────────────
 *
 * This file is the post-cutover canonical path: AccessGrant is the
 * source of truth. The legacy Order.findFirst branch and the
 * `USE_ACCESS_GRANT_RESOLVER` feature flag have been REMOVED. Every
 * call site reads AccessGrant unconditionally:
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
 * Source paths (writers):
 *   - `order`: dual-written atomically with `Order.status="completed"`
 *     in `src/lib/commerce/orders/complete-order.ts` ($transaction).
 *     Migration `20260712230000_add_access_grants` + backfill script
 *     `scripts/migrate-grants-from-orders.ts` cover historical rows.
 *   - `free_enrollment`: created by `enrollFreeCourse` (this PR's
 *     sibling use case) on first authenticated visit to a free course.
 *     Idempotent upsert reactivates revoked grants.
 *   - `admin`: NOT YET WRITTEN by app code. Reserved for a future V2
 *     admin-grant UI. The resolver already honors the sourceType when
 *     a row exists.
 *   - `bundle`: NOT YET WRITTEN by app code (no `Bundle` model yet).
 *     Reserved for the V2 bundles milestone. The resolver honors the
 *     sourceType when a row exists.
 *
 * Revocation paths (writers):
 *   - `src/lib/commerce/orders/revoke-order.ts` flips both
 *     `Order.status="refunded"` AND `AccessGrant.status="revoked"`
 *     atomically in a single `$transaction` (LS webhook handler).
 *   - A future scheduled job flips `status="expired"` for grants with
 *     `expiresAt < NOW()` (the resolver denies them transiently even
 *     before the scheduled job runs, via the OR clause below).
 *
 * Performance:
 *   - Index `@@index([userId, productId, status])` on AccessGrant. The
 *     `OR: [{expiresAt: null}, {expiresAt: {gt: now}}]` is a B-tree
 *     seek continuation on the same composite index (Postgres serves
 *     it without an extra round-trip). 1 round-trip + O(log N).
 *   - Inline `select: { id: true }` returns only the grantId — no
 *     full row over-fetch.
 *
 * Error handling:
 *   Prisma errors propagate to the caller. The function does NOT
 *   catch — the consumer is expected to translate to HTTP 500 / 503
 *   via `apiErrorResponse` or the equivalent (messaging already does
 *   this pattern in api-authorize.ts).
 *
 * Backward-compat note:
 *   `ProductAccessResult.source` collapses from `'grant' | 'legacy-order'`
 *   to a single `'grant'` literal — legacy-order is gone. The deny
 *   reason `NoCompletedOrder` is renamed to `NoActiveAccessGrant`
 *   (single, post-cutover canonical denial).
 */

import { prisma } from "@/lib/db/prisma";

/**
 * Stable, stringified deny reasons. Single post-cutover reason.
 * Consumers should NOT compare against the hardcoded string —
 * use the named key instead.
 */
export const ProductAccessDenyReason = {
  /** No AccessGrant.status='active' row for (userId, productId). */
  NoActiveAccessGrant: "no_active_access_grant",
} as const;

export type ProductAccessDenyReason =
  (typeof ProductAccessDenyReason)[keyof typeof ProductAccessDenyReason];

/**
 * Discriminated union (spec-literal shape).
 *
 * - `allowed: true`  carries `grantId` (always set on the 'grant'
 *   branch — the canonical post-cutover result).
 * - `allowed: false` exposes `reason` (stable string) that consumers
 *   map to their preferred error UX.
 *
 *   | { allowed: true; grantId: string }
 *   | { allowed: false; reason: ProductAccessDenyReason }
 */
export type ProductAccessResult =
  | { allowed: true; grantId: string; source: "grant" }
  | { allowed: false; reason: ProductAccessDenyReason };

export interface ResolveProductAccessInput {
  /** User.id (Postgres cuid). REQUIRED — falsy values skip the query defensively. */
  userId: string;
  /** Product.id (Postgres cuid). REQUIRED — falsy values skip the query defensively. */
  productId: string;
}

/**
 * Check whether `userId` has an active, non-expired AccessGrant for
 * `productId`. Post-cutover canonical path.
 */
export async function resolveProductAccess(
  input: ResolveProductAccessInput,
): Promise<ProductAccessResult> {
  // Defensive guards — both fields required. Falsy values skip the
  // query, mirroring findCompletedOrder's defense against Prisma
  // dropping undefined keys from the WHERE clause (which can leak
  // cross-user data when the user/product id accidentally drops).
  if (!input.userId || !input.productId) {
    return {
      allowed: false,
      reason: ProductAccessDenyReason.NoActiveAccessGrant,
    };
  }

  const { userId, productId } = input;

  // Single query, B-tree seek on @@index([userId, productId, status]):
  //   status = "active"       → only the accepting status
  //   expiresAt null OR future → grant still valid (no expiry OR future)
  // The OR clause is served by the same index seek — no extra round-trip.
  const grant = await prisma.accessGrant.findFirst({
    where: {
      userId,
      productId,
      status: "active",
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: { id: true },
  });

  if (grant) {
    return { allowed: true, grantId: grant.id, source: "grant" };
  }

  return {
    allowed: false,
    reason: ProductAccessDenyReason.NoActiveAccessGrant,
  };
}
