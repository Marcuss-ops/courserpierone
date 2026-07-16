/**
 * Discovery feed domain types (Courssy — Fase 1 MVP).
 *
 * ADR-0016 §Domain rule: pure logic, no I/O, no framework imports.
 * Only types, discriminated unions, branded types. No prisma / next /
 * fs / redis imports below — keep the type stratum cleanly separated
 * from the Adapter (prisma-feed-repository.ts).
 *
 * Naming canonical "Courssy" per ADR-0015 — no "Courser"/"Coursy"
 * string in any branch consumer, file name, or comment.
 *
 * 6-tipi FeedItem union:
 *   - continue_learning   (priority 1: corso iniziato)
 *   - lesson             (priority 2: nuova lezione del creator seguito)
 *   - community_post     (priority 3: post del creator seguito)
 *   - free_course        (priority 4: corso gratuito pertinente)
 *   - (topic_match: V2 marker — NOT emitted in MVP, no items created)
 *   - premium_course     (priority 6: prodotto premium suggerito)
 *   - creator_update     (priority 3: same tier as community_post in MVP)
 *
 * `creator_update` and `community_post` semantically overlap in V1 — the
 * UseCase emits only `community_post` in MVP; `creator_update` is kept in
 * the type taxonomy for V2 differentiation. Strategy doc §1 lists 6
 * tiers; we honor the type count without forcing an unused emit.
 */

// ─── FeedContext ──────────────────────────────────────────────────────
// Snapshots derivati una volta dall'upstream (route handler);
// non derivare dentro buildFeed (would create hidden DB calls in
// the UseCase — vietato da ADR-0016).
export interface FeedContext {
  userId: string;
  /** Canonical language code lowercase ("en" / "it" / "fr" / ...). */
  lang: string;
  /** ISO 3166-1 alpha-2 country code (e.g. "IT"). null if locale has no country. */
  country: string | null;
  /** Owned product IDs (AccessGrant.status='active' for this user). */
  ownedProductIds: string[];
  /** Started courses (LessonProgress.exists on any lesson of that product). */
  startedCourseIds: string[];
  /**
   * Followed creator IDs. V1 PLANNED PLACEHOLDER:
   * schema has no Follow table yet — derived upstream from creators of
   * ownedProductIds (proxy: "creators you've purchased from"). schema-add
   * Follow is V2 per ADR-0016 Future §5.
   */
  followedCreatorIds: string[];
  /** Observed topic tags. V1 YAGNI: always [] in MVP, derived V2 from completed lessons. */
  observedTopics: string[];
}

// ─── FeedItem: 6-tip discriminated union ─────────────────────────────
export type FeedItem =
  | ContinueLearningItem
  | LessonItem
  | CommunityPostItem
  | FreeCourseItem
  | PremiumCourseItem
  | CreatorUpdateItem;

export interface ContinueLearningItem {
  kind: "continue_learning";
  /** Canonical id (LessonProgress.id) — stable for cursor pagination. */
  id: string;
  productId: string;
  productSlug: string;
  lessonId: string;
  /** Lesson title in `ctx.lang` (best-effort; falls back to default if no translation). */
  title: string;
  lastWatchedAt: Date;
}

export interface LessonItem {
  kind: "lesson";
  id: string;
  productId: string;
  productSlug: string;
  lessonId: string;
  creatorId: string;
  title: string;
  createdAt: Date;
}

export interface CommunityPostItem {
  kind: "community_post";
  id: string;
  productId: string;
  postId: string;
  pinned: boolean;
  title: string;
  createdAt: Date;
}

export interface FreeCourseItem {
  kind: "free_course";
  id: string;
  productId: string;
  slug: string;
  title: string;
  createdAt: Date;
}

export interface PremiumCourseItem {
  kind: "premium_course";
  id: string;
  productId: string;
  slug: string;
  title: string;
  createdAt: Date;
}

export interface CreatorUpdateItem {
  kind: "creator_update";
  id: string;
  creatorId: string;
  postId: string;
  title: string;
  createdAt: Date;
}

// ─── FeedResult: top-level result of buildFeed ──────────────────────
export interface FeedResult {
  /** Ranked and capped items, in deterministic order (rank policy). */
  items: FeedItem[];
  /** Opaque string cursor for next page; null = end of feed. */
  nextCursor: string | null;
}

// ─── BuildFeedInput: UseCase input ───────────────────────────────────
export interface BuildFeedInput {
  context: FeedContext;
  /** Page size override; defaults to DEFAULT_PAGE_SIZE in build-feed.ts. */
  pageSize?: number;
  /** Opaque cursor (from previous page's nextCursor). null = first page. */
  cursor?: string | null;
}
