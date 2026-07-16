/**
 * src/domains/creator-ops/read-models/content.test.ts
 *
 * Vitest unit tests for the content read-model use case.
 *
 * Stubs the ContentRepository port via mkStubContentRepo(). NO Prisma
 * mocking, NO live clock — pure AppJS tests over the port contract.
 *
 * Mirrors inbox.test.ts + audience.test.ts structure.
 */

import { describe, expect, it } from "vitest";
import {
  buildContent,
  DEFAULT_DRAFTS_LIMIT,
  DEFAULT_RECENT_LIMIT,
  DEFAULT_SCHEDULED_WINDOW_DAYS,
} from "./content";
import type {
  ContentRepository,
  MinimalProduct,
  RawContentItem,
} from "./content-types";

interface StubState {
  products: MinimalProduct[];
  drafts: RawContentItem[];
  scheduled: RawContentItem[];
  recent: RawContentItem[];
}

function mkStubRepo(state: StubState): ContentRepository {
  return {
    async fetchOwnedProducts(creatorId: string): Promise<MinimalProduct[]> {
      return creatorId ? state.products : [];
    },
    async fetchDrafts(productIds: readonly string[], take: number): Promise<RawContentItem[]> {
      return state.drafts.filter((d) => productIds.includes(d.productId)).slice(0, take);
    },
    async fetchScheduled(
      productIds: readonly string[],
      windowStart: Date,
      take: number,
    ): Promise<RawContentItem[]> {
      return state.scheduled
        .filter((s) => productIds.includes(s.productId))
        .filter((s) => s.scheduledAt !== null && s.scheduledAt!.getTime() >= windowStart.getTime())
        .slice(0, take);
    },
    async fetchRecent(productIds: readonly string[], take: number): Promise<RawContentItem[]> {
      return state.recent.filter((r) => productIds.includes(r.productId)).slice(0, take);
    },
  };
}

const FIXED_NOW = new Date("2026-07-16T12:00:00.000Z");

const SMALL_PRODUCT: MinimalProduct = { id: "p1", slug: "course-1" };

const RAW_DRAFT: RawContentItem = {
  id: "draft-1",
  kind: "lesson" as RawContentItem["kind"],
  status: "draft",
  title: "Lesson draft",
  productId: "p1",
  productSlug: "course-1",
  createdAt: new Date("2026-07-15T08:00:00.000Z"),
  scheduledAt: null,
  publishedAt: null,
};

const RAW_SCHEDULED: RawContentItem = {
  id: "sc-1",
  kind: "post" as RawContentItem["kind"],
  status: "scheduled",
  title: "Roadmap post",
  productId: "p1",
  productSlug: "course-1",
  createdAt: new Date("2026-07-14T08:00:00.000Z"),
  scheduledAt: new Date("2026-07-18T12:00:00.000Z"),
  publishedAt: null,
};

const RAW_RECENT: RawContentItem = {
  id: "pub-1",
  kind: "lesson" as RawContentItem["kind"],
  status: "published",
  title: "Lesson 1",
  productId: "p1",
  productSlug: "course-1",
  createdAt: new Date("2026-07-10T08:00:00.000Z"),
  scheduledAt: null,
  publishedAt: new Date("2026-07-11T08:00:00.000Z"),
};

describe("buildContent — defaults + happy path", () => {
  it("uses default 14-day scheduled window, 10-item recent limit, 20-item drafts limit", () => {
    expect(DEFAULT_SCHEDULED_WINDOW_DAYS).toBe(14);
    expect(DEFAULT_RECENT_LIMIT).toBe(10);
    expect(DEFAULT_DRAFTS_LIMIT).toBe(20);
  });

  it("returns the 4-bucket shape when a creator has products + content", async () => {
    const repo = mkStubRepo({
      products: [SMALL_PRODUCT],
      drafts: [RAW_DRAFT],
      scheduled: [RAW_SCHEDULED],
      recent: [RAW_RECENT],
    });
    const result = await buildContent({ creatorId: "user-1", now: FIXED_NOW }, { repo });
    expect(result.totals).toEqual({ drafts: 1, scheduled: 1, recent: 1 });
    expect(result.drafts.map((d) => d.id)).toEqual(["draft-1"]);
    expect(result.scheduled.map((s) => s.id)).toEqual(["sc-1"]);
    expect(result.recent.map((r) => r.id)).toEqual(["pub-1"]);
  });

  it("sorts the scheduled bucket by scheduledAt ASC", async () => {
    const scLater: RawContentItem = {
      ...RAW_SCHEDULED,
      id: "sc-2",
      scheduledAt: new Date("2026-07-25T12:00:00.000Z"),
    };
    const repo = mkStubRepo({
      products: [SMALL_PRODUCT],
      drafts: [],
      scheduled: [scLater, RAW_SCHEDULED],
      recent: [],
    });
    const result = await buildContent({ creatorId: "user-1", now: FIXED_NOW }, { repo });
    expect(result.scheduled.map((s) => s.id)).toEqual(["sc-1", "sc-2"]);
  });

  it("dedupes drafts by raw.id even if the adapter returns duplicates", async () => {
    const repo = mkStubRepo({
      products: [SMALL_PRODUCT],
      drafts: [RAW_DRAFT, { ...RAW_DRAFT, title: "duplicate" }],
      scheduled: [],
      recent: [],
    });
    const result = await buildContent({ creatorId: "user-1", now: FIXED_NOW }, { repo });
    expect(result.totals.drafts).toBe(1);
    expect(result.drafts).toHaveLength(1);
  });
});

describe("buildContent — input guards", () => {
  it("returns an EMPTY_CONTENT view when creatorId is empty", async () => {
    const repo = mkStubRepo({ products: [], drafts: [], scheduled: [], recent: [] });
    const result = await buildContent({ creatorId: "", now: FIXED_NOW }, { repo });
    expect(result).toEqual({
      totals: { drafts: 0, scheduled: 0, recent: 0 },
      drafts: [],
      scheduled: [],
      recent: [],
    });
  });

  it("returns an EMPTY_CONTENT view when creator has no products", async () => {
    const repo = mkStubRepo({
      products: [],
      drafts: [RAW_DRAFT],
      scheduled: [RAW_SCHEDULED],
      recent: [RAW_RECENT],
    });
    const result = await buildContent({ creatorId: "user-1", now: FIXED_NOW }, { repo });
    expect(result).toEqual({
      totals: { drafts: 0, scheduled: 0, recent: 0 },
      drafts: [],
      scheduled: [],
      recent: [],
    });
  });

  it("filters scheduled bucket to entries within the requested window", async () => {
    const scWayBefore: RawContentItem = {
      ...RAW_SCHEDULED,
      id: "sc-old",
      scheduledAt: new Date("2026-06-01T12:00:00.000Z"),
    };
    const repo = mkStubRepo({
      products: [SMALL_PRODUCT],
      drafts: [],
      scheduled: [scWayBefore, RAW_SCHEDULED],
      recent: [],
    });
    const result = await buildContent({ creatorId: "user-1", now: FIXED_NOW }, { repo });
    expect(result.scheduled).toHaveLength(1);
    expect(result.scheduled[0].id).toBe("sc-1");
  });
});
