/**
 * src/domains/creator-ops/read-models/prisma-content-repository.ts
 *
 * Phase 3 Step 3 — Content read-model Prisma adapter.
 *
 * Implements `ContentRepository` (Domain port from `./content-types`).
 *
 * 4 bounded queries per content view (within master-plan §1
 * "max 4-6 aggregate" budget):
 *   1. Product.findMany => creator's products (bounded)
 *   2. Content.findMany status='draft' bounded
 *   3. Content.findMany status IN ('scheduled','pending') bounded
 *   4. Content.findMany status='published' bounded
 *
 * NOTE: The `content` Prisma model is loaded via `as any` cast because
 * the canonical V2 Content schema (master-plan §3 "post / lesson /
 * resource / free_course / offer_card") may be added in a follow-up
 * migration. The adapter is the SEAM: when the Content table is added,
 * remove the `as any` and use the typed client.
 *
 * ADR-0018 §b: this Adapter is the ONLY file in the Content area that
 * imports @prisma/client. UI/UseCase/Types/Tests import ONLY this
 * file indirectly (via the use case's `deps.repo`).
 */

import { prisma } from "@/lib/db/prisma";
import type { ContentKind } from "@/domains/catalog/content-type-registry";
import type {
  ContentRepository,
  MinimalProduct,
  RawContentItem,
} from "./content-types";

interface PrismaContentRow {
  id: string;
  kind: string;
  status: string;
  title: string;
  productId: string;
  scheduledAt: Date | null;
  publishedAt: Date | null;
  createdAt: Date;
  product: { id: string; slug: string };
}

function toRawContentItem(row: PrismaContentRow): RawContentItem {
  return {
    id: row.id,
    kind: row.kind as ContentKind,
    status: row.status,
    title: row.title,
    productId: row.productId,
    productSlug: row.product.slug,
    createdAt: row.createdAt,
    scheduledAt: row.scheduledAt,
    publishedAt: row.publishedAt,
  };
}

export const prismaContentRepository: ContentRepository = {
  async fetchOwnedProducts(creatorId: string): Promise<MinimalProduct[]> {
    if (!creatorId) return [];
    return await prisma.product.findMany({
      where: { creatorId, deletedAt: null },
      select: { id: true, slug: true },
      orderBy: { createdAt: "asc" },
    });
  },

  async fetchDrafts(productIds, take): Promise<RawContentItem[]> {
    if (productIds.length === 0 || take <= 0) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await (prisma as any).content.findMany({
      where: {
        productId: { in: [...productIds] },
        status: "draft",
      },
      include: { product: { select: { id: true, slug: true } } },
      orderBy: { updatedAt: "desc" },
      take,
    });
    return (rows as PrismaContentRow[]).map(toRawContentItem);
  },

  async fetchScheduled(productIds, windowStart, take): Promise<RawContentItem[]> {
    if (productIds.length === 0 || take <= 0) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await (prisma as any).content.findMany({
      where: {
        productId: { in: [...productIds] },
        status: { in: ["scheduled", "pending"] },
        scheduledAt: { gte: windowStart },
      },
      include: { product: { select: { id: true, slug: true } } },
      orderBy: { scheduledAt: "asc" },
      take,
    });
    return (rows as PrismaContentRow[]).map(toRawContentItem);
  },

  async fetchRecent(productIds, take): Promise<RawContentItem[]> {
    if (productIds.length === 0 || take <= 0) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await (prisma as any).content.findMany({
      where: {
        productId: { in: [...productIds] },
        status: "published",
      },
      include: { product: { select: { id: true, slug: true } } },
      orderBy: { publishedAt: "desc" },
      take,
    });
    return (rows as PrismaContentRow[]).map(toRawContentItem);
  },
};
