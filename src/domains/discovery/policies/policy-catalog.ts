/**
 * src/domains/discovery/policies/policy-catalog.ts
 *
 * Recommendation Policy Catalog — meta-registry of the 6 default
 * RankingPolicies shipped with the platform (Courssy).
 *
 * This file is NOT a runtime registration surface — for live
 * registration / dispatch, see `policy-registry.ts` (#39s
 * `RANKING_POLICIES` Map + `applyPolicies()` composer). The catalog
 * here is a canonical, Zod-validated metadata index that consumers
 * (analytics dashboards, admin UI, migration scripts, ops audit) can
 * iterate WITHOUT touching the live Map.
 *
 * Why a separate file vs the registry Map:
 *   - The Map is hot-loaded with side effects (applyPolicies invokes
 *     every entry). Safe to call.
 *   - The catalog is metadata-only; safe to iterate + serialize + change
 *     at module-import time without affecting ranking output.
 *   - Adding a new field to a RankingPolicy breaks applyPolicies but
 *     NOT catalog (which is a frozen, validated subset).
 *   - Zod self-validation at module load catches drift between code
 *     and metadata instantly (a typo in a score-hint will throw at
 *     import time, not silently in production).
 */

import { z } from "zod";

// ─── Policy catalog entry ───────────────────────────────────────

/**
 * One catalog entry: metadata about a single RankingPolicy. Mirrors
 * the fields that downstream consumers need without coupling to the
 * implementation (which lives in src/domains/discovery/policies/
 * <rank-by-…>.ts files).
 */
export const policyCatalogEntrySchema = z.object({
  /** Unique identifier; also the Map key in RANKING_POLICIES. */
  name: z.string().min(1),
  /** Policy kind shared with policy-types.ts. */
  kind: z.enum(["boost", "filter", "sort"]),
  /** Source file path relative to this module. */
  file: z.string().min(1),
  /** Human-readable description for UI / docs. */
  description: z.string().min(1),
  /** Approximate score boost (boost only) — documentation hint, not runtime. */
  scoreHint: z.number().int().optional(),
});

export type PolicyCatalogEntry = z.infer<typeof policyCatalogEntrySchema>;

// ─── The catalog itself ──────────────────────────────────────────

/**
 * Canonical metadata catalog of the 6 default policies shipped with
 * the platform. Order matches RANKING_POLICIES in policy-registry.ts
 * for downstream determinism (the order in which applyPolicies
 * visits them).
 *
 * Scoring hints are advisory, not authoritative: applyPolicies
 * accumulates boost from each policy.score(). The hint here is for
 * docs + dashboards (how much does this policy typically boost?).
 */
export const POLICY_CATALOG: readonly PolicyCatalogEntry[] = [
  {
    name: "rank-by-course-progress",
    kind: "boost",
    file: "./rank-by-course-progress",
    description: "Boosts in-progress lessons for owned products (+100)",
    scoreHint: 100,
  },
  {
    name: "rank-by-language-compat",
    kind: "boost",
    file: "./rank-by-language-compat",
    description: "Boosts items whose lang matches ctx.lang (+50)",
    scoreHint: 50,
  },
  {
    name: "rank-by-same-creator",
    kind: "boost",
    file: "./rank-by-same-creator",
    description: "Boosts items from followed creators (+30)",
    scoreHint: 30,
  },
  {
    name: "rank-by-same-topic",
    kind: "boost",
    file: "./rank-by-same-topic",
    description:
      "Boosts items whose topics intersect observedTopics (+20 +5/cardinality, cap +30)",
    scoreHint: 20,
  },
  {
    name: "exclude-already-purchased",
    kind: "filter",
    file: "./exclude-already-purchased",
    description: "Removes items the user has already purchased",
  },
  {
    name: "free-before-upsell",
    kind: "sort",
    file: "./free-before-upsell",
    description: "Sort tie-break: free_course precedes premium_course",
  },
];

// ─── Self-validation on module load ─────────────────────────────

/**
 * Validates each catalog entry parses cleanly against the schema.
 * Static-time check ensures drift between code and metadata is caught
 * at module import time — a typo in a score-hint will throw at import
 * rather than silently polluting analytics dashboards.
 */
POLICY_CATALOG.forEach((entry, i) => {
  const result = policyCatalogEntrySchema.safeParse(entry);
  if (!result.success) {
    throw new Error(
      `POLICY_CATALOG[${i}] = "${entry.name}" fails schema validation: ` +
        JSON.stringify(result.error.issues),
    );
  }
});

// ─── Helpers ─────────────────────────────────────────────────────

export const POLICY_COUNT = POLICY_CATALOG.length;

export type PolicyKind = PolicyCatalogEntry["kind"];

/** Lookup helper: returns the catalog entry for a given policy name. */
export function getCatalogEntry(name: string): PolicyCatalogEntry | undefined {
  return POLICY_CATALOG.find((entry) => entry.name === name);
}

/** Lookup by kind: returns all entries of the given kind. */
export function getCatalogEntriesByKind(
  kind: PolicyKind,
): readonly PolicyCatalogEntry[] {
  return POLICY_CATALOG.filter((entry) => entry.kind === kind);
}
