// @vitest-environment node

import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  syncCourseConfigRecords,
  type DatabaseClient,
  type SyncCourseConfigInput,
} from "./sync-course-config";

const hasDatabase = Boolean(process.env.DATABASE_URL);
const describeIfDatabase = hasDatabase ? describe : describe.skip;
const prisma = new PrismaClient();
const uniqueSlug = `sync-rollback-${Date.now().toString(36)}`;
const uniqueEmail = `${uniqueSlug}@example.com`;
let creatorId = "";

const input: SyncCourseConfigInput = {
  slug: uniqueSlug,
  creatorId: "",
  coverUrl: "/cover.jpg",
  templateId: "lumio",
  defaultLanguage: "it",
  configJson: JSON.stringify({ slug: uniqueSlug }),
};

afterAll(async () => {
  if (creatorId) await prisma.user.delete({ where: { id: creatorId } });
  await prisma.$disconnect();
});

describeIfDatabase("syncCourseConfigRecords — real PostgreSQL rollback", () => {
  it("rolls back Product when CourseConfigCache fails", async () => {
    const creator = await prisma.user.create({
      data: {
        email: uniqueEmail,
        role: "creator",
        creatorType: "internal",
      },
    });
    creatorId = creator.id;
    input.creatorId = creator.id;

    const failingDb = {
      $transaction: (callback: (tx: unknown) => Promise<unknown>) =>
        prisma.$transaction((tx) =>
          callback({
            product: tx.product,
            courseConfigCache: {
              upsert: async () => {
                throw new Error("intentional cache failure");
              },
            },
          }),
        ),
    } as unknown as DatabaseClient;

    await expect(syncCourseConfigRecords(failingDb, input)).rejects.toThrow(
      "intentional cache failure",
    );

    const [product, cache] = await Promise.all([
      prisma.product.findUnique({ where: { slug: uniqueSlug } }),
      prisma.courseConfigCache.findUnique({ where: { slug: uniqueSlug } }),
    ]);
    expect(product).toBeNull();
    expect(cache).toBeNull();
  });
});
