/**
 * FeedRepository — Port interface (Courssy).
 *
 * ADR-0016 §Port: pure contract, NO framework imports (no Prisma, no
 * next, no fs). Consumers of buildFeed import the UseCase + types only;
 * the Prisma adapter (`prisma-feed-repository.ts`) is an implementation
 * detail wired via constructor / dependency injection.
 *
 * YAGNI scope per Fase 1 MVP: only 2 source methods (continue_learning +
 * recent lessons). The other 4 FeedItem kinds are reserved in the type
 * taxonomy for V2 but not emitted yet. Adding a third method is a
 * deliberate design decision (call costs 1 query per fetch).
 *
 * Cursor: ISO 8601 string (encoded from a Date in the Adapter/Port).
 * Opaque to the caller. Decode via `decodeCursor()` below.
 */

import type { ContinueLearningItem, LessonItem } from "./feed-types";

// ─── Source-context (passed to each fetch method) ────────────────────
export interface FeedSourceContext {
  userId: string;
  ownedProductIds: string[];
  followedCreatorIds: string[];
  lang: string;
  country: string | null;
  /** Opaque cursor from previous page; null = first page. */
  cursor: string | null;
  /** Per-source max items (UseCase passes a small fixed value). */
  limit: number;
}

// ─── Cursor encode/decode ────────────────────────────────────────────
// ISO 8601 strings round-trip safely through Prisma's Date codecs and
// are URL-safe opaque tokens for the caller.
export function decodeCursor(cursor: string | null): Date | null {
  if (!cursor) return null;
  const t = Date.parse(cursor);
  if (Number.isNaN(t)) return null;
  return new Date(t);
}

export function encodeCursor(date: Date): string {
  return date.toISOString();
}

// ─── Port interface ──────────────────────────────────────────────────
export interface FeedRepository {
  /**
   * fetchContinueLearning: in-progress lessons for products the user owns.
   * Returns continue_learning FeedItems ordered by lastWatchedAt DESC,
   * filtered strictly older than `ctx.cursor` if provided.
   *
   * SQL shape (Prisma adapter): 1 aggregate query with nested includes
   * (LessonProgress → Lesson → Product + LessonTranslation where locale=ctx.lang).
   */
  fetchContinueLearning(ctx: FeedSourceContext): Promise<ContinueLearningItem[]>;

  /**
   * fetchRecentLessons: lessons created by followedCreatorIds (or, V1
   * proxy, creators of ownedProductIds) ordered by createdAt DESC,
   * filtered strictly older than `ctx.cursor` if provided.
   *
   * SQL shape (Prisma adapter): 1 aggregate query with nested includes
   * (Lesson → Product + LessonTranslation where locale=ctx.lang).
   */
  fetchRecentLessons(ctx: FeedSourceContext): Promise<LessonItem[]>;
}
