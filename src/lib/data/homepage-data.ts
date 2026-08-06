// ─── Homepage Data Fetcher ─────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";

export type PublishedProductRow = Prisma.ProductGetPayload<{
  include: {
    translations: true;
    _count: { select: { lessons: true; orders: true } };
  };
}>;

export interface HomepageDataResult {
  products: PublishedProductRow[];
}

/**
 * Fetches all published products with translations and counts,
 * ordered by most recent first.
 */
export async function fetchPublishedProducts(): Promise<HomepageDataResult> {
  const products = await prisma.product.findMany({
    where: { status: "published", deletedAt: null },
    include: {
      translations: true,
      _count: { select: { lessons: true, orders: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return { products };
}
