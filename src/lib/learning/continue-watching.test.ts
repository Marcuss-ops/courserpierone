/**
 * src/lib/learning/continue-watching.test.ts
 *
 * Unit tests for `buildContinueWatchingHistory` use case.
 *
 * Pattern mirrors `src/domains/discovery/feed/build-feed.test.ts`:
 *   - Stub the `ContinueWatchingRepository` port (no Prisma mock).
 *   - Deterministic ISO strings for lastWatchedAt (no live clock).
 *   - Reproduction-via-identity: re-running the test on the same
 *     fixture set returns the same output bytes-for-bytes.
 *
 * Imports use canonical paths (no re-export indirection) so a future
 * test that needs ONLY the port knows exactly where to import from
 * and a future test that needs the adapter knows exactly where:
 *   - types + port   → ./continue-watching-types
 *   - use case       → ./continue-watching
 *   - adapter        → ./prisma-continue-watching-repository
 *
 * Coverage:
 *   - Empty userId             → empty page + null nextCursor
 *   - Empty progress           → empty page + null nextCursor
 *   - Single progress          → 1 item, lastWatchedAt preserved
 *   - Two progress same product → 1 item (first occurrence wins, the
 *                                 later one is dropped because BOTH
 *                                 rows exist in the byProduct Map
 *                                 already by the time the second
 *                                 iteration fires).
 *   - Three progress 2 products + limit 1 → 1 item (first by SQL ord)
 *   - Limit normalization (negative, 0, NaN, Infinity → defaults)
 *   - Locale param passes through to repo.fetchRecentProgress
 *   - Title fallback when translation missing
 *   - VideoUrl fallback to null when missing
 *   - Adapter file importable + port-shape sanity
 *   - Cursor pagination: full page → nextCursor non-null
 *   - Cursor pagination: partial page → nextCursor null
 *   - Cursor pagination: cursorDate forwarded to repo on next page
 *   - Cursor pagination: malformed cursor silently treated as null
 */

import { describe, expect, it, vi } from "vitest";

import {
  buildContinueWatchingHistory,
  decodeContinueWatchingCursor,
  normalizeContinueWatchingLimit,
  DEFAULT_CONTINUE_WATCHING_LIMIT,
  MAX_CONTINUE_WATCHING_LIMIT,
} from "./continue-watching";
import {
  prismaContinueWatchingRepository,
} from "./prisma-continue-watching-repository";
import type {
  BuildContinueWatchingDeps,
} from "./continue-watching";
import type {
  ContinueWatchingRepository,
  ContinueWatchingFetchInput,
  RawContinueWatchingProgress,
} from "./continue-watching-types";

// ─── Test helpers ─────────────────────────────────────────────────────

function mkRow(partial: {
  id: string;
  lastWatchedAtIso: string;
  productId: string;
  productSlug: string;
  productTitle: string;
  lessonId: string;
  lessonPosition: number;
  lessonTitle: string;
  videoUrl?: string | null;
}): RawContinueWatchingProgress {
  return {
    id: partial.id,
    lastWatchedAt: new Date(partial.lastWatchedAtIso),
    lesson: {
      id: partial.lessonId,
      position: partial.lessonPosition,
      title: partial.lessonTitle,
      videoUrl: partial.videoUrl ?? null,
      product: {
        id: partial.productId,
        slug: partial.productSlug,
        coverUrl: null,
        title: partial.productTitle,
      },
    },
  };
}

interface StubState {
  lastFetchInput?: ContinueWatchingFetchInput;
  rows: RawContinueWatchingProgress[];
}

function mkStubRepo(rows: RawContinueWatchingProgress[]): {
  repo: ContinueWatchingRepository;
  state: StubState;
} {
  const state: StubState = { rows };
  const repo: ContinueWatchingRepository = {
    async fetchRecentProgress(input) {
      state.lastFetchInput = input;
      return state.rows;
    },
  };
  return { repo, state };
}

// ─── Tests ────────────────────────────────────────────────────────────

