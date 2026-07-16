/**
 * src/domains/discovery/policies/policy-registry.ts
 *
 * Recommendation Policy Registry + applyPolicies composer (Courssy —
 * Fase 1 elaboration).
 *
 * ADR-0016 §2: "a single Map<string, RankingPolicy>" — this file IS
 * that registry, with the 6 default policies hot-registered. Hot-add a
 * 7th policy = create a new file exporting a `RankingPolicy` object,
 * then `.set("name", policy)` to RANKING_POLICIES here (or, more
 * idiomatically, at consumer startup). NO file fan-out needed.
 *
 * Composition contract (applyPolicies):
 *   1. Filter chain   — drop items that fail ANY filter policy predicate
 *   2. Boost chain    — compute cumulative boost score per surviving item
 *   3. Sort chain     — order by (boostScore DESC, timestamp DESC,
 *                        then SortPolicy.compare tie-breakers in
 *                        registry insertion order)
 *
 * Determinism: composition is pure of (items, ctx, registry). Same
 * inputs → same output. Testable with no mocks.
 *
 * Const vs let for the Map:
 *   `RANKING_POLICIES` is `const` (cannot reassign), but Map itself is
 *   mutable — `.set()` works. This is the standard "frozen pointer,
 *   hot payload" pattern. A consumer wanting immutable registration
 *   can wrap in Object.freeze (not done here — see ADR-0016 §2 hot-add
 *   contract).
 */

import type {
  PolicyName,
  RankingPolicy,
  ScoredItem,
} from "./policy-types";
import type { FeedItem, FeedContext } from "../feed/feed-types";

// ─── Import all 6 default policies ────────────────────────────────

import { rankByCourseProgress } from "./rank-by-course-progress";
import { rankByLanguageCompat } from "./rank-by-language-compat";
import { rankBySameCreator } from "./rank-by-same-creator";
import { rankBySameTopic } from "./rank-by-same-topic";
import { excludeAlreadyPurchased } from "./exclude-already-purchased";
import { freeBeforeUpsell } from "./free-before-upsell";

// ─── Registry: Map<PolicyName, RankingPolicy> ──────────────────────
//
// Insertion order matters because applyPolicies iterates `registry.values()`
// for score accumulation (boosts are commutative + associative, so order
// doesn't matter for SCORE) and for SortPolicy tie-breakers (order DOES
// matter — earlier sort policies win on disambiguation).
//
// Construction pattern: explicit `.set(name, policy)` chain.
// We avoid `new Map([...tuples])` because TypeScript's Map constructor
// overloads unify tuple value types with the FIRST overload match
// (BoostPolicy here), which rejects the FilterPolicy/SortPolicy variants.
// Individual `.set()` calls are monomorphic per call — TS stays happy.
export const RANKING_POLICIES = new Map<PolicyName, RankingPolicy>();

// Order: 4 boosts (accumulate) → 1 filter (early drop) → 1 sort (tie-break).
RANKING_POLICIES.set(rankByCourseProgress.name, rankByCourseProgress);
RANKING_POLICIES.set(rankByLanguageCompat.name, rankByLanguageCompat);
RANKING_POLICIES.set(rankBySameCreator.name, rankBySameCreator);
RANKING_POLICIES.set(rankBySameTopic.name, rankBySameTopic);
RANKING_POLICIES.set(excludeAlreadyPurchased.name, excludeAlreadyPurchased);
RANKING_POLICIES.set(freeBeforeUpsell.name, freeBeforeUpsell);

// ─── Public API: applyPolicies composition ────────────────────────

/**
 * Run the registry pipeline over a feed item set.
 *
 * Pipeline (deterministic):
 *   1. Filter:   for each FilterPolicy, drop items with predicate=false.
 *                Filters run in registry insertion order; an item is
 *                dropped if ANY filter rejects it.
 *   2. Score:    for each surviving item, accumulate boost from every
 *                BoostPolicy. Sum across all boosters (commutative).
 *   3. Sort:     primary key = cumulative boost score DESC
 *                secondary   = timestamp DESC (most recent first)
 *                tie-break   = SortPolicy.compare in registry order
 *
 * The pipeline does NOT apply tier priority — tier based ordering is
 * owned by `feed-ranking-policy.ts#rankItems` (separate concern per
 * ADR-0016 §Domain separation rule). The registry is a WITHIN-set
 * refinement layer that operates between tier-rank and the final
 * page slice.
 *
 * Returns a NEW array; input is not mutated.
 */
export function applyPolicies(
  items: FeedItem[],
  ctx: FeedContext,
  registry: Map<PolicyName, RankingPolicy> = RANKING_POLICIES,
): FeedItem[] {
  // ── 1. Filter chain ──────────────────────────────────────────
  let survived = items;
  for (const policy of registry.values()) {
    if (policy.kind === "filter") {
      survived = survived.filter((item) => policy.predicate(item, ctx));
    }
  }

  // ── 2. Score (boost accumulation) ────────────────────────────
  const scored: ScoredItem[] = survived.map((item) => {
    let boostScore = 0;
    for (const policy of registry.values()) {
      if (policy.kind === "boost") {
        boostScore += policy.score(item, ctx);
      }
    }
    return { item, boostScore, timestamp: getTimestamp(item) };
  });

  // ── 3. Sort: (boostScore DESC, timestamp DESC, sort tie-break) ──
  scored.sort((a, b) => {
    if (a.boostScore !== b.boostScore) return b.boostScore - a.boostScore;
    if (a.timestamp !== b.timestamp) return b.timestamp - a.timestamp;
    // Sort tie-break: iterate in registry insertion order; first
    // non-zero comparator wins.
    for (const policy of registry.values()) {
      if (policy.kind === "sort") {
        const cmp = policy.compare(a.item, b.item, ctx);
        if (cmp !== 0) return cmp;
      }
    }
    return 0;
  });

  return scored.map((s) => s.item);
}

// ─── Internal: timestamp helper ──────────────────────────────────
// Mirrors feed-ranking-policy.ts#getTimestamp — duplicated to avoid
// coupling the policy layer to the rank layer (ADR-0016 §2 registry
// is data + composition; doesn't import the ranker).
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
