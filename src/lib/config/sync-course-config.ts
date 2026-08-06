import type { Prisma, PrismaClient } from "@prisma/client";

export interface SyncCourseConfigInput {
  slug: string;
  creatorId: string;
  coverUrl: string | null;
  templateId: string;
  defaultLanguage: string;
  configJson: string;
}

export interface SyncCourseConfigResult {
  productId: string;
  cacheVersion: number;
  createdProduct: boolean;
}

type TransactionClient = Prisma.TransactionClient;
export type DatabaseClient = Pick<PrismaClient, "$transaction">;

/**
 * Atomically synchronize the two database projections of a bundled course.
 * A failure in either write rolls back Product and CourseConfigCache together.
 */
export async function syncCourseConfigRecords(
  db: DatabaseClient,
  input: SyncCourseConfigInput,
): Promise<SyncCourseConfigResult> {
  return db.$transaction(async (tx: TransactionClient) => {
    const existingProduct = await tx.product.findUnique({
      where: { slug: input.slug },
      select: { id: true },
    });

    const product = existingProduct
      ? await tx.product.update({
          where: { slug: input.slug },
          data: {
            coverUrl: input.coverUrl,
            templateId: input.templateId,
            status: "published",
            defaultLanguage: input.defaultLanguage,
          },
          select: { id: true },
        })
      : await tx.product.create({
          data: {
            slug: input.slug,
            coverUrl: input.coverUrl,
            templateId: input.templateId,
            status: "published",
            defaultLanguage: input.defaultLanguage,
            creatorId: input.creatorId,
          },
          select: { id: true },
        });

    const cache = await tx.courseConfigCache.upsert({
      where: { slug: input.slug },
      update: {
        config: input.configJson,
        version: { increment: 1 },
      },
      create: {
        slug: input.slug,
        config: input.configJson,
      },
      select: { version: true },
    });

    return {
      productId: product.id,
      cacheVersion: cache.version,
      createdProduct: !existingProduct,
    };
  });
}
