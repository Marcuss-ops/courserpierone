import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

import type {
  ContentPageRecord,
  ContentPageRepository,
  CreateContentPageInputPort,
  PageStatus,
} from "./create-content-page-types";

function toContentPageRecord(row: {
  id: string;
  productId: string;
  parentId: string | null;
  slug: string;
  position: number;
  status: string;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): ContentPageRecord {
  return {
    ...row,
    status: row.status as PageStatus,
  };
}

function isKnownError(error: unknown, code: string): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

function isSlugUniqueViolation(error: unknown): boolean {
  if (!isKnownError(error, "P2002")) return false;
  const target = error.meta?.target;
  if (Array.isArray(target)) {
    return target.includes("productId") && target.includes("slug");
  }
  return typeof target === "string" && target.includes("productId") && target.includes("slug");
}

/**
 * Prisma adapter for ContentPage creation.
 *
 * Position allocation is serialized by a transaction-scoped advisory lock
 * derived from (productId, parentId). The MAX(position)+1 read and INSERT
 * therefore execute in one transaction under the same lock key. Partial
 * unique indexes remain the database backstop for writes from other paths.
 */
export const prismaCreateContentPageRepository: ContentPageRepository = {
  async findProductOwner({ productId }) {
    if (!productId) return null;
    const product = await prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      select: { creatorId: true },
    });
    return product ? { creatorId: product.creatorId } : null;
  },

  async findPageProductId({ pageId }) {
    if (!pageId) return null;
    const page = await prisma.contentPage.findUnique({
      where: { id: pageId },
      select: { productId: true },
    });
    return page ? { productId: page.productId } : null;
  },

  async createContentPage({ productId, parentId, slug, status }: CreateContentPageInputPort) {
    try {
      const page = await prisma.$transaction(async (tx) => {
        const lockKey = `${productId}:${parentId ?? "root"}`;
        await tx.$executeRaw`
          SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))
        `;

        if (parentId !== null) {
          const parent = await tx.contentPage.findFirst({
            where: { id: parentId, productId },
            select: { id: true },
          });
          if (!parent) return null;
        }

        const aggregate = await tx.contentPage.aggregate({
          where: { productId, parentId },
          _max: { position: true },
        });
        const position = (aggregate._max.position ?? 0) + 1;

        return tx.contentPage.create({
          data: { productId, parentId, slug, position, status },
          select: {
            id: true,
            productId: true,
            parentId: true,
            slug: true,
            position: true,
            status: true,
            publishedAt: true,
            createdAt: true,
            updatedAt: true,
          },
        });
      });

      if (!page) return { created: false, reason: "parent_not_found" };
      return { created: true, page: toContentPageRecord(page) };
    } catch (error) {
      if (isSlugUniqueViolation(error)) {
        return { created: false, reason: "slug_taken" };
      }
      if (parentId !== null && isKnownError(error, "P2003")) {
        return { created: false, reason: "parent_not_found" };
      }
      throw error;
    }
  },
};
