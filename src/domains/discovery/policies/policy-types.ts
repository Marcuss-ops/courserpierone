/**
 * src/domains/discovery/policies/policy-types.ts
 *
 * Recommendation Policy Registry types (Courssy — Fase 1 elaboration).
 *
 * ADR-0016 §2 Registry pattern: a single Map<string, RankingPolicy>
 * that hot-adds policies without editing 5 files. Each policy is a
 * discriminated union (kind tag = 'boost' | 'filter' | 'sort') so the
 * `applyPolicies` runner in policy-registry.ts can use an exhaustive
 * switch over the registry values (TS strictness enforces coverage).
 *
 * ADR-0016 §Domain rule: pure logic only. No prisma / next / fs / redis
 * imports. The policies themselves are pure functions of (FeedItem,
 * FeedContext) → numeric score / predicate / comparator. Deterministic —
 * no RNG, no clock deps per Strategy doc §1.6 contract.
 *
 * Composition contract (policy-registry.ts#applyPolicies):
 *   1. Filter:   drop items via predicates (early-exit on first drop)
 *   2. Boost:    compute cumulative score per remaining item
 *   3. Sort:     comparator over all (Score DESC, Timestamp DESC,
 *                SortPolicy.compare tie-breakers)
 *
 * The 6 policies (per Fase 1 spec):
 *   boost       → rank-by-course-progress      (lesson in startedCourseIds)
 *   boost       → rank-by-language-compat      (item.lang === ctx.lang)
 *   boost       → rank-by-same-creator         (item.creatorId in followed)
 *   boost       → rank-by-same-topic           (item.topics ∩ observedTopics)
 *   filter      → exclude-already-purchased    (free/premium owned → drop)
 *   sort        → free-before-upsell            (free_course < premium_course tie)
 *
 * Note on `'observe' fields in current FeedItem taxonomy`:
 *   rank-by-language-compat + rank-by-same-topic return 0 for items
 *   that don't carry `lang` / `topics` fields. Those policies become
 *   ACTIVE as soon as upstream builder populates those fields (V2).
 *   YAGNI for MVP — the policies are SHIPPED now so that future
 *   field-population ad-hoc activation is no commit.
 */

import type { FeedItem, FeedContext } from "../feed/feed-types";

export const POLICY_KINDS = ["boost", "filter", "sort"] as const;
export type PolicyKind = (typeof POLICY_KINDS)[number];

// ─── Policy variant discriminated unions ───────────────────────────

/** Boost policy — returns numeric score contribution (>= 0). */
export interface PolicyMetadata {
  /** Human-readable description used by dashboards and audits. */
  description: string;
  /** Source module path relative to the policy registry. */
  file: string;
  /** Advisory score hint for boost policies. */
  scoreHint?: number;
}

export interface BoostPolicy extends PolicyMetadata {
  kind: "boost";
  /** Static registry key. */
  name: PolicyName;
  /** Score contribution for item. 0 = no contribution. */
  score(item: FeedItem, ctx: FeedContext): number;
}

/** Filter policy — predicate. true = keep, false = drop. */
export interface FilterPolicy extends PolicyMetadata {
  kind: "filter";
  name: PolicyName;
  predicate(item: FeedItem, ctx: FeedContext): boolean;
}

/** Sort policy — pairwise comparator (used for tie-break). */
export interface SortPolicy extends PolicyMetadata {
  kind: "sort";
  name: PolicyName;
  /** Returns -1 | 0 | 1 (Array.sort-compatible). */
  compare(a: FeedItem, b: FeedItem, ctx: FeedContext): -1 | 0 | 1;
}

export type RankingPolicy = BoostPolicy | FilterPolicy | SortPolicy;

// ─── Registry key union — static guarantee on valid names ──────────
//
// Adding a new policy = extend this union + register in RANKING_POLICIES
// + add a new file. No other file needs to change (per ADR-0016 §2
// "no anticipatory folders" — registry is data + composition only).
/** Policy keys are owned by the runtime RANKING_POLICIES map. */
export type PolicyName = string;

// ─── Internal: scored item for applyPolicies composition ───────────
export interface ScoredItem {
  item: FeedItem;
  /** Cumulative boost score across all BoostPolicies in registry. */
  boostScore: number;
  /** Numeric timestamp for tie-break (most recent first). */
  timestamp: number;
}
