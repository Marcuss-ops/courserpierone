/**
 * src/domains/discovery/policies/exclude-already-purchased.ts
 *
 * Filter policy #1 (Courssy — Fase 1 elaboration).
 *
 * HARD filter: drop items the user already has access to so they don't
 * see recommeendations for products they own. Predicate returns
 * `true` (keep) or `false` (drop, will be filtered out by applyPolicies).
 *
 * Applies to:
 *   - free_course    (free course already owned → no upsell signal)
 *   - premium_course (paid course already purchased → no upsell)
 *   - lesson         (lesson of an owned product → no upsell)
 *
 * Skips / keeps always:
 *   - continue_learning  — by definition, the user already owns those;
 *                         this tier (1) should NOT be filtered out
 *                         (it's a resume-prompt, not an upsell)
 *   - community_post     — creator-content attached to a product; even
 *                         if the user has the product, community posts
 *                         are NEW signals (not the product itself)
 *   - creator_update     — creator-broadcast content; doesn't relate
 *                         to a specific product ownership status
 *
 * Determinism: pure predicate. No clock, no RNG. Idempotent over
 * repeated applyPolicies calls.
 */

import type { FilterPolicy } from "./policy-types";

export const excludeAlreadyPurchased: FilterPolicy = {
  kind: "filter",
  name: "exclude-already-purchased",
  predicate(item, ctx) {
    switch (item.kind) {
      case "free_course":
      case "premium_course":
      case "lesson":
        // Drop if product already owned.
        return !ctx.ownedProductIds.includes(item.productId);
      case "continue_learning":
      case "community_post":
      case "creator_update":
        // Always keep — these are signals, not upsell items.
        return true;
    }
  },
};
