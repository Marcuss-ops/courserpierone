/**
 * src/domains/discovery/policies/rank-by-same-topic.ts
 *
 * Boost policy #4 (Courssy — Fase 1 elaboration).
 *
 * Boosts items whose `topics` array has at least one tag in common with
 * the user's `observedTopics`. Returns 20 if intersection is non-empty,
 * 0 otherwise (or if item has no `topics` field).
 *
 * Current status (Fase 1 elaboration MVP):
 *   No FeedItem variant declares an explicit `topics: string[]` field
 *   in MVP. Crossing the `'topics' in item` guard returns 0 — graceful
 *   no-op. The policy is SHIPPED so when upstream builder populates
 *   `topics` (V2 — derived from completed lessons per ADR-0016 Future
 *   §5), the boost activates zero-commit.
 *
 * Note on `observedTopics`:
 *   `ctx.observedTopics` is documented as V1 `[]` placeholder in
 *   feed-types.ts (until V2 derives it from completed lessons). Even
 *   if items carried `topics`, an empty `observedTopics` makes this
 *   policy always return 0. Both sides activate together in V2.
 *
 * Determinism: pure function of (item, ctx). No clock, no RNG.
 */

import type { BoostPolicy } from "./policy-types";

export const BOOST_SAME_TOPIC = 20;

export const rankBySameTopic: BoostPolicy = {
  kind: "boost",
  name: "rank-by-same-topic",
  file: "./rank-by-same-topic",
  description: "Boosts items whose topics intersect observedTopics (+20 +5/cardinality, cap +30)",
  scoreHint: 20,
  score(item, ctx) {
    // Graceful no-op if item lacks topics field (current MVP variants).
    if ("topics" in item) {
      const topics = (item as { topics?: unknown }).topics;
      if (Array.isArray(topics)) {
        // Cardinality-weighted contribution: items with MORE matching
        // topics get a stronger boost. Each match adds a flat +5 on
        // top of the base 20 (capped at +40 to prevent domination).
        const matches = topics.filter(
          (t): t is string => typeof t === "string" && ctx.observedTopics.includes(t),
        ).length;
        if (matches === 0) return 0;
        const weighted = BOOST_SAME_TOPIC + Math.min(matches - 1, 2) * 5;
        return Math.min(weighted, BOOST_SAME_TOPIC + 10);
      }
    }
    return 0;
  },
};
