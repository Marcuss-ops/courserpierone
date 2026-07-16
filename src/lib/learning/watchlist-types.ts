/**
 * src/lib/learning/watchlist-types.ts
 *
 * Phase 2 Step 3 — Watchlist types + port (Domain Layer).
 *
 * Architecture (per ADR-0016 §1 dep direction):
 *   - NO Prisma import here. Domain layer MUST NOT depend on Adapter.
 *   - The port interface (`WatchlistRepository`) declares the adapter
 *     contract; consumers (use case, tests) build stubs against it;
 *     the real Prisma adapter (sibling file) implements it.
 *
 * Schema reuse (no new table):
 *   - Watchlist rows are AccessGrant entries with `sourceType='watchlist'`.
 *   - sourceId = `watchlist:${userId}:${productId}` (deterministic;
 *     the @@unique([sourceType, sourceId, productId]) index makes
 *     concurrent upserts safe via Prisma's atomic upsert path).
 *   - POST = upsert with `update: { status: 'active', revokedAt: null }`
 *     → reactivates revoked grants (re-engagement use case).
 *   - DELETE = updateMany with `where: { status: 'active' }` soft-delete
 *     → idempotent (already-revoked → no-op).
 *   - GET = findMany filtered to status='active' for the current user.
 *
 * Three consumers:
 *   - `src/lib/learning/watchlist.ts`                      — use case
 *   - `src/lib/learning/prisma-watchlist-repository.ts`   — adapter
 *   - `src/lib/learning/watchlist.test.ts`                 — port stub
 *   - `src/app/api/learning/watchlist/route.ts`           — wire-up
 *
 * YAGNI (per spec):
 *   - No tags, no folder/category, no expiry. Just a flat list per user.
 */

/**
 * Canonical AccessGrant.sourceType union. Currently includes all 5
 * consumer types:
 *   - "order"           — paid checkout (LemonSqueezy / future Stripe)
 *   - "free_enrollment" — free-course claim via `enrollFreeCourse`
 *   - "admin"           — admin-granted access (audit trail)
 *   - "bundle"          — bundle-included access (multi-product)
 *   - "watchlist"       — user-saved-for-later list (Phase 2 step 3)
 *
 * String field in Prisma; the TS union is the canonical application-level
 * validator (no DB enum migration required). Other consumers
 * (`enroll-free-course.ts`, `complete-order.ts`) use string literals
 * which still type-check against this union.
 */
export type AccessGrantSourceType =
  | "order"
  | "free_enrollment"
  | "admin"
  | "bundle"
  | "watchlist";

/**
 * Watchlist sourceType sentinel. Use this constant instead of the
 * string literal "watchlist" at call sites for compile-time safety
 * (typo-proof) and discoverability (grep for the canonical name).
 */
export const WATCHLIST_SOURCE_TYPE: AccessGrantSourceType = "watchlist";

/**
 * Compose a deterministic sourceId for a (userId, productId) pair.
 * Format: `watchlist:${userId}:${productId}`. The @@unique
 * ([sourceType, sourceId, productId]) constraint uses the triple;
 * the sourceId includes userId for defense-in-depth (a malicious
 * POST with another user's userId is also blocked at the route level
 * via `dbUser.id` from session).
 */
export function buildWatchlistSourceId(userId: string, productId: string): string {
  return `watchlist:${userId}:${productId}`;
}

/**
 * Enriched watchlist item shape (returned by GET).
 *
 * Joins AccessGrant with Product + ProductTranslation (locale-aware)
 * so the UI can render cards without a per-item client-side fetch.
 * Single Prisma findMany with `include` — no N+1.
 */
export interface WatchlistItem {
  productId: string;
  slug: string;
  title: string;
  coverUrl: string | null;
  /**
   * ISO-8601 string (serialized from DateTime). Set when the grant
   * was created or last reactivated.
   */
  grantedAt: string;
}

// ─── Use case inputs / results ────────────────────────────────────────

export interface AddToWatchlistInput {
  /** User.id (Postgres cuid). REQUIRED — falsy → no-op. */
  userId: string;
  /**
   * Product.id to add. The adapter performs an existence check
   * (404 → denial reason) before upserting the grant.
   */
  productId: string;
  /**
   * Optional locale for the ProductTranslation lookup when the
   * caller wants a locale-specific title in the response. Falls
   * back to Product.slug when no translation is published.
   */
  locale?: string;
}

export type AddToWatchlistResult =
  | {
      added: true;
      grantId: string;
      /**
       * `true` if a row pre-existed before the upsert (no DB write
       * happened — the upsert was a pure read). `false` if a NEW
       * row was created OR a previously-revoked row was reactivated.
       */
      alreadyAdded: boolean;
    }
  | { added: false; reason: WatchlistDenialReason };

export const WatchlistDenialReason = {
  /** Caller asked for a product that doesn't exist (defensive 404). */
  ProductNotFound: "product_not_found",
} as const;

export type WatchlistDenialReason =
  (typeof WatchlistDenialReason)[keyof typeof WatchlistDenialReason];

export interface RemoveFromWatchlistInput {
  userId: string;
  productId: string;
}

export interface RemoveFromWatchlistResult {
  /**
   * `true` if a currently-active grant was soft-deleted.
   * `false` if no active grant existed (already revoked or never added) —
   * caller can treat both as success (REST idempotent DELETE).
   */
  revoked: boolean;
  /** Set when revoked=true; null when revoked=false. */
  revokedAt: Date | null;
}

export interface ListWatchlistInput {
  userId: string;
  locale?: string;
}

export interface ListWatchlistResult {
  items: WatchlistItem[];
  /** Convenience count (items.length, but explicit for API ergonomics). */
  count: number;
}

// ─── Port contract ────────────────────────────────────────────────────

/**
 * Adapter port — 4 methods (the 3 ops + 1 product existence check).
 * Stubbed in tests via `mkStubRepo`. Mirrors the
 * `ContinueWatchingRepository` shape from
 * `src/lib/learning/continue-watching-types.ts`.
 */
export interface WatchlistRepository {
  /**
   * Resolve a Product by id. Returns null when not found. Used by
   * the use case to produce a clean 404 BEFORE attempting the
   * upsert (avoids leaking FK constraint violations as 500).
   */
  findProductById(productId: string): Promise<{
    id: string;
    slug: string;
    coverUrl: string | null;
    /** Default translation content (or slug fallback). Locale-aware in adapter. */
    title: string;
  } | null>;

  /**
   * Idempotent upsert + reactivation. Mirrors the enroll-free-course
   * pattern: 2-query (pre-check findFirst + atomic upsert).
   *
   * Returns:
   *   - grantId: the (existing or newly-created) grant id
   *   - alreadyAdded: true if the row pre-existed
   */
  upsertWatchlistGrant(input: {
    userId: string;
    productId: string;
    sourceId: string;
  }): Promise<{ grantId: string; alreadyAdded: boolean }>;

  /**
   * Soft delete (status='active' filter prevents double-revoke).
   * Idempotent: returns {revoked: false} for missing/already-revoked.
   * Mirrors `revoke-order.ts` `updateMany` pattern.
   */
  softDeleteWatchlistGrant(input: {
    userId: string;
    productId: string;
  }): Promise<{ revoked: boolean; revokedAt: Date | null }>;

  /**
   * List active watchlist entries for the user. Joins Product +
   * ProductTranslation (locale-aware). Ordered by most recently
   * granted first.
   */
  listActiveWatchlist(input: {
    userId: string;
    locale?: string;
  }): Promise<WatchlistItem[]>;
}