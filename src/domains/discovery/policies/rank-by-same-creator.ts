/**
 * src/domains/discovery/policies/rank-by-same-creator.ts
 *
 * Boost policy #3 (Courssy — Fase 1 elaboration).
 *
 * Boosts items originating from a creator the user already follows.
 * Returns 30 if `item.creatorId ∈ ctx.followedCreatorIds`, 0 otherwise.
 *
 * Applies to:
 *   - lesson (kind: 'lesson')         — has explicit `creatorId`
 *   - creator_update (kind: ...)      — has explicit `creatorId`
 *
 * Other item kinds cannot have a creatorId in MVP taxonomy
 * (ContinueLearningItem / CommunityPostItem / FreeCourseItem /
 * PremiumCourseItem don't expose creatorId directly — would need
 * upstream lookup by productId which is I/O). Returns 0 for safety.
 *
 * Note on Follow table:
 *   `ctx.followedCreatorIds` is a V1 PLANNED PLACEHOLDER derived from
 *   creators of ownedProductIds (proxy). Real Follow table is V2 per
 *   ADR-0016 Future §5. Once Follow lands, this policy activates
 *   correctly because the type contract is unchanged.
 *
 * Determinism: pure function of (item, ctx). No clock, no RNG.
 */

import type { BoostPolicy } from "./policy-types";

export const BOOST_SAME_CREATOR = 30;

export const rankBySameCreator: BoostPolicy = {
  kind: "boost",
  name: "rank-by-same-creator",
  file: "./rank-by-same-creator",
  description: "Boosts items from followed creators (+30)",
  scoreHint: 30,
  score(item, ctx) {
    // Type-narrowed per item.kind — only variants with explicit
    // `creatorId` field can boost.
    switch (item.kind) {
      case "lesson":
      case "creator_update":
        return ctx.followedCreatorIds.includes(item.creatorId)
          ? BOOST_SAME_CREATOR
          : 0;
      case "continue_learning":
      case "community_post":
      case "free_course":
      case "premium_course":
        return 0;
    }
  },
};
