/**
 * src/lib/learning/watchlist.ts
 *
 * Phase 2 — Free layer + retention. Step 3 of 5 in the Phase 2
 * sequencing (per ADR-0016):
 *   feat(access)          : free enrollment        (commit 1/5 — committed)
 *   feat(learning)        : continue watching      (commit 2/5 — committed)
 *   feat(learning)        : watchlist              ← THIS FILE  (commit 3/5)
 *   feat(notifications)   : new-content alerts     (commit 4/5 — future)
 *   feat(discovery)       : next-course suggester  (commit 5/5 — future)
 *
 * Goal: ONE canonical use case for "save this product for later".
 *
 * Schema reuse (no new table):
 *   - Watchlist rows are AccessGrant entries with
 *     `sourceType='watchlist'` + `sourceId='watchlist:${userId}:${productId}'`.
 *   - The @@unique([sourceType, sourceId, productId]) index makes
 *     concurrent upserts safe via Prisma's atomic path.
 *   - POST = upsert with `update: { status: 'active', revokedAt: null }`
 *     → reactivates revoked grants (re-engagement use case).
 *   - DELETE = updateMany with `where: { status: 'active' }` soft-delete
 *     → idempotent (already-revoked → no-op).
 *   - GET = findMany filtered to status='active' for the current user,
 *     joined with Product + ProductTranslation (locale-aware).
 *
 * Distinct from continue-watching:
 *   - continue-watching: read-only projection from LessonProgress.
 *   - watchlist: user-curated list of products they want to revisit
 *     later, persisted as AccessGrant rows.
 *
 * Architecture (per ADR-0016 §1 dep direction):
 *   - This file imports NOTHING from adapters. Only types + port
 *     (Domain layer).
 *   - The Prisma adapter lives in the sibling
 *     `prisma-watchlist-repository.ts`.
 *   - Tests stub the port directly (no Prisma mocks, no clock).
 *
 * Idempotency contract:
 *   - POST is idempotent: a second call for the same (userId, productId)
 *     re-uses the existing grant row (alreadyAdded=true).
 *   - POST reactivates: a previously-revoked grant is brought back to
 *     status='active' with revokedAt cleared (re-engagement).
 *   - DELETE is idempotent: calling DELETE on a never-added product
 *     or an already-revoked grant returns {revoked:false} (no-op
 *     success — matches REST convention for idempotent DELETE).
 *
 * Defensive checks:
 *   - Empty userId → ProductNotFound denial (coalesces with legitimate
 *     not-found to avoid leaking existence to unauthenticated callers).
 *     Mirrors `enrollFreeCourse` pattern.
 *   - Product existence: verified via `repo.findProductById` BEFORE
 *     the upsert (returns clean 404 instead of leaking the FK
 *     constraint violation as 500). Per thinker-with-files-gemini
 *     validation (Phase 2 step 3 design review).
 *
 * Errors:
 *   - Repository errors propagate to the route's `apiErrorResponse`.
 *   - Denial reasons are NOT AppError throws — they're typed return
 *     shapes so the route can map to 404 cleanly without try/catch
 *     overhead (matches enroll-free-course convention).
 */

import {
  buildWatchlistSourceId,
  type AddToWatchlistInput,
  type AddToWatchlistResult,
  type ListWatchlistInput,
  type ListWatchlistResult,
  type RemoveFromWatchlistInput,
  type RemoveFromWatchlistResult,
  type WatchlistRepository,
  WatchlistDenialReason,
} from "./watchlist-types";

// Re-export constants and types so callers can keep importing from
// "./watchlist" (single canonical entry point for the use case shape).
// The Prisma adapter is intentionally NOT re-exported here — keeping
// the parent module free of `@prisma/client` honors ADR-0016 §1 dep
// direction (Domain MUST NOT transitively load Adapter modules).
// Consumers wire the adapter via direct import from
// "./prisma-watchlist-repository".
export {
  WATCHLIST_SOURCE_TYPE,
  buildWatchlistSourceId,
  type AccessGrantSourceType,
  type AddToWatchlistInput,
  type AddToWatchlistResult,
  type ListWatchlistInput,
  type ListWatchlistResult,
  type RemoveFromWatchlistInput,
  type RemoveFromWatchlistResult,
  type WatchlistItem,
  type WatchlistRepository,
  WatchlistDenialReason,
} from "./watchlist-types";

export interface AddToWatchlistDeps {
  repo: WatchlistRepository;
}

export interface RemoveFromWatchlistDeps {
  repo: WatchlistRepository;
}

export interface ListWatchlistDeps {
  repo: WatchlistRepository;
}

/**
 * Add a product to the user's watchlist.
 *
 * Idempotent: a second call for the same (userId, productId) returns
 * `alreadyAdded: true` without writing a new row. Reactivates a
 * previously-revoked grant by setting status='active' and clearing
 * revokedAt (re-engagement use case).
 *
 * Returns `{added:false, reason: ProductNotFound}` if:
 *   - userId is empty (defensive)
 *   - productId is empty (defensive)
 *   - product does not exist (defensive findFirst before upsert)
 *
 * The denial reason is coalesced for ALL three cases to avoid leaking
 * existence to unauthenticated callers (matches enroll-free-course).
 */
export async function addToWatchlist(
  input: AddToWatchlistInput,
  deps: AddToWatchlistDeps,
): Promise<AddToWatchlistResult> {
  if (!input.userId || !input.productId) {
    return { added: false, reason: WatchlistDenialReason.ProductNotFound };
  }

  // Defensive findFirst: clean 404 instead of leaking the FK
  // constraint violation as 500 (per Q2 design validation).
  const product = await deps.repo.findProductById(input.productId);
  if (!product) {
    return { added: false, reason: WatchlistDenialReason.ProductNotFound };
  }

  const sourceId = buildWatchlistSourceId(input.userId, input.productId);
  const { grantId, alreadyAdded } = await deps.repo.upsertWatchlistGrant({
    userId: input.userId,
    productId: input.productId,
    sourceId,
  });

  return { added: true, grantId, alreadyAdded };
}

/**
 * Remove a product from the user's watchlist (soft delete).
 *
 * Idempotent: returns `{revoked: false, revokedAt: null}` when:
 *   - userId is empty (defensive)
 *   - productId is empty (defensive)
 *   - no active grant exists (never added OR already revoked)
 *
 * Returns `{revoked: true, revokedAt: Date}` when an active grant was
 * soft-deleted. The status='active' filter on the underlying
 * updateMany prevents double-revocation (revokedAt would otherwise
 * be re-stamped on every call).
 */
export async function removeFromWatchlist(
  input: RemoveFromWatchlistInput,
  deps: RemoveFromWatchlistDeps,
): Promise<RemoveFromWatchlistResult> {
  if (!input.userId || !input.productId) {
    return { revoked: false, revokedAt: null };
  }

  return deps.repo.softDeleteWatchlistGrant({
    userId: input.userId,
    productId: input.productId,
  });
}

/**
 * List the user's active watchlist entries (joined with Product +
 * ProductTranslation for direct UI rendering).
 *
 * Ordered by most recently granted first (createdAt DESC on the
 * AccessGrant row). Empty userId → empty list.
 */
export async function listWatchlist(
  input: ListWatchlistInput,
  deps: ListWatchlistDeps,
): Promise<ListWatchlistResult> {
  if (!input.userId) {
    return { items: [], count: 0 };
  }

  const items = await deps.repo.listActiveWatchlist({
    userId: input.userId,
    locale: input.locale,
  });

  return { items, count: items.length };
}