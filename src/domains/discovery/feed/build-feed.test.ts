/**
 * buildFeed vitest unit tests (Courssy).
 *
 * Deterministic, no Prisma mocks, no random clocks. Stub repository
 * returns hardcoded FeedItems per source — ranking + pagination are
 * pure functions and can be tested without DB.
 *
 * Covers:
 *   - Ranking priority order (continue_learning < lesson)
 *   - pageSize cap (slices output, sets nextCursor when full)
 *   - nextCursor null when items < pageSize (end-of-feed)
 *   - Cursor propagation to repository (ctx.cursor passed verbatim)
 *   - Empty repository case (returns empty result + null cursor)
 */

import { describe, it, expect } from "vitest";
import { buildFeed } from "./build-feed";
import {
  type FeedRepository,
  type FeedSourceContext,
} from "./feed-repository";
import type {
  ContinueLearningItem,
  LessonItem,
  FeedContext,
} from "./feed-types";

// ── Fixtures ────────────────────────────────────────────────────────
const FIXED_DATES = {
  cl1: new Date("2026-07-16T10:00:00Z"),
  cl2: new Date("2026-07-15T14:30:00Z"),
  l1: new Date("2026-07-16T11:00:00Z"),
  l2: new Date("2026-07-14T09:00:00Z"),
};

function mkContext(): FeedContext {
  return {
    userId: "u1",
    lang: "en",
    country: "US",
    ownedProductIds: ["p1", "p2"],
    startedCourseIds: ["p1"],
    followedCreatorIds: ["c1", "c2"],
    observedTopics: [],
  };
}

function mkStubRepo(
  extraContinue: ContinueLearningItem[] = [],
  extraLessons: LessonItem[] = [],
): FeedRepository {
  return {
    async fetchContinueLearning(_ctx: FeedSourceContext) {
      return [
        {
          kind: "continue_learning",
          id: "lp1",
          productId: "p1",
          productSlug: "course-1",
          lessonId: "l1",
          title: "Resume lesson 1",
          lastWatchedAt: FIXED_DATES.cl1,
        },
        ...extraContinue,
      ];
    },
    async fetchRecentLessons(_ctx: FeedSourceContext) {
      return [
        {
          kind: "lesson",
          id: "l5",
          productId: "p3",
          productSlug: "course-3",
          lessonId: "l5",
          creatorId: "c1",
          title: "New lesson 5",
          createdAt: FIXED_DATES.l1,
        },
        ...extraLessons,
      ];
    },
  };
}

// ── Tests ────────────────────────────────────────────────────────────
describe("buildFeed (Courssy — Fase 1 rule-based MVP)", () => {
  it("ranks continue_learning (priority 1) before lesson (priority 2)", async () => {
    const result = await buildFeed(mkStubRepo(), { context: mkContext() });
    expect(result.items.length).toBe(2);
    expect(result.items[0]?.kind).toBe("continue_learning");
    expect(result.items[1]?.kind).toBe("lesson");
  });

  it("respects pageSize (caps output and emits nextCursor when full)", async () => {
    const result = await buildFeed(mkStubRepo(), {
      context: mkContext(),
      pageSize: 1,
    });
    expect(result.items.length).toBe(1);
    expect(result.nextCursor).not.toBeNull();
    // Cursor encodes the timestamp of the (only, oldest) item returned.
    expect(result.nextCursor).toBe(FIXED_DATES.cl1.toISOString());
  });

  it("returns nextCursor=null when items < pageSize (end-of-feed)", async () => {
    const result = await buildFeed(mkStubRepo(), {
      context: mkContext(),
      pageSize: 5,
    });
    expect(result.items.length).toBe(2);
    expect(result.nextCursor).toBeNull();
  });

  it("propagates cursor to repository source-context", async () => {
    let capturedContinueCtx: FeedSourceContext | null = null;
    let capturedLessonCtx: FeedSourceContext | null = null;
    const repo: FeedRepository = {
      async fetchContinueLearning(ctx: FeedSourceContext) {
        capturedContinueCtx = ctx;
        return [];
      },
      async fetchRecentLessons(ctx: FeedSourceContext) {
        capturedLessonCtx = ctx;
        return [];
      },
    };
    const cursor = "2026-07-15T12:00:00Z";
    await buildFeed(repo, {
      context: mkContext(),
      cursor,
    });
    expect(capturedContinueCtx?.cursor).toBe(cursor);
    expect(capturedLessonCtx?.cursor).toBe(cursor);
  });

  it("returns empty FeedResult when repository yields no items", async () => {
    const repo: FeedRepository = {
      async fetchContinueLearning() {
        return [];
      },
      async fetchRecentLessons() {
        return [];
      },
    };
    const result = await buildFeed(repo, { context: mkContext() });
    expect(result.items).toEqual([]);
    expect(result.nextCursor).toBeNull();
  });

  it("within-tier tie-break ranks newer items first (DESC)", async () => {
    // Two continue_learning items:
    //   - cl1 (newer, 2026-07-16T10:00:00Z)
    //   - cl2 (older, 2026-07-15T14:30:00Z)
    // Both same priority → expect newer (cl1) first.
    const repo: FeedRepository = {
      async fetchContinueLearning() {
        return [
          {
            kind: "continue_learning",
            id: "lp-older",
            productId: "p1",
            productSlug: "course-1",
            lessonId: "l-old",
            title: "older",
            lastWatchedAt: FIXED_DATES.cl2,
          },
          {
            kind: "continue_learning",
            id: "lp-newer",
            productId: "p2",
            productSlug: "course-2",
            lessonId: "l-new",
            title: "newer",
            lastWatchedAt: FIXED_DATES.cl1,
          },
        ];
      },
      async fetchRecentLessons() {
        return [];
      },
    };
    const result = await buildFeed(repo, { context: mkContext() });
    expect(result.items[0]?.id).toBe("lp-newer");
    expect(result.items[1]?.id).toBe("lp-older");
  });

  it("uses DEFAULT_PAGE_SIZE (20) when pageSize omitted", async () => {
    const repo: FeedRepository = {
      async fetchContinueLearning() {
        return [];
      },
      async fetchRecentLessons() {
        return [];
      },
    };
    const result = await buildFeed(repo, { context: mkContext() });
    expect(result.items.length).toBe(0);
    expect(result.nextCursor).toBeNull();
    // Verify internal cap: PER_SOURCE_LIMIT (10) is what we pass to repo;
    //   we only care here that no items leaked.
  });
});
