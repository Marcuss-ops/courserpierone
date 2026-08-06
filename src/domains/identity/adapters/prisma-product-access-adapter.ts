import { prisma } from "@/lib/db/prisma";

import type { AccessRepository } from "../ports/access-repository";

/**
 * Prisma is intentionally isolated here. The use case and domain modules
 * depend only on ProductAccessPort and never import persistence code.
 */
export const prismaAccessRepository: AccessRepository = {
  async resolveProductId(productIdOrSlug) {
    const product = await prisma.product.findFirst({
      where: { OR: [{ id: productIdOrSlug }, { slug: productIdOrSlug }] },
      select: { id: true },
    });
    return product?.id ?? null;
  },

  async findProductCreator(productId) {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { creatorId: true },
    });
    return product?.creatorId ?? null;
  },

  async findActiveGrant(where) {
    return prisma.accessGrant.findFirst({
      where: {
        ...where,
        status: "active",
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { id: true, sourceType: true, sourceId: true },
    });
  },

  async findLatestUserOrder({ userId, productId }) {
    return prisma.order.findFirst({
      where: { userId, productId },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, userId: true },
    });
  },

  async findAnonymousOrder({
    productId,
    provider,
    providerOrderId,
    internalOrderId,
  }) {
    if (providerOrderId) {
      if (!provider) return null;
      return prisma.order.findFirst({
        where: {
          paymentProvider: provider,
          providerOrderId,
          productId,
        },
        select: { id: true, status: true, userId: true },
      });
    }

    if (!internalOrderId) return null;
    return prisma.order.findFirst({
      where: { id: internalOrderId, productId },
      select: { id: true, status: true, userId: true },
    });
  },
};