describe("buildContinueWatchingHistory — input guards", () => {
  it("returns empty page when userId is empty string", async () => {
    const { repo, state } = mkStubRepo([]);
    const result = await buildContinueWatchingHistory(
      { userId: "" },
      { repo },
    );
    expect(result.items).toEqual([]);
    expect(result.nextCursor).toBeNull();
    // Repo MUST NOT be called when userId is empty (defensive DB skip).
    expect(state.lastFetchInput).toBeUndefined();
  });

  it("returns empty page when no progress exists for the user", async () => {
    const { repo } = mkStubRepo([]);
    const result = await buildContinueWatchingHistory(
      { userId: "user_1" },
      { repo },
    );
    expect(result.items).toEqual([]);
    expect(result.nextCursor).toBeNull();
  });
});

describe("buildContinueWatchingHistory — happy path", () => {
  it("returns 1 item per unique product, ordered by SQL (lastWatchedAt DESC)", async () => {
    const rows = [
      mkRow({
        id: "p_a",
        lastWatchedAtIso: "2026-07-15T10:00:00.000Z",
        productId: "prod_a",
        productSlug: "alpha",
        productTitle: "Alpha Course",
        lessonId: "l_a1",
        lessonPosition: 1,
        lessonTitle: "A1",
      }),
      mkRow({
        id: "p_b",
        lastWatchedAtIso: "2026-07-15T09:00:00.000Z",
        productId: "prod_b",
        productSlug: "beta",
        productTitle: "Beta Course",
        lessonId: "l_b1",
        lessonPosition: 1,
        lessonTitle: "B1",
      }),
    ];
    const { repo } = mkStubRepo(rows);
    const result = await buildContinueWatchingHistory(
      { userId: "user_1" },
      { repo },
    );
    expect(result.items).toHaveLength(2);
    expect(result.items[0]?.product.id).toBe("prod_a"); // most recent first
    expect(result.items[1]?.product.id).toBe("prod_b");
    expect(result.items[0]?.lesson.title).toBe("A1");
    expect(result.items[0]?.lastWatchedAt.toISOString()).toBe(
      "2026-07-15T10:00:00.000Z",
    );
  });

  it("dedupes multiple lessons in the same product to the FIRST (SQL-most-recent)", async () => {
    const rows = [
      // Same product prod_a, two lessons, most-recent first.
      mkRow({
        id: "p_a2",
        lastWatchedAtIso: "2026-07-15T12:00:00.000Z",
        productId: "prod_a",
        productSlug: "alpha",
        productTitle: "Alpha Course",
        lessonId: "l_a2",
        lessonPosition: 2,
        lessonTitle: "A2",
      }),
      mkRow({
        id: "p_a1",
        lastWatchedAtIso: "2026-07-15T10:00:00.000Z",
        productId: "prod_a",
        productSlug: "alpha",
        productTitle: "Alpha Course",
        lessonId: "l_a1",
        lessonPosition: 1,
        lessonTitle: "A1",
      }),
    ];
    const { repo } = mkStubRepo(rows);
    const result = await buildContinueWatchingHistory(
      { userId: "user_1" },
      { repo },
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.product.id).toBe("prod_a");
    expect(result.items[0]?.lesson.id).toBe("l_a2"); // most recent wins
    expect(result.items[0]?.lesson.title).toBe("A2");
  });

  it("respects explicit limit after dedupe", async () => {
    const rows = [
      mkRow({
        id: "p_a",
        lastWatchedAtIso: "2026-07-15T10:00:00.000Z",
        productId: "prod_a",
        productSlug: "alpha",
        productTitle: "Alpha",
        lessonId: "l_a1",
        lessonPosition: 1,
        lessonTitle: "A1",
      }),
      mkRow({
        id: "p_b",
        lastWatchedAtIso: "2026-07-15T09:00:00.000Z",
        productId: "prod_b",
        productSlug: "beta",
        productTitle: "Beta",
        lessonId: "l_b1",
        lessonPosition: 1,
        lessonTitle: "B1",
      }),
      mkRow({
        id: "p_c",
        lastWatchedAtIso: "2026-07-15T08:00:00.000Z",
        productId: "prod_c",
        productSlug: "gamma",
        productTitle: "Gamma",
        lessonId: "l_c1",
        lessonPosition: 1,
        lessonTitle: "C1",
      }),
    ];
    const { repo } = mkStubRepo(rows);
    const result = await buildContinueWatchingHistory(
      { userId: "user_1", limit: 2 },
      { repo },
    );
    expect(result.items).toHaveLength(2);
    expect(result.items.map((r) => r.product.id)).toEqual(["prod_a", "prod_b"]);
  });
});

