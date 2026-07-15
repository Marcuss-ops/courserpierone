/**
 * src/lib/commerce/access/resolve-product-access.ts
 *
 * Centralized product access resolver. Single source of truth for
 * "does this user have access to this product?" — every consumer
 * (course portal, dashboard, certificate, ebook download, progress,
 * messaging permission) routes through this function instead of
 * duplicating Order/AccessGrant queries inline.
 *
 * Replaces the inline Order.findFirst / AccessGrant.findFirst logic
 * previously scattered across:
 *   - src/lib/messaging/resolve-message-permission.ts (Step 5)
 *   - src/lib/access/find-completed-order.ts (Pattern A)
 *   - src/app/api/ebook/[slug]/download/route.ts
 *   - src/app/api/certificate/[productId]/route.ts
 *   - src/app/api/progress/route.ts
 *   - src/app/api/access/route.ts (Pattern A branch)
 *
 * Why a central resolver (verdict priority #5):
 *   6 call sites were duplicating the same Order.findFirst query with
 *   subtle variations. A bug in any of them (e.g., missing productId
 *   filter, status scope mismatch) was a cross-user data leak waiting
 *   to happen. Centralizing ensures every consumer gets the same
 *   defensive behavior (expiresAt check, defensive guards on
 *   userId/productId, status="active" filter on grants).
 *
 * Flag behavior:
 *   When `USE_ACCESS_GRANT_RESOLVER=true`, reads `AccessGrant.status='active'`.
 *   When OFF (default), reads `Order.status='completed'`. The same
 *   flag used by the messaging resolver (see its top-of-file JSDoc
 *   for the rollout runbook — staged 1d → 7d → prod 7d → remove legacy).
 *
 * Performance:
 *   - AccessGrant path: index `@@index([userId, productId, status])`.
 *     1 round-trip. O(log N) B-tree lookup. Equivalent index on Order
 *     for the legacy path.
 *   - The expiresAt check uses an OR clause that Postgres can serve
 *     from the same index seek — no extra round-trip.
 *
 * Expired grants:
 *   A grant with `expiresAt` in the past is treated as missing. Use
 *   `prisma.accessGrant.update({status:"expired", revokedAt:now()})`
 *   in the consumer that owns the expiry (e.g., scheduled job) to
 *   make this denial persistent (vs transient clock-window denial).
 *
 * Error handling:
 *   Prisma errors propagate to the caller. The function does NOT
 *   catch — the consumer is expected to translate to HTTP 500 / 503
 *   via `apiErrorResponse` or the equivalent (messaging already does
 *   this pattern in api-authorize.ts).
 */

import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";

/**
 * Stable, stringified deny reasons (mappable 1:1 to MessagingDenyReason
 * for messaging; to HTTP error strings for API routes; to UI text for
 * page-level guards). Consumers should NOT compare against the
 * hardcoded strings — use the named keys instead.
 */
export const ProductAccessDenyReason = {
  /** Legacy path (flag OFF) — no Order.status='completed' exists. */
  NoCompletedOrder: "no_completed_order",
  /** Grant path (flag ON) — no AccessGrant.status='active' exists. */
  NoValidAccessGrant: "no_valid_access_grant",
} as const;

export type ProductAccessDenyReason =
  (typeof ProductAccessDenyReason)[keyof typeof ProductAccessDenyReason];

/**
 * Discriminated union (spec-literal shape).
 *
 * - `allowed: true` carries a literal `source` ('grant' | 'legacy-order')
 *   identifying the read path. `grantId` is `string` when source is
 *   'grant' (canonical post-cutover); it is `undefined` when source is
 *   'legacy-order' (no grant row exists on that path).
 * - `allowed: false` exposes `reason` (stable string) that consumers
 *   map to their preferred error UX.
 *
 * Spec-literal shape per user requirement:
 *   | { allowed: true; grantId?: string; source: 'grant' | 'legacy-order' }
 *   | { allowed: false; reason: ProductAccessDenyReason }
 *
 * Consumer pattern:
 *   const r = await resolveProductAccess({userId, productId});
 *   if (r.allowed) {
 *     if (r.source === 'grant' && r.grantId) {
 *       // …use the grant id…
 *     }
 *   }
 */
export type ProductAccessResult =
  | {
      allowed: true;
      grantId?: string;
      source: "grant" | "legacy-order";
    }
  | { allowed: false; reason: ProductAccessDenyReason };

export interface ResolveProductAccessInput {
  /** User.id (Postgres cuid). REQUIRED — falsy values skip the query defensively. */
  userId: string;
  /** Product.id (Postgres cuid). REQUIRED — falsy values skip the query defensively. */
  productId: string;
}

/**
 * Check whether `userId` has access to `productId` under the current
 * `USE_ACCESS_GRANT_RESOLVER` flag.
 *
 * @see src/lib/messaging/resolve-message-permission.ts — the canonical
 *      PR 3 of MCR rollout runbook for the flag flip cadence.
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
      reason: ProductAccessDenyReason.NoCompletedOrder,
    };
  }

  const { userId, productId } = input;
  const useGrantResolver = env.USE_ACCESS_GRANT_RESOLVER === "true";

  if (useGrantResolver) {
    // MCR Phase 2/3 — AccessGrant-based path (canonical post-cutover).
    // expiresAt null OR future → grant still active. Past → not active.
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
      return { allowed: true, source: "grant", grantId: grant.id };
    }

    return {
      allowed: false,
      reason: ProductAccessDenyReason.NoValidAccessGrant,
    };
  }

  // Legacy Order-based path (still in use during the rollout window).
  // `grantId` is omitted here on purpose: there is no grant row to
  // identify on the legacy path. Consumers should narrow on
  // `result.source === 'legacy-order'` (preferred) or guard with
  // `if (result.grantId)` before reading.
  const completedOrder = await prisma.order.findFirst({
    where: {
      userId,
      productId,
      status: "completed",
    },
    select: { id: true },
  });

  if (completedOrder) {
    return { allowed: true, source: "legacy-order" };
  }

  return {
    allowed: false,
    reason: ProductAccessDenyReason.NoCompletedOrder,
  };
}
