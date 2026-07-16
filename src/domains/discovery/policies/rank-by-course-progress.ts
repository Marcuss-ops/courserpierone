/**
 * src/domains/discovery/policies/rank-by-course-progress.ts
 *
 * Boost policy #1 (Courssy — Fase 1 elaboration).
 *
 * Boosts items where the user has already started the underlying course.
 * Strongest semantic boost (100) — picks up where the user left off in
 * any course they touched, mirroring the "continue_learning" tier (1)
 * with finer-grained within-tier ranking for the lesson/continue items.
 *
 * Applies to:
 *   - lesson (kind: 'lesson')         — new lesson from a started course
 *   - continue_learning (kind: …)     — resume-prompt for a started course
 *
 * Returns 0 for all other item kinds (no signal, no penalty).
 *
 * Determinism: pure function of (item, ctx). No clock, no RNG.
 * Tested in policies.test.ts isolated from other boosts.
 */

import type { BoostPolicy } from "./policy-types";

export const BOOST_COURSE_PROGRESS = 100;

export const rankByCourseProgress: BoostPolicy = {
  kind: "boost",
  name: "rank-by-course-progress",
  score(item, ctx) {
    // Type-narrowed switch — only items with productId can participate.
    switch (item.kind) {
      case "lesson":
      case "continue_learning":
        return ctx.startedCourseIds.includes(item.productId)
          ? BOOST_COURSE_PROGRESS
          : 0;
      case "free_course":
      case "premium_course":
      case "community_post":
      case "creator_update":
        return 0;
    }
  },
};
