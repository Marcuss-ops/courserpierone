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
 *     .findMany with deep includes). Defensive `take: limit * 2`
 *     absorbs the per-product dedupe cost.
 *   - AppJS `Map` dedupe by productId (Prisma `distinct` does not
 *     work across relation boundaries).
 *   - No secondary counting query — YAGNI for a capped widget list.
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
  type ContinueWatchingItem,
  type ContinueWatchingRepository,
  type RawContinueWatchingProgress,
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
 * Pure function: returns the user's "Continue Watching" list —
 * unique by product, ordered by most recently watched lesson.
 *
 * Does NOT import Prisma. Database contract is `deps.repo`. Tests
 * stub the repo (no Prisma mocks, no clock).
 *
 * Behavior:
 *   - Falsy userId → [] (no error; dashboard's empty widget).
 *   - Limit clamped to [1, MAX_CONTINUE_WATCHING_LIMIT].
 *   - Dedupe by productId; ORDER preserved = first occurrence in
 *     SQL result (already ORDER BY lastWatchedAt DESC = most recent).
 *   - Defensive: rows with null `lastWatchedAt` are dropped (should
 *     NEVER happen given the WHERE clause but is belt-and-braces
 *     against future schema / migration drift).
 */
export async function buildContinueWatchingHistory(
  input: BuildContinueWatchingInput,
  deps: BuildContinueWatchingDeps,
): Promise<ContinueWatchingItem[]> {
  if (!input.userId) return [];

  const limit = normalizeContinueWatchingLimit(input.limit);
  const rows = await deps.repo.fetchRecentProgress({
    userId: input.userId,
    locale: input.locale,
    take: limit * CONTINUE_WATCHING_DEDUPE_BUFFER_MULTIPLIER,
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

  return Array.from(byProduct.values());
}
