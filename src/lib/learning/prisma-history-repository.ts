/**
 * src/lib/learning/prisma-history-repository.ts
 *
 * Phase 2 — History (My Courses) Prisma adapter.
 *
 * Adapter Layer (per ADR-0016 §1 dep direction). Imports the port
 * contract from `./history-types`; exports a concrete implementation
 * of `HistoryRepository`.
 *
 * Query shape:
 *   accessGrant.findMany({
 *     where: { userId, status: 'active' },
 *     orderBy: { grantedAt: 'desc' },
 *     include: { product: { include: { translations } } }
 *   })
 *
 * AccessGrant is the single source of truth for product access.
 * This adapter returns one HistoryItem per active grant.
 */

import { prisma } from "@/lib/db/prisma";

import type {
  BuildHistoryInput,
  HistoryItem,
  HistoryRepository,
} from "./history-types";

export const prismaHistoryRepository: HistoryRepository = {
  async listActiveGrants({
    userId,
    locale,
    limit,
  }: BuildHistoryInput): Promise<HistoryItem[]> {
    const localization = (whereExtra: object) =>
      locale
        ? { where: { locale, ...whereExtra }, take: 1 }
        : { orderBy: { locale: "asc" as const }, take: 1 };

    const grants = await prisma.accessGrant.findMany({
      where: {
        userId,
        status: "active",
      },
      orderBy: { grantedAt: "desc" },
      take: limit,
      select: {
        sourceType: true,
        grantedAt: true,
        product: {
          select: {
            id: true,
            slug: true,
            coverUrl: true,
            translations: localization({ section: "titolo" }),
          },
        },
      },
    });

    const items: HistoryItem[] = [];
    for (const g of grants) {
      if (!g.product) continue; // belt-and-braces (FK ON DELETE RESTRICT)
      const titleTrans = g.product.translations[0];
      items.push({
        productId: g.product.id,
        slug: g.product.slug,
        title: titleTrans?.content ?? g.product.slug,
        coverUrl: g.product.coverUrl ?? null,
        sourceType: g.sourceType as HistoryItem["sourceType"],
        grantedAt: g.grantedAt.toISOString(),
      });
    }
    return items;
  },
};
