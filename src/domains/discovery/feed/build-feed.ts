/**
 * buildFeed UseCase (Courssy — Fase 1 MVP).
 *
 * ADR-0016 §Application UseCase: orchestrates auth/validation/state + calls
 * the Port. Direct I/O is FORBIDDEN here — database access happens only
 * through the injected `repo: FeedRepository` abstraction.
 *
 * NO OpenAI / no LLM in the request path. NO embeddings / no vector
 * lookup. NO full catalog in memory. Strategy doc §Fase 1 explicitly:
 * "Niente AI, embeddings o machine learning. Regole deterministiche e
 * testabili, ranking pure-function, max 4-6 query aggregate."
 *
 * Cursor strategy:
 *   - nextCursor = ISO timestamp of the OLDEST item in the current page.
 *   - Repository filter is "items strictly older than cursor".
 *   - When items.length < requested pageSize, end-of-feed reached.
 *
 * Performance budget per strategy doc §Fase 1:
 *   - 2 parallel Prisma queries (bounded per repo contract).
 *   - O(N log N) ranking on merged candidates (N ≤ PER_SOURCE_LIMIT ×
 *     source count; + constant factor for small limits).
 *   - P95 < 300ms with warm pool per Next.js prod benchmark.
 *
 * Errors propagate to the caller — the caller (route handler) is
 * responsible for classification (transient/permanent) per ADR-0014
 * error-classifier pattern. Don't catch in the UseCase; that masks
 * failures from retry/ack logic.
 */

import type {
  BuildFeedInput,
  FeedItem,
  FeedResult,
} from "./feed-types";
import type { FeedRepository, FeedSourceContext } from "./feed-repository";
import { rankItems } from "./feed-ranking-policy";

const DEFAULT_PAGE_SIZE = 20;
const PER_SOURCE_LIMIT = 10;

/**
 * buildFeed: orchestrate ranking + cursor pagination.
 *
 * @param repo  Port injected by caller (Production: PrismaFeedRepository).
 * @param input FeedContext + optional pageSize + optional cursor from prev page.
 *
 * Steps:
 *   1. Build source-context from FeedContext.
 *   2. Parallel fetch from 2 sources via Promise.all (≤ 200ms typical).
 *   3. Merge + deterministic rank.
 *   4. Cap to pageSize.
 *   5. Compute nextCursor (null when fewer items than requested).
 */
export async function buildFeed(
  repo: FeedRepository,
  input: BuildFeedInput,
): Promise<FeedResult> {
  const pageSize = input.pageSize ?? DEFAULT_PAGE_SIZE;

  const sourceCtx: FeedSourceContext = {
    userId: input.context.userId,
    ownedProductIds: input.context.ownedProductIds,
    followedCreatorIds: input.context.followedCreatorIds,
    lang: input.context.lang,
    country: input.context.country,
    cursor: input.cursor ?? null,
    limit: PER_SOURCE_LIMIT,
  };

  // 2 parallel aggregate fetches (bounded per ADR-0016 dep rule + Fase 1 budget).
  const [continueLearning, recentLessons] = await Promise.all([
    repo.fetchContinueLearning(sourceCtx),
    repo.fetchRecentLessons(sourceCtx),
  ]);

  const allItems: FeedItem[] = [...continueLearning, ...recentLessons];
  const ranked = rankItems(allItems, input.context);
  const capped = ranked.slice(0, pageSize);

  // nextCursor: present only if page was exactly full (room for another
  // page). The cursor references the OLDEST item in this page; the
  // repository treats it as "fetch older than this".
  const oldest = capped[capped.length - 1];
  const nextCursor =
    capped.length === pageSize && oldest ? encodeTimestamp(oldest) : null;

  return { items: capped, nextCursor };
}

function encodeTimestamp(item: FeedItem): string {
  switch (item.kind) {
    case "continue_learning":
      return item.lastWatchedAt.toISOString();
    case "lesson":
    case "community_post":
    case "free_course":
    case "premium_course":
    case "creator_update":
      return item.createdAt.toISOString();
  }
}
