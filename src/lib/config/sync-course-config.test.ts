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
  configJson: JSON.stringify({ slug: "bundled-course" }),
};

function makeDb(options?: { failCache?: boolean }) {
  const tx = {
    product: {
      findUnique: vi.fn().mockResolvedValue(null),
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

  it("propagates cache failure so the transaction rolls back both writes", async () => {
    const db = makeDb({ failCache: true });

    await expect(
      syncCourseConfigRecords(db as unknown as DatabaseClient, input),
    ).rejects.toThrow("cache write failed");
    expect(db.tx.product.create).toHaveBeenCalledOnce();
    expect(db.tx.courseConfigCache.upsert).toHaveBeenCalledOnce();
  });
});
