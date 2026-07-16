/**
 * src/lib/learning/prisma-continue-watching-repository.ts
 *
 * Phase 2 Step 2 — Continue Watching Prisma adapter.
 *
 * Adapter Layer (per ADR-0016 §1 dep direction). Imports the port
 * contract from `./continue-watching-types`; exports a concrete
 * implementation of `ContinueWatchingRepository`. Use case
 * (`./continue-watching`) NEVER imports this file directly — it
 * receives the adapter via dependency injection.
 *
 * Query shape:
 *   lessonProgress.findMany({
 *     where: { userId, completed: false, lastWatchedAt: { not: null } },
 *     orderBy: { lastWatchedAt: "desc" },
 *     take: limit * 2,
 *     include: {
 *       lesson: {
 *         include: {
 *           translations: { title, videoUrl }, (locale optional, take 1)
 *           product: {
 *             id, slug, coverUrl,
 *             translations: { content, section: "titolo" }, (take 1)
 *           },
 *         },
 *       },
 *     },
 *   })
 *
 * Indexes used:
 *   - LessonProgress @@index([userId, completed]) — filters + userId seek
 *
 * Translation resolution (locale handling):
 *   - When caller provides a locale, the adapter adds it as a WHERE
 *     filter on both LessonTranslation and ProductTranslation.
 *   - When absent, the adapter takes the FIRST translation in
 *     `locale ASC` order (alphabetical) — deterministic fallback so
 *     the title is stable across requests without an explicit locale.
 *
 * Defensive:
 *   - `if (!p.lastWatchedAt) return null` — belt-and-braces against
 *     schema drift; the WHERE clause already excludes null but TS
 *     cannot detect that.
 */

import { prisma } from "@/lib/db/prisma";

import type {
  ContinueWatchingFetchInput,
  ContinueWatchingRepository,
  RawContinueWatchingProgress,
} from "./continue-watching-types";

/**
 * Canonical Prisma adapter — the only implementation. Exported as a
 * module-level constant (singletons in the prisma client are already
 * managed via globalForPrisma so no overhead here).
 */
export const prismaContinueWatchingRepository: ContinueWatchingRepository = {
  async fetchRecentProgress({
    userId,
    locale,
    take,
    cursorDate,
  }: ContinueWatchingFetchInput): Promise<RawContinueWatchingProgress[]> {
    // Locale-aware nested translation config. When locale is provided,
    // it's a WHERE filter (1 row max). When not, we pick the FIRST
    // translation alphabetically — deterministic across renders.
    const localization = (whereExtra: object) =>
      locale
        ? { where: { locale, ...whereExtra }, take: 1 }
        : { orderBy: { locale: "asc" as const }, take: 1 };

    // Cursor pagination: when a cursorDate is provided, restrict the
    // SQL to rows strictly older than that date. First page uses
    // `{ not: null }` so legacy rows with null lastWatchedAt are
    // still dropped. Subsequent pages use `{ lt: cursorDate }`.
    //
    // NOTE: strict-less-than (`lt`, NOT `lte`) is what makes cursor
    // pagination safe — items with the exact timestamp of the
    // anchor would otherwise be re-fetched indefinitely. The current
    // timestamp anchor comes from the last VISIBLE (deduplicated)
    // item, not the last raw row, so the dedupe map + lt filter
    // together cover the "strictly older than visible page tail"
    // invariant.
    const lastWatchedAtFilter = cursorDate
      ? { lt: cursorDate }
      : { not: null };

    const progresses = await prisma.lessonProgress.findMany({
      where: {
        userId,
        completed: false,
        lastWatchedAt: lastWatchedAtFilter,
      },
      orderBy: { lastWatchedAt: "desc" },
      take,
      include: {
        lesson: {
          include: {
            translations: localization({}),
            product: {
              select: {
                id: true,
                slug: true,
                coverUrl: true,
                translations: localization({ section: "titolo" }),
              },
            },
          },
        },
      },
    });

    const result: RawContinueWatchingProgress[] = [];
    for (const p of progresses) {
      if (!p.lastWatchedAt) continue; // belt-and-braces (schema = NOT NULL)
      const lessonTrans = p.lesson.translations[0];
      const productTrans = p.lesson.product.translations[0];
      result.push({
        id: p.id,
        lastWatchedAt: p.lastWatchedAt,
        lesson: {
          id: p.lesson.id,
          position: p.lesson.position,
          title: lessonTrans?.title ?? `Lesson ${p.lesson.position}`,
          videoUrl: lessonTrans?.videoUrl ?? null,
          product: {
            id: p.lesson.product.id,
            slug: p.lesson.product.slug,
            coverUrl: p.lesson.product.coverUrl ?? null,
            title: productTrans?.content ?? p.lesson.product.slug,
          },
        },
      });
    }
    return result;
  },
};
