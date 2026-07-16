/**
 * src/domains/discovery/policies/policies.test.ts
 *
 * Course-grained test suite for the Recommendation Policy Registry
 * (Courssy — Fase 1 elaboration).
 *
 * Coverage map:
 *   1. rankByCourseProgress        boost: lesson/continue_learning in
 *                                  startedCourseIds → score +100
 *   2. rankByLanguageCompat        boost: 'lang' in item && matches ctx.lang
 *                                  → score +50 (no-op MVP without lang field)
 *   3. rankBySameCreator           boost: LessonItem/CreatorUpdateItem with
 *                                  creatorId in ctx.followedCreatorIds → +30
 *   4. rankBySameTopic             boost: 'topics' in item && intersects
 *                                  ctx.observedTopics → +20 (no-op MVP)
 *   5. excludeAlreadyPurchased     filter: drops free/premium/lesson items
 *                                  with productId in ctx.ownedProductIds
 *   6. freeBeforeUpsell            sort: free_course precedes premium_course
 *                                  tie-break (currently a no-op given tier
 *                                  priority, but defended as registry layer)
 *   7. RANKING_POLICIES            registry integrity: exactly 6 entries,
 *                                  all expected {kind,name} combos
 *   8. applyPolicies               end-to-end: filter→boost→sort composition
 *                                  drops owned, boosts progress, sorts by
 *                                  cumulative boostScore DESC
 *
 * Determinism: every test uses fixed Date literals. No `new Date()` in
 * tests (would defeat determinism contract).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Fixtures + types
import type { FeedItem, FeedContext } from "../feed/feed-types";

// Policies + registry entry points
import { rankByCourseProgress } from "./rank-by-course-progress";
import { rankByLanguageCompat } from "./rank-by-language-compat";
import { rankBySameCreator } from "./rank-by-same-creator";
import { rankBySameTopic } from "./rank-by-same-topic";
import { excludeAlreadyPurchased } from "./exclude-already-purchased";
import { freeBeforeUpsell } from "./free-before-upsell";
import { RANKING_POLICIES, applyPolicies } from "./policy-registry";

// ─── Minimal test fixtures ────────────────────────────────────────

const BASE_CTX: FeedContext = {
  userId: "user_test",
  lang: "it",
  country: "IT",
  ownedProductIds: ["prod_owned_a", "prod_owned_b"],
  startedCourseIds: ["prod_owned_a"],
  followedCreatorIds: ["creator_x"],
  observedTopics: ["marketing", "growth"],
};

function mkCtx(overrides: Partial<FeedContext> = {}): FeedContext {
  return { ...BASE_CTX, ...overrides };
}

const T_NOW = new Date("2026-07-16T12:00:00Z");

function mkLesson(overrides: Partial<Extract<FeedItem, { kind: "lesson" }>> = {}): FeedItem {
  return {
    kind: "lesson",
    id: "lesson_1",
    productId: "prod_owned_a",
    productSlug: "test-course-e2e",
    lessonId: "l1",
    creatorId: "creator_x",
    title: "Lesson 1",
    createdAt: T_NOW,
    ...overrides,
  };
}

function mkContinue(overrides: Partial<Extract<FeedItem, { kind: "continue_learning" }>> = {}): FeedItem {
  return {
    kind: "continue_learning",
    id: "progress_1",
    productId: "prod_owned_a",
    productSlug: "test-course-e2e",
    lessonId: "l1",
    title: "Continue Lesson 1",
    lastWatchedAt: T_NOW,
    ...overrides,
  };
}

function mkFreeCourse(overrides: Partial<Extract<FeedItem, { kind: "free_course" }>> = {}): FeedItem {
  return {
    kind: "free_course",
    id: "free_1",
    productId: "prod_free_x",
    slug: "free-course",
    title: "Free Course",
    createdAt: T_NOW,
    ...overrides,
  };
}

function mkPremium(overrides: Partial<Extract<FeedItem, { kind: "premium_course" }>> = {}): FeedItem {
  return {
    kind: "premium_course",
    id: "prem_1",
    productId: "prod_premium_x",
    slug: "premium-course",
    title: "Premium Course",
    createdAt: T_NOW,
    ...overrides,
  };
}

function mkCreatorUpdate(overrides: Partial<Extract<FeedItem, { kind: "creator_update" }>> = {}): FeedItem {
  return {
    kind: "creator_update",
    id: "cu_1",
    creatorId: "creator_x",
    postId: "post_1",
    title: "Creator Update",
    createdAt: T_NOW,
    ...overrides,
  };
}

// ─── 1. rankByCourseProgress ──────────────────────────────────────
describe("rankByCourseProgress", () => {
  beforeEach(() => vi.clearAllMocks());

  it("boosts lesson items whose productId is in startedCourseIds (+100)", () => {
    const ctx = mkCtx({ startedCourseIds: ["prod_owned_a"] });
    const item = mkLesson({ productId: "prod_owned_a" });
    expect(rankByCourseProgress.score(item, ctx)).toBe(100);
  });

  it("boosts continue_learning items whose productId is in startedCourseIds (+100)", () => {
    const ctx = mkCtx({ startedCourseIds: ["prod_owned_a"] });
    const item = mkContinue({ productId: "prod_owned_a" });
    expect(rankByCourseProgress.score(item, ctx)).toBe(100);
  });

  it("returns 0 when productId not in startedCourseIds", () => {
    const ctx = mkCtx({ startedCourseIds: ["some_other"] });
    const item = mkLesson({ productId: "prod_owned_a" });
    expect(rankByCourseProgress.score(item, ctx)).toBe(0);
  });

  it("returns 0 for free_course / premium_course / community_post / creator_update", () => {
    const ctx = mkCtx();
    expect(rankByCourseProgress.score(mkFreeCourse(), ctx)).toBe(0);
    expect(rankByCourseProgress.score(mkPremium(), ctx)).toBe(0);
    expect(rankByCourseProgress.score(mkCreatorUpdate(), ctx)).toBe(0);
  });
});

// ─── 2. rankByLanguageCompat ──────────────────────────────────────
describe("rankByLanguageCompat", () => {
  beforeEach(() => vi.clearAllMocks());

  it("boosts items with 'lang' field matching ctx.lang (+50)", () => {
    // Fake the dynamic `lang` field on the item (current MVP variants
    // do not declare it — simulates the V2 activation path).
    const item = { ...mkLesson(), lang: "it" };
    expect(rankByLanguageCompat.score(item as FeedItem, mkCtx({ lang: "it" }))).toBe(50);
  });

  it("returns 0 when 'lang' field mismatches ctx.lang", () => {
    const item = { ...mkLesson(), lang: "en" };
    expect(rankByLanguageCompat.score(item as FeedItem, mkCtx({ lang: "it" }))).toBe(0);
  });

  it("returns 0 when item has no 'lang' field (MVP no-op)", () => {
    expect(rankByLanguageCompat.score(mkLesson(), mkCtx())).toBe(0);
  });
});

// ─── 3. rankBySameCreator ─────────────────────────────────────────
describe("rankBySameCreator", () => {
  beforeEach(() => vi.clearAllMocks());

  it("boosts LessonItem whose creatorId is in followedCreatorIds (+30)", () => {
    const ctx = mkCtx({ followedCreatorIds: ["creator_x"] });
    expect(rankBySameCreator.score(mkLesson({ creatorId: "creator_x" }), ctx)).toBe(30);
  });

  it("boosts CreatorUpdateItem whose creatorId is followed (+30)", () => {
    const ctx = mkCtx({ followedCreatorIds: ["creator_x"] });
    expect(rankBySameCreator.score(mkCreatorUpdate({ creatorId: "creator_x" }), ctx)).toBe(30);
  });

  it("returns 0 when creatorId is not in followed list", () => {
    const ctx = mkCtx({ followedCreatorIds: [] });
    expect(rankBySameCreator.score(mkLesson({ creatorId: "creator_x" }), ctx)).toBe(0);
  });

  it("returns 0 for variants without explicit creatorId", () => {
    const ctx = mkCtx();
    expect(rankBySameCreator.score(mkContinue(), ctx)).toBe(0);   // no creatorId
    expect(rankBySameCreator.score(mkFreeCourse(), ctx)).toBe(0);  // no creatorId
    expect(rankBySameCreator.score(mkPremium(), ctx)).toBe(0);     // no creatorId
  });
});

// ─── 4. rankBySameTopic ───────────────────────────────────────────
describe("rankBySameTopic", () => {
  beforeEach(() => vi.clearAllMocks());

  it("boosts items with topics intersecting observedTopics (+20)", () => {
    const item = { ...mkLesson(), topics: ["marketing"] };
    expect(rankBySameTopic.score(item as FeedItem, mkCtx())).toBe(20);
  });

  it("applies cardinality-weighted boost (2 matches → 25)", () => {
    const item = { ...mkLesson(), topics: ["marketing", "growth"] };
    expect(rankBySameTopic.score(item as FeedItem, mkCtx())).toBe(25);
  });

  it("caps the cardinality bonus at +30 when 3 intersections (20 base + 2×5 cap)", () => {
    // Force a 3-way intersection so the cardinality bonus caps at its
    // +10 ceiling (vs. the BASE_CTX 2-way default which only yields +25).
    const ctx = mkCtx({ observedTopics: ["marketing", "growth", "extra"] });
    const item = { ...mkLesson(), topics: ["marketing", "growth", "extra"] };
    // matches=3 → 20 + min(3-1, 2)*5 = 20 + 10 = 30 (matches cap).
    expect(rankBySameTopic.score(item as FeedItem, ctx)).toBe(30);
  });

  it("returns +25 for 2 intersections (no cardinality bonus yet)", () => {
    // With BASE_CTX observedTopics=["marketing","growth"], an item
    // carrying both plus a non-overlapping "extra" tag still has only
    // 2 intersections → score lands at +25 (20 base + 1×5 bonus).
    const item = { ...mkLesson(), topics: ["marketing", "growth", "extra"] };
    expect(rankBySameTopic.score(item as FeedItem, mkCtx())).toBe(25);
  });

  it("returns 0 when topics field is empty array", () => {
    const item = { ...mkLesson(), topics: [] } as FeedItem & { topics: string[] };
    expect(rankBySameTopic.score(item as FeedItem, mkCtx())).toBe(0);
  });

  it("returns 0 when item has no 'topics' field (MVP no-op)", () => {
    expect(rankBySameTopic.score(mkLesson(), mkCtx())).toBe(0);
  });
});

// ─── 5. excludeAlreadyPurchased ───────────────────────────────────
describe("excludeAlreadyPurchased", () => {
  beforeEach(() => vi.clearAllMocks());

  it("drops free_course whose productId is in ownedProductIds", () => {
    const ctx = mkCtx({ ownedProductIds: ["prod_free_x"] });
    expect(excludeAlreadyPurchased.predicate(mkFreeCourse({ productId: "prod_free_x" }), ctx)).toBe(false);
  });

  it("drops premium_course whose productId is owned", () => {
    const ctx = mkCtx({ ownedProductIds: ["prod_premium_x"] });
    expect(excludeAlreadyPurchased.predicate(mkPremium({ productId: "prod_premium_x" }), ctx)).toBe(false);
  });

  it("drops lesson whose productId is owned", () => {
    const ctx = mkCtx({ ownedProductIds: ["prod_owned_a"] });
    expect(excludeAlreadyPurchased.predicate(mkLesson({ productId: "prod_owned_a" }), ctx)).toBe(false);
  });

  it("keeps free_course / premium_course / lesson NOT owned", () => {
    const ctx = mkCtx({ ownedProductIds: ["other_product"] });
    expect(excludeAlreadyPurchased.predicate(mkFreeCourse({ productId: "prod_free_x" }), ctx)).toBe(true);
    expect(excludeAlreadyPurchased.predicate(mkPremium({ productId: "prod_premium_x" }), ctx)).toBe(true);
    expect(excludeAlreadyPurchased.predicate(mkLesson({ productId: "prod_owned_a" }), ctx)).toBe(true);
  });

  it("always keeps continue_learning / community_post / creator_update", () => {
    const ctx = mkCtx();
    expect(excludeAlreadyPurchased.predicate(mkContinue(), ctx)).toBe(true);
    // community_post variant (not constructed in helpers above, but
    // the type-narrowed switch handles it — sanity check via cast)
    const communityPost: FeedItem = {
      kind: "community_post",
      id: "cp_1",
      productId: "prod_owned_a",
      postId: "post_1",
      pinned: false,
      title: "Post",
      createdAt: T_NOW,
    };
    expect(excludeAlreadyPurchased.predicate(communityPost, ctx)).toBe(true);
    expect(excludeAlreadyPurchased.predicate(mkCreatorUpdate(), ctx)).toBe(true);
  });
});

// ─── 6. freeBeforeUpsell ──────────────────────────────────────────
describe("freeBeforeUpsell", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns -1 when a=free_course and b=premium_course", () => {
    expect(freeBeforeUpsell.compare(mkFreeCourse(), mkPremium(), mkCtx())).toBe(-1);
  });

  it("returns +1 when a=premium_course and b=free_course", () => {
    expect(freeBeforeUpsell.compare(mkPremium(), mkFreeCourse(), mkCtx())).toBe(1);
  });

  it("returns 0 for non-free/premium pairs", () => {
    expect(freeBeforeUpsell.compare(mkLesson(), mkCreatorUpdate(), mkCtx())).toBe(0);
    expect(freeBeforeUpsell.compare(mkFreeCourse(), mkLesson(), mkCtx())).toBe(0);
    expect(freeBeforeUpsell.compare(mkPremium(), mkPremium(), mkCtx())).toBe(0);
  });
});

// ─── 7. RANKING_POLICIES registry integrity ───────────────────────
describe("RANKING_POLICIES", () => {
  it("contains exactly 6 entries (the 6 spec'd policies)", () => {
    expect(RANKING_POLICIES.size).toBe(6);
  });

  it("all entries match {kind, name} contracts", () => {
    const expected: { kind: string; name: string }[] = [
      { kind: "boost", name: "rank-by-course-progress" },
      { kind: "boost", name: "rank-by-language-compat" },
      { kind: "boost", name: "rank-by-same-creator" },
      { kind: "boost", name: "rank-by-same-topic" },
      { kind: "filter", name: "exclude-already-purchased" },
      { kind: "sort", name: "free-before-upsell" },
    ];
    const actual = Array.from(RANKING_POLICIES.entries()).map(([name, p]) => ({
      kind: p.kind,
      name,
    }));
    expect(actual).toEqual(expect.arrayContaining(expected));
  });

  it("has 4 boost + 1 filter + 1 sort entry kinds", () => {
    const kinds = Array.from(RANKING_POLICIES.values()).map((p) => p.kind);
    expect(kinds.filter((k) => k === "boost")).toHaveLength(4);
    expect(kinds.filter((k) => k === "filter")).toHaveLength(1);
    expect(kinds.filter((k) => k === "sort")).toHaveLength(1);
  });
});

// ─── 8. applyPolicies end-to-end ──────────────────────────────────
describe("applyPolicies", () => {
  beforeEach(() => vi.clearAllMocks());

  it("drops owned free_course and owned lesson (filter chain)", () => {
    const ctx = mkCtx({ ownedProductIds: ["prod_owned_a", "prod_free_x"] });
    const items: FeedItem[] = [
      mkLesson({ id: "l_owned", productId: "prod_owned_a" }),
      mkFreeCourse({ id: "fc_owned", productId: "prod_free_x" }),
      mkFreeCourse({ id: "fc_new", productId: "prod_free_y" }),
      mkPremium({ id: "pc_new", productId: "prod_premium_z" }),
    ];
    const result = applyPolicies(items, ctx);
    expect(result.find((i) => i.id === "l_owned")).toBeUndefined();
    expect(result.find((i) => i.id === "fc_owned")).toBeUndefined();
    expect(result.find((i) => i.id === "fc_new")).toBeDefined();
    expect(result.find((i) => i.id === "pc_new")).toBeDefined();
  });

  it("boosts lesson with started productId (boost accumulator ranks it first)", () => {
    const ctx = mkCtx({ ownedProductIds: [], startedCourseIds: ["prod_owned_a"] });
    const items: FeedItem[] = [
      mkLesson({ id: "l_started", productId: "prod_owned_a", creatorId: "creator_y" }),
      mkLesson({ id: "l_not_started", productId: "prod_other", creatorId: "creator_y" }),
    ];
    const result = applyPolicies(items, ctx);
    // l_started should rank first (boostScore=100 vs l_not_started=0)
    expect(result[0]?.id).toBe("l_started");
    expect(result[1]?.id).toBe("l_not_started");
  });

  it("returns empty array when filter chain drops all items", () => {
    const ctx = mkCtx({ ownedProductIds: ["all_them"] });
    const items: FeedItem[] = [
      mkLesson({ productId: "all_them" }),
      mkFreeCourse({ productId: "all_them" }),
      mkPremium({ productId: "all_them" }),
    ];
    expect(applyPolicies(items, ctx)).toEqual([]);
  });

  it("respects custom registry (empty registry → no filter, no boost)", () => {
    const ctx = mkCtx();
    const items: FeedItem[] = [mkLesson({ id: "l1" }), mkPremium({ id: "p1" })];
    const customRegistry = new Map();
    // All items survive (no filter); sort falls through to stable identity.
    const result = applyPolicies(items, ctx, customRegistry);
    expect(result.map((i) => i.id)).toEqual(["l1", "p1"]);
  });

  it("is deterministic — same input + ctx + registry yields identical output", () => {
    const ctx = mkCtx();
    const items: FeedItem[] = [
      mkLesson({ id: "l1" }),
      mkPremium({ id: "p1" }),
      mkFreeCourse({ id: "f1" }),
    ];
    const run1 = applyPolicies(items, ctx);
    const run2 = applyPolicies(items, ctx);
    expect(run1.map((i) => i.id)).toEqual(run2.map((i) => i.id));
  });
});
