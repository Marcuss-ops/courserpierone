/**
 * courses.config.ts — Bundled/plugin-installed course registry.
 *
 * SCOPE (post-Phase 3): this registry is the source-of-truth ONLY for
 * courses that ship as PART OF THE PLATFORM — bundled courses, official
 * plugins installed by deploys, demo / template content. Creator-driven
 * products (where a User creates a Product via the studio/UI) are NOT
 * declared here; they live exclusively in the `Product` Prisma table
 * and are surfaced via the standard `Product` resolvers (no entry in
 * `COURSES[]`, no `courses/<slug>/` folder on disk, no sync via
 * `scripts/products/sync-local-config.ts`).
 *
 * Why this split?
 *   - Bundled courses need version-controlled, repo-shipped content
 *     (locales/*.json, components/) because they must render reliably
 *     without depending on a creator's session.
 *   - Creator-driven products live entirely in the DB; their landing
 *     pages are rendered from `Product` + `ProductTranslation` +
 *     (optional) `ProductDocument` + `ContentPage` tree. They are
 *     never registered in this file.
 *
 *   The split makes the canonical distinction clear: this file is
 *   "what ships with the deployment"; `Product` is "what creators
 *   authored".
 *
 * Where each entry goes after declaration:
 *   • `scripts/products/sync-local-config.ts <slug>` reads
 *     `courses/<slug>/config.json` and upserts BOTH `Product`
 *     (marketing/access metadata) AND `CourseConfigCache`
 *     (precomputed config JSON). User-published slugs (entries
 *     declared with `kind: "user-published"`) are loudly rejected.
 *   • `src/app/courses/page.tsx` (registry-driven catalog) enumerates
 *     `BUNDLED_COURSES` (filtered).
 *   • `scripts/db/seed-youtube-channels.ts` generates locale-specific
 *     YouTube channels per course using `course.slug` as
 *     `defaultLandingSlug`.
 *
 * Add a new bundled course:
 *   1. Drop folder at `courses/<new-slug>/{locales,components,config.json}`.
 *   2. Add an entry to `COURSES` below (default `kind: "bundled"` is
 *      implicit when omitted).
 *   3. `npx tsx scripts/products/sync-local-config.ts <new-slug>` →
 *      upserts DB.
 *   4. Commit + push. Zero core-code changes.
 *
 * Removing this file is NOT possible — it is the import target for
 * ALL course-aware scripts.
 */

import type { CourseTemplateId } from "./src/lib/courses/templates";

/**
 * Distinguishes bundled/plugin courses from creator-driven ones.
 * - `"bundled"` (default if absent) — ship with the deployment,
 *   have a `courses/<slug>/` folder on disk, synced via the local-config
 *   script.
 * - `"user-published"` — explicitly cataloged here so a creator can
 *   have a slug that LOOKS like a bundled course but is actually
 *   creator-driven. The sync script loudly refuses to handle these;
 *   the audit script ignores them in its bundled-only drift checks.
 *   Use case: a deploy-time allowlist for "official" creator
 *   products that should appear alongside bundled courses in the
 *   marketing catalog but whose data lives ONLY in DB.
 */
export type CourseKind = "bundled" | "user-published";

export interface CourseMeta {
  /** URL slug — must match `Product.slug` (Postgres @unique). */
  slug: string;
  /** Display title (default locale-agnostic; localized via `locales/<code>.json`). */
  title: string;
  /** One-sentence tagline used in marketing catalog card. */
  tagline: string;
  /**
   * Course rendering template — selects the components/ folder at runtime.
   *
   * Includes `default` for smoke-tests and placeholder courses that ship
   * without a dedicated components/ folder: `[domain]/page.tsx` falls
   * through to inline JSX when this templateId is rendered. Single
   * source of truth: `src/lib/courses/templates.ts`.
   */
  templateId: CourseTemplateId;
  /** Cover image path (served from /public). */
  coverImage: string;
  /** Locales this course ships content for. Used for the /courses filter chips. */
  locales: string[];
  /** Direct-me channel accent color (hex). Falls back to #D4A056. */
  accentColor?: string;
  status: "active" | "draft" | "archived";
  /**
   * Origin classification. Default `"bundled"` if absent (preserves
   * backward-compat with any future `COURSES[]` entry that doesn't
   * declare a kind). `"user-published"` is for creator-driven slugs
   * that intentionally appear in this catalog file (see the file
   * JSDoc for rationale).
   */
  kind?: CourseKind;
}

/**
 * All courses on this platform. Order = display order in /courses catalog.
 * First entry is the canonical incoming-traffic landing (used for YouTube
 * default URL when no channel specifies otherwise).
 *
 * Note: this array is INTENTIONALLY mixed — it accepts both bundled and
 * user-published entries. Downstream consumers must filter on
 * `BUNDLED_COURSES` (or call `isBundledCourse(slug)`) when they need the
 * bundled-only view (sync script, drift audit, marketing SSG catalog).
 */
export const COURSES: CourseMeta[] = [];

/** Predicate — returns true iff the slug is a bundled course. */
export function isBundledCourse(slug: string): boolean {
  return COURSES.find((c) => c.slug === slug)?.kind !== "user-published";
}

/** All bundled courses (status-agnostic). Convenience for sync script + audit. */
export const BUNDLED_COURSES: CourseMeta[] = COURSES.filter(
  (c) => c.kind !== "user-published",
);

/** The canonical landing slug for incoming traffic attribution (YouTube defaults, etc). */
export const DEFAULT_LANDING_SLUG: string = COURSES[0]?.slug ?? "default-slug";

/**
 * All ACTIVE bundled courses — convenience export for the marketing
 * SSG catalog and the YouTube seed script.
 *
 * Note: the filter here is INTENTIONALLY on `BUNDLED_COURSES`, not on
 * `COURSES` directly — user-published entries must NOT bleed into
 * the bundled-only marketing catalog (which is generated by
 * `next build` from this static registry). Creator-driven products
 * reach the catalog through the standard Product surface (see
 * `src/lib/data/product-document-data.ts`).
 */
export const ACTIVE_BUNDLED_COURSES: CourseMeta[] = BUNDLED_COURSES.filter(
  (c) => c.status === "active",
);

/**
 * Back-compat alias: legacy callers expect `ACTIVE_COURSES`. Kept as
 * an alias to `ACTIVE_BUNDLED_COURSES` so any reference to the old
 * name (e.g. in `src/app/courses/page.tsx` or the YouTube seed
 * script) transparently filters out user-published entries — which
 * is the desired behavior for the bundled-only surfaces these
 * callers represent.
 *
 * @deprecated Prefer `ACTIVE_BUNDLED_COURSES` for new code.
 */
export const ACTIVE_COURSES: CourseMeta[] = ACTIVE_BUNDLED_COURSES;

/** Lookup helper used by loaders + scripts. Returns null if not registered. */
export function findCourseMeta(slug: string): CourseMeta | null {
  return COURSES.find((c) => c.slug === slug) ?? null;
}
