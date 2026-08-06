/**
 * Prisma adapter for FeedRepository (Courssy).
 *
 * ADR-0016 §Adapter: this is the ONLY file in the discovery/feed
 * domain that may import @prisma/client. Domain rule + Port + UseCase
 * tiers stay Prisma-free; the Adapter is the implementation seam.
 *
 * BUDGET: 2 aggregate queries (max 4-6 per Fase 1 spec). Each is a
 * single findMany with nested `include` (no client-side joins, no
 * apply() chains). Cursor pagination via ISO timestamp on the
 * timestamp column (lastWatchedAt for continue_learning, createdAt
 * for recent_lessons) — strictly-less-than filter pushes pagination
 * cost to O(log N) per query.
 *
 * NO full catalog in memory: ctx.ownedProductIds and
 * ctx.followedCreatorIds are pre-filtered upstream (route handler).
 * In the rare case they are empty, we early-return `[]` BEFORE
 * opening a Prisma call — saves a wasted query.
 *
 * Locale handling: title pull uses LessonTranslation WHERE locale=ctx.lang.
 * Take 1; fallback to "(untitled)" if no translation for that locale.
 * This is the lingua-normalization pattern canonicalized in
 * src/lib/i18n/locale-resolver.ts (localeToLanguage helper).
 */

import { prisma } from "@/lib/db/prisma";
import {
  type FeedRepository,
  type FeedSourceContext,
  decodeCursor,
} from "./feed-repository";
import type {
  ContinueLearningItem,
  FeedContext,
  LessonItem,
} from "./feed-types";

// V1 context derivation: 3 bounded aggregate queries.
//   - active AccessGrant → ownedProductIds
//   - LessonProgress → startedCourseIds
//   - Product creators of owned products → followedCreatorIds proxy
const CONTEXT_LIMIT = 1000;

class PrismaFeedRepository implements FeedRepository {
  async buildContext(
    userId: string,
    lang: string,
    country: string | null,
  ): Promise<FeedContext> {
    const [grants, progressRows, products] = await prisma.$transaction([
      prisma.accessGrant.findMany({
        where: { userId, status: "active" },
        take: CONTEXT_LIMIT,
        select: { productId: true },
      }),
      prisma.lessonProgress.findMany({
        where: { userId },
        take: CONTEXT_LIMIT,
        select: { lesson: { select: { productId: true } } },
      }),
      prisma.product.findMany({
        where: {
          deletedAt: null,
          accessGrants: { some: { userId, status: "active" } },
        },
        take: CONTEXT_LIMIT,
        select: { creatorId: true },
      }),
    ]);

    const ownedProductIds = Array.from(new Set(grants.map((g) => g.productId)));
    const startedCourseIds = Array.from(
      new Set(progressRows.map((p) => p.lesson.productId).filter(Boolean)),
    );
    const followedCreatorIds = Array.from(
      new Set(products.map((p) => p.creatorId).filter((id): id is string => Boolean(id))),
    );

    return {
      userId,
      lang,
      country,
      ownedProductIds,
      startedCourseIds,
      followedCreatorIds,
      observedTopics: [],
    };
  }

  /**
   * fetchContinueLearning: 1 aggregate query.
   * Filters: userId (LessonProgress) + completed=false + lesson.productId IN ownedProductIds.
   * Optional cursor: lastWatchedAt < cursorDate (strict less-than).
   * Note: lastWatchedAt can be nullable; rows with null are dropped via { not: null }.
   *   Actually we keep nulls and fall back to updatedAt in mapping (defensive).
   */
  async fetchContinueLearning(
    ctx: FeedSourceContext,
  ): Promise<ContinueLearningItem[]> {
    if (ctx.ownedProductIds.length === 0) return [];
    const cursorDate = decodeCursor(ctx.cursor);

    const rows = await prisma.lessonProgress.findMany({
      where: {
        userId: ctx.userId,
        completed: false,
        // Drop rows never watched (defensive — lastWatchedAt null would
        // otherwise appear at the top of lastWatchedAt DESC order).
        lastWatchedAt: cursorDate ? { lt: cursorDate } : { not: null },
        lesson: {
          productId: { in: ctx.ownedProductIds },
          product: { deletedAt: null },
        },
      },
      orderBy: { lastWatchedAt: "desc" },
      take: ctx.limit,
      include: {
        lesson: {
          include: {
            product: { select: { id: true, slug: true } },
            translations: {
              where: { locale: ctx.lang },
              take: 1,
              select: { title: true },
            },
          },
        },
      },
    });

    return rows.map((r) => ({
      kind: "continue_learning" as const,
      id: r.id,
      productId: r.lesson.productId,
      productSlug: r.lesson.product.slug,
      lessonId: r.lessonId,
      title: r.lesson.translations[0]?.title ?? "(untitled)",
      // Defensive fallback for legacy rows where lastWatchedAt is null
      // (we filtered for not:null above, so this is unreachable in
      // practice — kept for type-safety).
      lastWatchedAt: r.lastWatchedAt ?? r.updatedAt,
    }));
  }

  /**
   * fetchRecentLessons: 1 aggregate query.
   * Filters: lesson.product.creatorId IN followedCreatorIds.
   * Cursor: createdAt < cursorDate (strict less-than).
   */
  async fetchRecentLessons(ctx: FeedSourceContext): Promise<LessonItem[]> {
    if (ctx.followedCreatorIds.length === 0) return [];
    const cursorDate = decodeCursor(ctx.cursor);

    const rows = await prisma.lesson.findMany({
      where: {
        product: {
          creatorId: { in: ctx.followedCreatorIds },
          deletedAt: null,
        },
        ...(cursorDate ? { createdAt: { lt: cursorDate } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: ctx.limit,
      include: {
        product: { select: { id: true, slug: true, creatorId: true } },
        translations: {
          where: { locale: ctx.lang },
          take: 1,
          select: { title: true },
        },
      },
    });

    return rows.map((l) => ({
      kind: "lesson" as const,
      id: l.id,
      productId: l.product.id,
      productSlug: l.product.slug,
      lessonId: l.id,
      creatorId: l.product.creatorId,
      title: l.translations[0]?.title ?? "(untitled)",
      createdAt: l.createdAt,
    }));
  }
}

/**
 * Adapter factory — convenience to wire the Adapter without exposing
 * the class constructor in route handlers.
 */
export function prismaFeedRepository(): FeedRepository {
  return new PrismaFeedRepository();
}
