import { describe, expect, it, vi } from "vitest";
import {
  syncCourseConfigRecords,
  type DatabaseClient,
  type SyncCourseConfigInput,
} from "./sync-course-config";

const input: SyncCourseConfigInput = {
  slug: "bundled-course",
  creatorId: "creator-1",
  coverUrl: "/cover.jpg",
  templateId: "lumio",
  defaultLanguage: "it",
  configJson: JSON.stringify({
    slug: "bundled-course",
    defaultLanguage: "it",
    cover: "/cover.jpg",
    checkoutUrl: "#",
    author: "Test",
    languages: {
      it: {
        title: "Test",
        problem: "",
        story: "",
        cta: "Start",
        description: "",
        ebookTitle: "Test",
        ebookContent: "",
      },
    },
    lessons: [],
    ebookChapters: [],
  }),
};

function makeDb(options?: { failCache?: boolean }) {
  const tx = {
    product: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "product-1" }),
      update: vi.fn(),
    },
    courseConfigCache: {
      upsert: options?.failCache
        ? vi.fn().mockRejectedValue(new Error("cache write failed"))
        : vi.fn().mockResolvedValue({ version: 1 }),
    },
  };
  const transaction = vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx));
  return { tx, transaction, $transaction: transaction };
}

describe("syncCourseConfigRecords", () => {
  it("writes Product and CourseConfigCache in one transaction", async () => {
    const db = makeDb();
    const result = await syncCourseConfigRecords(db as unknown as DatabaseClient, input);

    expect(db.transaction).toHaveBeenCalledOnce();
    expect(db.tx.product.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ slug: input.slug, creatorId: input.creatorId }),
      }),
    );
    expect(db.tx.courseConfigCache.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { slug: input.slug },
        create: { slug: input.slug, config: input.configJson },
      }),
    );
    expect(result).toEqual({ productId: "product-1", cacheVersion: 1, createdProduct: true });
  });

  it("rejects invalid config JSON before opening a transaction", async () => {
    const db = makeDb();

    await expect(
      syncCourseConfigRecords(db as unknown as DatabaseClient, {
        ...input,
        configJson: "{not-json",
      }),
    ).rejects.toThrow();
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("rejects a config for a different slug before opening a transaction", async () => {
    const db = makeDb();

    await expect(
      syncCourseConfigRecords(db as unknown as DatabaseClient, {
        ...input,
        configJson: JSON.stringify({
          slug: "other-course",
          defaultLanguage: "it",
          cover: "/cover.jpg",
          checkoutUrl: "#",
          author: "Test",
          languages: {
            it: {
              title: "Test",
              problem: "",
              story: "",
              cta: "Start",
              description: "",
              ebookTitle: "Test",
              ebookContent: "",
            },
          },
          lessons: [],
          ebookChapters: [],
        }),
      }),
    ).rejects.toThrow(/Config slug mismatch/);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("refuses to resurrect a soft-deleted product", async () => {
    const db = makeDb();
    db.tx.product.findFirst.mockResolvedValue({
      id: "deleted-product",
      deletedAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    await expect(
      syncCourseConfigRecords(db as unknown as DatabaseClient, input),
    ).rejects.toThrow(/soft-deleted/);
    expect(db.tx.product.update).not.toHaveBeenCalled();
    expect(db.tx.product.create).not.toHaveBeenCalled();
    expect(db.tx.courseConfigCache.upsert).not.toHaveBeenCalled();
  });

  it("propagates cache failure so the transaction rolls back both writes", async () => {
    const db = makeDb({ failCache: true });

    await expect(
      syncCourseConfigRecords(db as unknown as DatabaseClient, input),
    ).rejects.toThrow("cache write failed");
    expect(db.tx.product.create).toHaveBeenCalledOnce();
    expect(db.tx.courseConfigCache.upsert).toHaveBeenCalledOnce();
  });
});
