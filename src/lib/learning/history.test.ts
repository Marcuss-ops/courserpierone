/**
 * src/lib/learning/history.test.ts
 *
 * Unit tests for the history use case (Phase 2 — My Courses).
 * Deterministic, no Prisma mocks, no clock.
 */

import { describe, it, expect } from "vitest";
import { buildHistory, normalizeHistoryLimit } from "./history";
import {
  type BuildHistoryInput,
  type HistoryItem,
  type HistoryRepository,
} from "./history-types";

// ── Fixtures ────────────────────────────────────────────────────────
function mkItem(overrides: Partial<HistoryItem> = {}): HistoryItem {
  return {
    productId: "p1",
    slug: "course-1",
    title: "Course 1",
    coverUrl: null,
    sourceType: "free_enrollment",
    grantedAt: "2026-07-16T10:00:00.000Z",
    ...overrides,
  };
}

function mkStubRepo(items: HistoryItem[]): HistoryRepository {
  return {
    async listActiveGrants(_input: BuildHistoryInput) {
      return items;
    },
  };
}

// ── Tests ────────────────────────────────────────────────────────────
describe("buildHistory", () => {
  it("returns empty result when userId is empty", async () => {
    const result = await buildHistory(
      { userId: "" },
      { repo: mkStubRepo([]) },
    );
    expect(result.items).toEqual([]);
    expect(result.count).toBe(0);
  });

  it("returns items from the repository ordered as-is", async () => {
    const items = [
      mkItem({ productId: "p2", slug: "course-2", title: "Course 2" }),
      mkItem({ productId: "p1", slug: "course-1", title: "Course 1" }),
    ];
    const result = await buildHistory(
      { userId: "u1" },
      { repo: mkStubRepo(items) },
    );
    expect(result.items).toEqual(items);
    expect(result.count).toBe(2);
  });

  it("passes locale and limit to the repository", async () => {
    let capturedInput: BuildHistoryInput | null = null;
    const repo: HistoryRepository = {
      async listActiveGrants(input) {
        capturedInput = input;
        return [];
      },
    };

    await buildHistory({ userId: "u1", locale: "it", limit: 10 }, { repo });

    expect(capturedInput).toEqual({
      userId: "u1",
      locale: "it",
      limit: 10,
    });
  });

  it("includes all AccessGrant source types", async () => {
    const items = [
      mkItem({ productId: "p1", sourceType: "free_enrollment" }),
      mkItem({ productId: "p2", sourceType: "order" }),
      mkItem({ productId: "p3", sourceType: "admin" }),
      mkItem({ productId: "p4", sourceType: "bundle" }),
      mkItem({ productId: "p5", sourceType: "watchlist" }),
    ];
    const result = await buildHistory(
      { userId: "u1" },
      { repo: mkStubRepo(items) },
    );
    expect(result.items).toHaveLength(5);
    expect(result.items.map((i) => i.sourceType)).toEqual([
      "free_enrollment",
      "order",
      "admin",
      "bundle",
      "watchlist",
    ]);
  });
});

describe("normalizeHistoryLimit", () => {
  it("returns default for undefined", () => {
    expect(normalizeHistoryLimit(undefined)).toBe(50);
  });

  it("returns default for non-positive or non-finite values", () => {
    expect(normalizeHistoryLimit(0)).toBe(50);
    expect(normalizeHistoryLimit(-5)).toBe(50);
    expect(normalizeHistoryLimit(NaN)).toBe(50);
    expect(normalizeHistoryLimit(Infinity)).toBe(50);
  });

  it("floors fractional values", () => {
    expect(normalizeHistoryLimit(7.9)).toBe(7);
  });

  it("caps at MAX_HISTORY_LIMIT", () => {
    expect(normalizeHistoryLimit(999)).toBe(100);
  });
});
