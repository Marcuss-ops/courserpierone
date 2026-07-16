/**
 * src/lib/learning/continue-watching.ts
 *
 * Phase 2 — Free layer + retention. Step 2 of 5 in the Phase 2
 * sequencing (per ADR-0016):
 *   feat(access)        : free enrollment        (commit 1/5 — committed)
 *   feat(learning)      : continue watching      ← THIS FILE  (commit 2/5)
 *   feat(learning)      : watchlist              (commit 3/5 — future)
 *   feat(notifications) : new-content alerts     (commit 4/5 — future)
 *   feat(discovery)     : next-course suggester  (commit 5/5 — future)
 *
 * Goal: ONE canonical use case for "what is this user currently
 * watching?" — surfaces the dashboard's "Continue Watching" widget.
 *
 * Distinct from `ContinueLearningItem` in
 * `src/domains/discovery/feed/feed-types.ts`: the feed item is bound
 * to a discriminated union + ranking policies; `ContinueWatchingItem`
 * is the raw "where I left off" projection (1-per-product dedupe,
 * no ranking). Two consumers, two types.
 *
 * Architecture (per ADR-0016 §1 dep direction):
 *   - This file imports NOTHING from adapters. Only types + port
 *     (Domain layer).
 *   - The Prisma adapter lives in the sibling
 *     `prisma-continue-watching-repository.ts`.
 *   - Tests stub the port directly (no Prisma mocks, no clock).
 *
 * Query budget (per ADR-0016 §4 + master spec):
 *   - 1 round-trip aggregate inside the adapter (lessonProgress
 *     .findMany with deep includes + optional cursor filter).
 *     Defensive `take: limit * 2` absorbs the per-product dedupe
 *     cost so the page can fill even when multiple lessons share
 *     a product.
 *   - AppJS `Map` dedupe by productId (Prisma `distinct` does not
 *     work across relation boundaries).
 *   - No secondary counting query — YAGNI for a capped widget list.
 *
 * Cursor pagination (Phase 2 step 2 v2):
 *   - Cursor = ISO-8601 string encoding the `lastWatchedAt` of the
 *     last visible (deduplicated) item in the current page.
 *   - nextCursor is non-null iff `items.length === limit` (room for
 *     another page). Otherwise null = end-of-feed.
 *   - Malformed cursor (non-ISO string) is silently treated as
 *     null — defensive, matches the route's `limit` fallback pattern.
 *   - Mirrors FeedContext cursor pattern in
 *     `src/domains/discovery/feed/build-feed.ts`.
 *
 * Determinism:
 *   - Output order is the order in which unique productIds first
 *     appear in the SQL result (already ORDER BY lastWatchedAt DESC).
 *   - No RNG, no clock dependency. Test fixtures use ISO strings.
 */

import {
  CONTINUE_WATCHING_DEDUPE_BUFFER_MULTIPLIER,
  DEFAULT_CONTINUE_WATCHING_LIMIT,
  MAX_CONTINUE_WATCHING_LIMIT,
  type BuildContinueWatchingInput,
  type BuildContinueWatchingResult,
  type ContinueWatchingItem,
  type ContinueWatchingRepository,
} from "./continue-watching-types";

// Re-export constants and types so callers can keep importing from
// "./continue-watching" (single canonical entry point for the use case
// shape). The Prisma adapter is intentionally NOT re-exported here —
// keeping the parent module free of `@prisma/client` honors ADR-0016 §1
// dep direction (Domain MUST NOT transitively load Adapter modules).
// Consumers wire the adapter via direct import from
// "./prisma-continue-watching-repository".
export {
  CONTINUE_WATCHING_DEDUPE_BUFFER_MULTIPLIER,
  DEFAULT_CONTINUE_WATCHING_LIMIT,
  MAX_CONTINUE_WATCHING_LIMIT,
  type BuildContinueWatchingInput,
  type BuildContinueWatchingResult,
  type ContinueWatchingItem,
  type ContinueWatchingRepository,
  type RawContinueWatchingProgress,
} from "./continue-watching-types";

export interface BuildContinueWatchingDeps {
  repo: ContinueWatchingRepository;
}

