import { prisma } from "@/lib/db/prisma";

import type { ResolveCreatorProductAccessPort } from "./resolve-creator-product-access-types";

/** Prisma composition adapter for creator-side product authorization. */
export const prismaResolveCreatorProductAccessPort: ResolveCreatorProductAccessPort = {
  async loadAccessContext({ actorId, productId }) {
    const [actor, product, application] = await Promise.all([
      prisma.user.findUnique({
        where: { id: actorId },
        select: { id: true, role: true },
      }),
      prisma.product.findFirst({
        where: { id: productId, deletedAt: null },
        select: { creatorId: true },
      }),
      prisma.creatorApplication.findUnique({
        where: { userId: actorId },
        select: { status: true },
      }),
    ]);

    return {
      actor: actor
        ? {
            id: actor.id,
            role: actor.role as "admin" | "creator" | "student",
          }
        : null,
      product,
      application: application
        ? {
            status: application.status as
              | "draft"
              | "submitted"
              | "under_review"
              | "approved"
              | "rejected",
          }
        : null,
    };
  },
};
