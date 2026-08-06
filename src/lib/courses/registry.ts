/**
 * src/lib/courses/registry.ts — Typed adapter around `courses.config.ts`.
 *
 * This file exists to give server components a stable, type-checked accessor
 * for the platform course registry without forcing them to import the root
 * `courses.config.ts` (which lives outside `src/` and would require unusual
 * tsconfig include rules). The adapter is a thin re-export + lookup helpers.
 *
 * Used by:
 *   • `src/app/courses/page.tsx`         (registry-driven marketing catalog)
 *   • `scripts/products/sync-local-config.ts` (DB upsert on Products + Cache)
 *   • `scripts/db/seed-youtube-channels.ts`  (defaultLandingSlug source)
 *   • `scripts/audit-v1-readiness.ts`        (registry ↔ data/ coupon sync audit)
 *
 * IMPORTANT: for ORDER / ACCESS / AUTH state, query Prisma `Product` directly.
 * This registry holds MARKETING METADATA only — no payment, no permissions.
 *
 * Post-Phase 3 split (bundled vs user-published):
 *   - `BUNDLED_COURSES` / `ACTIVE_BUNDLED_COURSES` / `isBundledCourse` are
 *     the new bundled-only surface; prefer these in new code.
 *   - `ACTIVE_COURSES` is preserved as a back-compat alias of
 *     `ACTIVE_BUNDLED_COURSES`; old callers transparently get the
 *     bundled-only view (user-published entries are filtered out).
 *   - For creator-driven product reads, use `Product` directly via
 *     `src/lib/data/...` — never through this registry.
 *   - `resolveCourseRegistration` is the single public lookup for bundled
 *     registration metadata; unknown slugs resolve to null.
 */

import {
  BUNDLED_COURSES,
  ACTIVE_BUNDLED_COURSES,
  ACTIVE_COURSES,
  COURSES,
  findCourseMeta,
  isBundledCourse,
  type CourseKind,
  type CourseMeta,
} from "../../../courses.config";

// CourseMeta passthrough — still lives in courses.config.ts (registry source).
export type { CourseMeta, CourseKind };
// CourseTemplateId re-exported here so server components that pull the
// façade (registry) don't need a second import path for the template id.
export type { CourseTemplateId } from "@/lib/courses/templates";
export {
  BUNDLED_COURSES,
  ACTIVE_BUNDLED_COURSES,
  ACTIVE_COURSES,
  COURSES,
  findCourseMeta,
  isBundledCourse,
};

export interface CourseRegistration {
  kind: "bundled";
  meta: CourseMeta;
}

/** Resolve a bundled course registration; null means DB-owned or unknown. */
export function resolveCourseRegistration(slug: string): CourseRegistration | null {
  const meta = findCourseMeta(slug);
  if (!meta || !isBundledCourse(slug)) return null;
  return { kind: "bundled", meta };
}

/** All known slugs (bundled + user-published, regardless of status). */
export function getAllSlugs(): string[] {
  return COURSES.map((c) => c.slug);
}

/** Bundled-only slugs (active + draft + archived). */
export function getBundledSlugs(): string[] {
  return BUNDLED_COURSES.map((c) => c.slug);
}

/** Active slugs only — used by marketing catalog. Bundled-only view. */
export function getActiveSlugs(): string[] {
  return ACTIVE_BUNDLED_COURSES.map((c) => c.slug);
}

/** Slug → status map — used by sync audit & dashboards. */
export function getCoursesByStatus(): Record<string, CourseMeta["status"]> {
  return Object.fromEntries(COURSES.map((c) => [c.slug, c.status]));
}

/** Marker constant for log/audit lines. Cheap O(1) membership check. */
const _SLUG_SET: ReadonlySet<string> = new Set(COURSES.map((c) => c.slug));

/** Returns true if the slug is registered (bundled OR user-published). O(1). */
export function isRegisteredCourse(slug: string): boolean {
  return _SLUG_SET.has(slug);
}