/**
 * Normalizes a caller-supplied limit (or `undefined`) into a clamped
 * integer in [1, MAX_CONTINUE_WATCHING_LIMIT]. Defensive against:
 *   - undefined / null / NaN           → default
 *   - <= 0                             → default
 *   - !Number.isFinite (Infinity)      → default
 *   - > MAX_LIMIT                      → MAX_LIMIT
 *   - fractional (e.g. 7.9)            → floor
 *
 * Exported (not internal) so callers / tests can pin the same logic
 * without re-implementing.
 */
export function normalizeContinueWatchingLimit(
  limit: number | undefined,
): number {
  if (
    typeof limit !== "number" ||
    limit <= 0 ||
    !Number.isFinite(limit)
  ) {
    return DEFAULT_CONTINUE_WATCHING_LIMIT;
  }
  return Math.min(MAX_CONTINUE_WATCHING_LIMIT, Math.floor(limit));
}

/**
 * Decode the opaque cursor string into a Date for the adapter to use
 * as a `lastWatchedAt < cursorDate` filter. Returns null for:
 *   - null / undefined / empty string
 *   - malformed input (not a valid Date)
 *
 * Matches the route's silent-fallback policy for `limit`: invalid
 * input degrades to "no cursor" rather than 400 — the UI keeps working
 * and the user simply restarts pagination from page 1.
 */
export function decodeContinueWatchingCursor(
  cursor: string | null | undefined,
): Date | null {
  if (!cursor || typeof cursor !== "string") return null;
  const date = new Date(cursor);
  if (!Number.isFinite(date.getTime())) return null;
  return date;
}

/**
 * Pure function: returns one page of the user's "Continue Watching"
 * list — unique by product, ordered by most recently watched lesson.
 *
 * Does NOT import Prisma. Database contract is `deps.repo`. Tests
 * stub the repo (no Prisma mocks, no clock).
 *
 * Behavior:
 *   - Falsy userId → empty page `{ items: [], nextCursor: null }`.
 *   - Limit clamped to [1, MAX_CONTINUE_WATCHING_LIMIT].
 *   - Malformed cursor → null (defensive, no throw).
 *   - Dedupe by productId; ORDER preserved = first occurrence in
 *     SQL result (already ORDER BY lastWatchedAt DESC = most recent).
 *   - Defensive: rows with null `lastWatchedAt` are dropped (should
 *     NEVER happen given the WHERE clause but is belt-and-braces
 *     against future schema / migration drift).
 *   - Cursor anchor for the next page is the LAST item in the
 *     DEDUPLICATED `items` array (NOT the last Prisma row) — the
 *     dedupe map is what determines the visible page, so its tail
 *     is the correct anchor.
 *   - nextCursor is non-null iff `items.length === limit` (room for
 *     another page). Fewer items → end-of-feed → nextCursor = null.
 */
export async function buildContinueWatchingHistory(
  input: BuildContinueWatchingInput,
  deps: BuildContinueWatchingDeps,
): Promise<BuildContinueWatchingResult> {
  if (!input.userId) return { items: [], nextCursor: null };

  const limit = normalizeContinueWatchingLimit(input.limit);
  const cursorDate = decodeContinueWatchingCursor(input.cursor);
  const rows = await deps.repo.fetchRecentProgress({
    userId: input.userId,
    locale: input.locale,
    take: limit * CONTINUE_WATCHING_DEDUPE_BUFFER_MULTIPLIER,
    cursorDate,
  });

  const byProduct = new Map<string, ContinueWatchingItem>();
  for (const row of rows) {
    if (!row.lastWatchedAt) continue; // defensive (schema says NOT NULL)
    if (byProduct.has(row.lesson.product.id)) continue;
    byProduct.set(row.lesson.product.id, {
      product: row.lesson.product,
      lesson: {
        id: row.lesson.id,
        position: row.lesson.position,
        title: row.lesson.title,
        videoUrl: row.lesson.videoUrl,
      },
      lastWatchedAt: row.lastWatchedAt,
    });
    if (byProduct.size >= limit) break;
  }

  const items = Array.from(byProduct.values());
  // nextCursor is non-null ONLY when the page filled to limit AND a
  // cursor anchor exists. The cursor references the LAST item in
  // the visible (deduplicated) page — not the last Prisma row.
  const nextCursor =
    items.length === limit && items.length > 0
      ? items[items.length - 1].lastWatchedAt.toISOString()
      : null;

  return { items, nextCursor };
}