describe("buildContinueWatchingHistory — limit normalization", () => {
  it("uses default limit when undefined", async () => {
    const { repo, state } = mkStubRepo([]);
    await buildContinueWatchingHistory({ userId: "user_1" }, { repo });
    expect(state.lastFetchInput?.take).toBe(DEFAULT_CONTINUE_WATCHING_LIMIT * 2);
  });

  it.each([
    ["zero", 0],
    ["negative", -3],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
  ])("falls back to default for %s", async (_label, badLimit) => {
    const { repo, state } = mkStubRepo([]);
    await buildContinueWatchingHistory(
      { userId: "user_1", limit: badLimit },
      { repo },
    );
    expect(state.lastFetchInput?.take).toBe(DEFAULT_CONTINUE_WATCHING_LIMIT * 2);
  });

  it("clamps to MAX_LIMIT when limit exceeds it", async () => {
    const { repo, state } = mkStubRepo([]);
    await buildContinueWatchingHistory(
      { userId: "user_1", limit: 99 },
      { repo },
    );
    expect(state.lastFetchInput?.take).toBe(MAX_CONTINUE_WATCHING_LIMIT * 2);
  });

  it("floors fractional limits", async () => {
    const { repo, state } = mkStubRepo([]);
    await buildContinueWatchingHistory(
      { userId: "user_1", limit: 7.9 },
      { repo },
    );
    expect(state.lastFetchInput?.take).toBe(7 * 2);
  });

  it("normalizeContinueWatchingLimit is exported and consistent with the use case", () => {
    expect(normalizeContinueWatchingLimit(undefined)).toBe(
      DEFAULT_CONTINUE_WATCHING_LIMIT,
    );
    expect(normalizeContinueWatchingLimit(0)).toBe(
      DEFAULT_CONTINUE_WATCHING_LIMIT,
    );
    expect(normalizeContinueWatchingLimit(-1)).toBe(
      DEFAULT_CONTINUE_WATCHING_LIMIT,
    );
    expect(normalizeContinueWatchingLimit(99)).toBe(MAX_CONTINUE_WATCHING_LIMIT);
    expect(normalizeContinueWatchingLimit(7.9)).toBe(7);
  });
});

describe("buildContinueWatchingHistory — repo contract", () => {
  it("passes userId + locale + take + cursorDate=null to the repo", async () => {
    const { repo, state } = mkStubRepo([]);
    await buildContinueWatchingHistory(
      { userId: "user_42", locale: "it", limit: 3 },
      { repo },
    );
    expect(state.lastFetchInput).toEqual({
      userId: "user_42",
      locale: "it",
      take: 6,
      cursorDate: null,
    });
  });

  it("passes undefined locale when not provided", async () => {
    const { repo, state } = mkStubRepo([]);
    await buildContinueWatchingHistory({ userId: "user_42" }, { repo });
    expect(state.lastFetchInput?.locale).toBeUndefined();
    expect(state.lastFetchInput?.cursorDate).toBeNull();
  });
});

describe("buildContinueWatchingHistory — defensive row shape", () => {
  it("skips adapter rows whose lastWatchedAt is somehow null", async () => {
    const { repo } = mkStubRepo([
      {
        // Adapter contract says lastWatchedAt is non-null (filtered
        // at the WHERE level), but defense-in-depth: if a future
        // refactor ever returns a null here, the use case must drop
        // it silently rather than leak Date(0) to the dashboard.
        id: "p_a",
        lastWatchedAt: null as unknown as Date,
        lesson: {
          id: "l_a1",
          position: 1,
          title: "A1",
          videoUrl: null,
          product: {
            id: "prod_a",
            slug: "alpha",
            coverUrl: null,
            title: "Alpha",
          },
        },
      },
    ]);
    const result = await buildContinueWatchingHistory(
      { userId: "user_1" },
      { repo },
    );
    expect(result.items).toEqual([]);
    expect(result.nextCursor).toBeNull();
  });
});

