import { prisma } from "@/lib/db/prisma";

import type { AccessRepository } from "../ports/access-repository";

export type PostCheckoutSessionResolver = AccessRepository["resolvePostCheckoutSession"];

/**
 * Prisma is intentionally isolated here. The use case and domain modules
 * depend only on AccessRepository; the application composition root injects
 * the verified post-checkout session reader.
 */
export function createPrismaAccessRepository(
  resolvePostCheckoutSession: PostCheckoutSessionResolver,
): AccessRepository {
  return {
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

    async isAdminUser(userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true },
      });
      return user?.role === "admin";
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

    resolvePostCheckoutSession,

    async findPostCheckoutOrder({ provider, providerOrderId, productId }) {
      return prisma.order.findFirst({
        where: { paymentProvider: provider, providerOrderId, productId },
        select: { id: true, status: true, userId: true },
      });
    },
  };
}
