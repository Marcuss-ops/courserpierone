/**
 * courses.config.ts — Platform course registry.
 *
 * SINGLE SOURCE OF TRUTH for which courses this deployment hosts.
 *
 * Where each entry goes after declaration:
 *   • `scripts/products/sync-local-config.ts <slug>` reads `courses/<slug>/config.json` and upserts
 *     BOTH `Product` (marketing/access metadata) AND `CourseConfigCache` (precomputed config JSON).
 *   • `src/app/courses/page.tsx` (registry-driven catalog) enumerates `ACTIVE_COURSES`.
 *   • `scripts/db/seed-youtube-channels.ts` generates locale-specific YouTube channels per course
 *     using `course.slug` as `defaultLandingSlug`.
 *
 * Add a new course:
 *   1. Drop folder at `courses/<new-slug>/{locales,components,config.json}` (mirroring amish-secrets).
 *   2. Add an entry to `COURSES` below.
 *   3. `npx tsx scripts/products/sync-local-config.ts <new-slug>` → upserts DB.
 *   4. Commit + push. Zero core-code changes.
 *
 * Removing this file is NOT possible — it is the import target for ALL course-aware scripts.
 */

export interface CourseMeta {
  /** URL slug — must match `Product.slug` (Postgres @unique). */
  slug: string;
  /** Display title (default locale-agnostic; localized via `locales/<code>.json`). */
  title: string;
  /** One-sentence tagline used in marketing catalog card. */
  tagline: string;
  /** Course rendering template — selects the components/ folder at runtime. */
  templateId: "amish" | "book-claude" | "lumio" | "h612" | "horizon";
  /** Cover image path (served from /public). */
  coverImage: string;
  /** Locales this course ships content for. Used for the /courses filter chips. */
  locales: string[];
  /** Direct-me channel accent color (hex). Falls back to #D4A056. */
  accentColor?: string;
  status: "active" | "draft" | "archived";
}

/**
 * All courses on this platform. Order = display order in /courses catalog.
 * First entry is the canonical incoming-traffic landing (used for YouTube
 * default URL when no channel specifies otherwise).
 */
export const COURSES: CourseMeta[] = [
  {
    slug: "amish-secrets",
    title: "I Segreti degli Amish",
    tagline:
      "Come vivere risparmiando e gestire il denaro, adattato alla vita nel 2026.",
    templateId: "amish",
    coverImage: "/images/amish-secrets-cover.png",
    locales: [
      "it", "en", "es", "fr", "de", "pt", "nl", "pl", "ro", "ru",
      "ja", "zh", "ko", "ar", "hi", "tr", "sv", "no", "fi", "da",
      "cs", "hu", "sk", "uk", "el", "bn", "id", "ms", "tl", "vi",
    ],
    accentColor: "#D4A056",
    status: "active",
  },
];

/** The canonical landing slug for incoming traffic attribution (YouTube defaults, etc). */
export const DEFAULT_LANDING_SLUG: string = COURSES[0].slug;

/** All active courses — convenience export for SSG catalogs. */
export const ACTIVE_COURSES: CourseMeta[] = COURSES.filter(
  (c) => c.status === "active",
);

/** Lookup helper used by loaders + scripts. Returns null if not registered. */
export function findCourseMeta(slug: string): CourseMeta | null {
  return COURSES.find((c) => c.slug === slug) ?? null;
}