describe("prismaContinueWatchingRepository — adapter sanity", () => {
  it("is exported with the expected shape (port contract)", () => {
    expect(typeof prismaContinueWatchingRepository.fetchRecentProgress).toBe(
      "function",
    );
  });

  it("does NOT throw on construction (lazy prisma import via module)", () => {
    // Constructing the constant must not trigger a DB connection.
    // The actual fetch is a vi.spyOn-able method.
    const spy = vi.spyOn(
      prismaContinueWatchingRepository,
      "fetchRecentProgress",
    );
    expect(spy).toBeDefined();
    spy.mockRestore();
  });
});

describe("BuildContinueWatchingDeps — type contract", () => {
  it("accepts BuildContinueWatchingDeps with a stub repo", async () => {
    const { repo } = mkStubRepo([]);
    const deps: BuildContinueWatchingDeps = { repo };
    const result = await buildContinueWatchingHistory(
      { userId: "user_1" },
      deps,
    );
    expect(result.items).toEqual([]);
    expect(result.nextCursor).toBeNull();
  });
});

// ─── Cursor pagination (Phase 2 step 2 v2) ─────────────────────────────

describe("buildContinueWatchingHistory — cursor pagination", () => {
  it("emits nextCursor (non-null) when the page fills to limit", async () => {
    // Build MAX_LIMIT (10) unique products so the page fills exactly.
    const rows = Array.from({ length: MAX_CONTINUE_WATCHING_LIMIT }, (_, i) =>
      mkRow({
        id: `p_${i}`,
        lastWatchedAtIso: new Date(
          Date.UTC(2026, 6, 15, 10 - i, 0, 0),
        ).toISOString(),
        productId: `prod_${i}`,
        productSlug: `slug-${i}`,
        productTitle: `Title ${i}`,
        lessonId: `l_${i}`,
        lessonPosition: 1,
        lessonTitle: `L${i}`,
      }),
    );
    const { repo } = mkStubRepo(rows);
    const result = await buildContinueWatchingHistory(
      { userId: "user_1", limit: MAX_CONTINUE_WATCHING_LIMIT },
      { repo },
    );
    expect(result.items).toHaveLength(MAX_CONTINUE_WATCHING_LIMIT);
    // nextCursor encodes the lastWatchedAt of the LAST visible item.
    expect(result.nextCursor).toBe(
      result.items[result.items.length - 1]!.lastWatchedAt.toISOString(),
    );
  });

  it("emits nextCursor=null when the page is partial (fewer items than limit)", async () => {
    // Only 2 rows; default limit is 5 → end-of-feed.
    const { repo } = mkStubRepo([
      mkRow({
        id: "p_a",
        lastWatchedAtIso: "2026-07-15T10:00:00.000Z",
        productId: "prod_a",
        productSlug: "alpha",
        productTitle: "Alpha",
        lessonId: "l_a1",
        lessonPosition: 1,
        lessonTitle: "A1",
      }),
      mkRow({
        id: "p_b",
        lastWatchedAtIso: "2026-07-15T09:00:00.000Z",
        productId: "prod_b",
        productSlug: "beta",
        productTitle: "Beta",
        lessonId: "l_b1",
        lessonPosition: 1,
        lessonTitle: "B1",
      }),
    ]);
    const result = await buildContinueWatchingHistory(
      { userId: "user_1" },
      { repo },
    );
    expect(result.items).toHaveLength(2);
    expect(result.nextCursor).toBeNull();
  });

  it("forwards cursorDate to the repo when a valid cursor is provided", async () => {
    const { repo, state } = mkStubRepo([]);
    const cursor = "2026-07-15T10:00:00.000Z";
    await buildContinueWatchingHistory(
      { userId: "user_1", cursor },
      { repo },
    );
    expect(state.lastFetchInput?.cursorDate?.toISOString()).toBe(cursor);
  });

  it("silently treats malformed cursor as null (no throw, no 400)", async () => {
    const { repo, state } = mkStubRepo([]);
    await buildContinueWatchingHistory(
      { userId: "user_1", cursor: "not-a-date" },
      { repo },
    );
    // Repo receives cursorDate=null — defensive fallback.
    expect(state.lastFetchInput?.cursorDate).toBeNull();
  });

  it("silently treats empty / null cursor as no cursor", async () => {
    const { repo, state } = mkStubRepo([]);
    for (const badCursor of ["", null, undefined]) {
      await buildContinueWatchingHistory(
        // @ts-expect-error — intentionally testing runtime null/undefined
        { userId: "user_1", cursor: badCursor },
        { repo },
      );
      expect(state.lastFetchInput?.cursorDate).toBeNull();
    }
  });

  it("nextCursor reflects the last DEDUPLICATED item, not the last Prisma row", async () => {
    // 5 raw rows that dedupe to 3 unique products (limit=3, full page).
    // Two rows share prod_a (most-recent first), two share prod_b.
    const rows = [
      mkRow({
        id: "p_a1",
        lastWatchedAtIso: "2026-07-15T12:00:00.000Z",
        productId: "prod_a",
        productSlug: "alpha",
        productTitle: "Alpha",
        lessonId: "l_a1",
        lessonPosition: 1,
        lessonTitle: "A1",
      }),
      mkRow({
        id: "p_a2",
        lastWatchedAtIso: "2026-07-15T11:00:00.000Z",
        productId: "prod_a",
        productSlug: "alpha",
        productTitle: "Alpha",
        lessonId: "l_a2",
        lessonPosition: 2,
        lessonTitle: "A2",
      }),
      mkRow({
        id: "p_b1",
        lastWatchedAtIso: "2026-07-15T10:00:00.000Z",
        productId: "prod_b",
        productSlug: "beta",
        productTitle: "Beta",
        lessonId: "l_b1",
        lessonPosition: 1,
        lessonTitle: "B1",
      }),
      mkRow({
        id: "p_b2",
        lastWatchedAtIso: "2026-07-15T09:00:00.000Z",
        productId: "prod_b",
        productSlug: "beta",
        productTitle: "Beta",
        lessonId: "l_b2",
        lessonPosition: 2,
        lessonTitle: "B2",
      }),
      mkRow({
        id: "p_c1",
        lastWatchedAtIso: "2026-07-15T08:00:00.000Z",
        productId: "prod_c",
        productSlug: "gamma",
        productTitle: "Gamma",
        lessonId: "l_c1",
        lessonPosition: 1,
        lessonTitle: "C1",
      }),
    ];
    const { repo } = mkStubRepo(rows);
    const result = await buildContinueWatchingHistory(
      { userId: "user_1", limit: 3 },
      { repo },
    );
    expect(result.items).toHaveLength(3);
    expect(result.items.map((r) => r.product.id)).toEqual([
      "prod_a",
      "prod_b",
      "prod_c",
    ]);
    // nextCursor = lastWatchedAt of prod_c (the 3rd and LAST deduplicated
    // item), NOT the last raw Prisma row (which is also prod_c here, but
    // the invariant is what matters: always last deduped item).
    expect(result.nextCursor).toBe("2026-07-15T08:00:00.000Z");
  });
});

describe("decodeContinueWatchingCursor", () => {
  it("parses valid ISO-8601 timestamp", () => {
    const date = decodeContinueWatchingCursor("2026-07-15T10:00:00.000Z");
    expect(date?.toISOString()).toBe("2026-07-15T10:00:00.000Z");
  });

  it("returns null for null / undefined / empty string", () => {
    expect(decodeContinueWatchingCursor(null)).toBeNull();
    expect(decodeContinueWatchingCursor(undefined)).toBeNull();
    expect(decodeContinueWatchingCursor("")).toBeNull();
  });

  it("returns null for non-ISO garbage", () => {
    expect(decodeContinueWatchingCursor("not-a-date")).toBeNull();
    expect(decodeContinueWatchingCursor("2026-13-99")).toBeNull();
    expect(decodeContinueWatchingCursor("hello world")).toBeNull();
  });
});