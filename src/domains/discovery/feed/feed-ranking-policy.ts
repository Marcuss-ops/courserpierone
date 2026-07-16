/**
 * Feed ranking policy (Courssy — Fase 1 deterministic rules).
 *
 * ADR-0016 §Domain rule: pure functions, no I/O, no framework imports.
 * Strategy doc §1.6 (Fase 1) ranking priority order:
 *   1. continue_learning  (corso iniziato)
 *   2. lesson            (nuova lezione di un corso posseduto)
 *   3. community_post    (post del creator già seguito)
 *   4. free_course       (corso gratuito pertinente)
 *   5. (topic_match: V2 marker — YAGNI placeholder, no items emitted MVP)
 *   6. premium_course    (prodotto premium suggerito — ultima ratio)
 *   - creator_update    (priority 3; same tier as community_post MVP)
 *
 * Within a priority tier: tie-break by timestamp descending (most
 * recent first). Stable sort across tiers produces deterministic
 * output even for inputs with the same priority.
 *
 * Determinism contract: no RNG, no clock dependencies. Ranking is
 * a pure function of items + ctx. Testable without mocks.
 */

import type { FeedItem } from "./feed-types";

// Marker type: FeedContext imported lazily here only because the
// reference is in `_ctx` parameter (ignored). Kept for API symmetry
// with future ctx-aware policies.
import type { FeedContext } from "./feed-types";

const PRIORITY: Record<FeedItem["kind"], number> = {
  continue_learning: 1,
  lesson: 2,
  community_post: 3,
  free_course: 4,
  // topic_match: V2 marker — no items emitted, but priority reserved.
  // Producer middleware may emit topic_match later; tier = 5 between
  // free_course and premium_course per strategy doc §1.6 step 5.
  premium_course: 6,
  // creator_update: same tier as community_post. MVP emits community_post
  // only; creator_update reserved for V2 split (distinct notification
  // shape pushed to creator inbox, not the student-centered feed).
  creator_update: 3,
};

/**
 * rankItems: deterministic ordering. Returns a NEW array; input is
 * not mutated. Within-tier: most recent first (DESC).
 */
export function rankItems(items: FeedItem[], _ctx: FeedContext): FeedItem[] {
  return [...items].sort((a, b) => {
    const pa = PRIORITY[a.kind] ?? 99;
    const pb = PRIORITY[b.kind] ?? 99;
    if (pa !== pb) return pa - pb;
    // Tie-break by timestamp descending (newer first).
    const aTime = getTimestamp(a);
    const bTime = getTimestamp(b);
    return bTime - aTime;
  });
}

function getTimestamp(item: FeedItem): number {
  switch (item.kind) {
    case "continue_learning":
      return item.lastWatchedAt.getTime();
    case "lesson":
    case "community_post":
    case "free_course":
    case "premium_course":
    case "creator_update":
      return item.createdAt.getTime();
  }
}

/**
 * getPriority: exposed for analytics / A/B test instrumentation.
 * Returns the priority tier (1-6+) for a single FeedItem.
 */
export function getPriority(item: FeedItem): number {
  return PRIORITY[item.kind] ?? 99;
}
