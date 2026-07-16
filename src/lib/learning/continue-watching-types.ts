/**
 * src/lib/learning/continue-watching-types.ts
 *
 * Phase 2 Step 2 — Continue Watching types + port (Domain Layer).
 *
 * Architecture (per ADR-0016 §1 dep direction):
 *   - NO Prisma import here. Domain layer MUST NOT depend on Adapter.
 *   - The port interface (`ContinueWatchingRepository`) declares the
 *     adapter contract; consumers (use case, tests) build stubs against
 *     it; the real Prisma adapter (sibling file) implements it.
 *
 * Three consumers:
 *   - `src/lib/learning/continue-watching.ts`              — pure use case
 *   - `src/lib/learning/prisma-continue-watching-repository.ts` — adapter
 *   - `src/lib/learning/continue-watching.test.ts`         — port stub
 *   - `src/app/api/learning/continue-watching/route.ts`    — wire-up
 *
 * Cursor pagination (added Phase 2 step 2 v2):
 *   - Cursor = ISO-8601 timestamp string encoding the
 *     `lastWatchedAt` of the LAST visible (deduplicated) item in
 *     the current page. The adapter fetches rows strictly older
 *     than this timestamp on the next page (`{ lt: cursorDate }`).
 *   - nextCursor is present iff `items.length === limit` (room for
 *     another page). Otherwise null = end-of-feed.
 *   - Matches the FeedContext cursor pattern in
 *     `src/domains/discovery/feed/build-feed.ts`.
 */

export const DEFAULT_CONTINUE_WATCHING_LIMIT = 5;
export const MAX_CONTINUE_WATCHING_LIMIT = 10;

/**
 * Multiplier on `limit` passed to the adapter's `take`. Absorbs the
 * per-product dedupe cost: if a product has 3 in-progress lessons and
 * the user asks for limit=5, we fetch 10 rows so the dedupe Map can
 * surface 3 unique products (instead of dq'ing at the SQL boundary
 * and returning fewer rows than the limit allows).
 *
 * Kept as a named constant (not an inline `2`) so the rationale is
 * discoverable from one grep away from the call site.
 */
export const CONTINUE_WATCHING_DEDUPE_BUFFER_MULTIPLIER = 2;

/**
 * Dashboard "Continue Watching" item shape.
 *
 * One item = "where the user left off in this product". Unique by
 * `product.id` (the most recently watched in-progress lesson wins).
 */
export interface ContinueWatchingItem {
  product: {
    id: string;
    slug: string;
    coverUrl: string | null;
    /**
     * Resolved from `ProductTranslation.titolo`. Falls back to
     * `Product.slug` when no titolo translation is published.
     */
    title: string;
  };
  lesson: {
    id: string;
    position: number;
    /**
     * Resolved from `LessonTranslation.title`. Falls back to
     * `"Lesson N"` (positional, locale-agnostic) when no translation.
     */
    title: string;
    videoUrl: string | null;
  };
  lastWatchedAt: Date;
}

export interface BuildContinueWatchingInput {
  /** User.id (Postgres cuid). REQUIRED — falsy → return [] (non-throwing). */
  userId: string;
  /** Optional locale filter — restricts translation lookups. */
  locale?: string;
  /** Max items returned (after dedupe). Default = 5, max = 10. */
  limit?: number;
  /**
   * Opaque cursor (from previous page's `nextCursor`). null/undefined
   * = first page. Malformed input (non-ISO string) is silently
   * treated as null (defensive — matches route's `limit` handling).
   */
  cursor?: string | null;
}

/**
 * Result of `buildContinueWatchingHistory` — a page of items plus
 * an opaque cursor for fetching the next page.
 *
 * `nextCursor` semantics:
 *   - non-null when `items.length === limit` (room for another page)
 *   - null when fewer items than the limit (end-of-feed reached)
 *
 * The cursor encodes the `lastWatchedAt` of the LAST item in
 * `items`. The use case picks the LAST of the DEDUPLICATED items
 * (not the last Prisma row) — the dedupe map is what determines
 * page size, so its tail is the correct cursor anchor.
 */
export interface BuildContinueWatchingResult {
  items: ContinueWatchingItem[];
  nextCursor: string | null;
}

// ─── Port contract ────────────────────────────────────────────────────

/**
 * Raw row contract between the adapter and the use case. Internal —
 * kept local so adapter evolution stays inside this module. The
 * shape mirrors what the Prisma query returns with deep includes,
 * minus Prisma-specific types.
 */
export interface RawContinueWatchingProgress {
  id: string;
  lastWatchedAt: Date;
  lesson: {
    id: string;
    position: number;
    title: string;
    videoUrl: string | null;
    product: {
      id: string;
      slug: string;
      coverUrl: string | null;
      title: string;
    };
  };
}

export interface ContinueWatchingFetchInput {
  userId: string;
  locale: string | undefined;
  /** Pre-dedupe upper bound. Use case passes `limit * 2`. */
  take: number;
  /**
   * Optional cursor timestamp — if present, the adapter restricts
   * the SQL to rows strictly older than this date (`{ lt: cursorDate }`).
   * null = first page.
   */
  cursorDate: Date | null;
}

/**
 * Adapter port — single method. Stubbed in tests via
 * `mkStubRepo` (see continue-watching.test.ts). Mirrors the
 * `FeedRepository.fetchContinueLearning` shape from
 * `src/domains/discovery/feed/feed-repository.ts`.
 */
export interface ContinueWatchingRepository {
  fetchRecentProgress(
    input: ContinueWatchingFetchInput,
  ): Promise<RawContinueWatchingProgress[]>;
}