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
 */

import {
  COURSES,
  ACTIVE_COURSES,
  DEFAULT_LANDING_SLUG,
  findCourseMeta,
  type CourseMeta,
} from "../../../courses.config";

// CourseMeta passthrough — still lives in courses.config.ts (registry source).
export type { CourseMeta };
// CourseTemplateId re-exported here so server components that pull the
// façade (registry) don't need a second import path for the template id.
export type { CourseTemplateId } from "@/lib/courses/templates";
export { COURSES, ACTIVE_COURSES, DEFAULT_LANDING_SLUG, findCourseMeta };

/** All known slugs (active + draft + archived) — used by CI registry vs DB audit. */
export function getAllSlugs(): string[] {
  return COURSES.map((c) => c.slug);
}

/** Active slugs only — used by marketing catalog. */
export function getActiveSlugs(): string[] {
  return ACTIVE_COURSES.map((c) => c.slug);
}

/** Slug → status map — used by sync audit & dashboards. */
export function getCoursesByStatus(): Record<string, CourseMeta["status"]> {
  return Object.fromEntries(COURSES.map((c) => [c.slug, c.status]));
}

/** Marker constant for log/audit lines. Cheap O(1) membership check. */
const _SLUG_SET: ReadonlySet<string> = new Set(COURSES.map((c) => c.slug));

/** Returns true if the slug is registered. O(1). */
export function isRegisteredCourse(slug: string): boolean {
  return _SLUG_SET.has(slug);
}
