/**
 * src/domains/discovery/policies/free-before-upsell.ts
 *
 * Sort policy #1 (Courssy — Fase 1 elaboration).
 *
 * Tie-break comparator: when two items are otherwise equal (same
 * priority tier + same boost score + same timestamp), prefer the
 * free_course over the premium_course. Implements the
 * "free before upsell" hint in feed-ranking strategy §1.6 step 5.
 *
 * Current MVP behavior:
 *   Tier priority (feed-ranking-policy.ts) already structurally
 *   separates free_course (tier 4) < premium_course (tier 6), so this
 *   comparator is a no-op for current ranking. We SHIP it because:
 *     (a) future classification strategies (e.g., V2 expansion that
 *         emits both kinds within the same tier bundle) need a safe
 *         default ordering across free/premium pairs;
 *     (b) it documents intent — the strategy doc §1.6 step 5 spells
 *         "free before upsell" and the policy is its typed binding;
 *     (c) zero maintenance cost — pure function over item kinds.
 *
 * For other item kinds: returns 0 (preserve existing order).
 *
 * Determinism: pure comparator. No clock, no RNG.
 */

import type { SortPolicy } from "./policy-types";

export const freeBeforeUpsell: SortPolicy = {
  kind: "sort",
  name: "free-before-upsell",
  file: "./free-before-upsell",
  description: "Sort tie-break: free_course precedes premium_course",
  compare(a, _b, _ctx) {
    // Comparator asymmetry: only `a` matters here because Array.sort
    // invokes compare(a,b) and compare(b,a) — we WANT free_course to
    // come BEFORE premium_course, regardless of which position each
    // is in the input. Returning -1 for (a=free, b=premium) and +1
    // for the symmetric case gives a stable, total ordering.
    if (a.kind === "free_course") {
      // If b is premium, free comes first.
      // (Other kinds → 0, preserve caller's order.)
      return _b.kind === "premium_course" ? -1 : 0;
    }
    if (a.kind === "premium_course" && _b.kind === "free_course") {
      return 1;
    }
    return 0;
  },
};
