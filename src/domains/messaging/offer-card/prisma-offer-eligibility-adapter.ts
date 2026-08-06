/**
 * src/domains/messaging/offer-card/prisma-offer-eligibility-adapter.ts
 *
 * Phase 4 — Prisma adapter for the Offer Card eligibility policy port.
 *
 * Implements `EligibilityPolicyDeps` from `./offer-eligibility-types`.
 * All queries are bounded and filter server-side as required by the
 * port contract.
 *
 * ADR-0016 §1: this file lives in the Adapter layer and is the ONLY
 * file in the offer-card domain that imports `@prisma/client`.
 */

import { prisma } from "@/lib/db/prisma";
import type {
  EligibilityPolicyDeps,
} from "./offer-eligibility-types";
import type { CreatorId, ProductId, RecipientId } from "./offer-card-types";

/**
 * Canonical Prisma adapter for `evaluateOfferEligibility`.
 * Singleton-safe via the `globalForPrisma` pattern in `@/lib/db/prisma`.
 */
export const prismaOfferEligibilityAdapter: EligibilityPolicyDeps = {
  async findConversation({ userIdA, userIdB, productId }) {
    // Symmetric lookup: the creator may be userOne or userTwo.
    const conversation = await prisma.conversation.findFirst({
      where: {
        productId,
        OR: [
          { userOneId: userIdA, userTwoId: userIdB },
          { userOneId: userIdB, userTwoId: userIdA },
        ],
      },
      select: {
        id: true,
        userOneId: true,
        userTwoId: true,
        productId: true,
      },
    });

    if (!conversation) return null;

    return {
      id: conversation.id,
      userOneId: conversation.userOneId,
      userTwoId: conversation.userTwoId,
      productId: conversation.productId,
    };
  },

  async findActiveGrant({ userId, productId }) {
    const grant = await prisma.accessGrant.findFirst({
      where: {
        userId,
        productId,
        status: "active",
      },
      select: {
        id: true,
        sourceType: true,
      },
      // deterministic tie-breaker for the unlikely duplicate case
      orderBy: { grantedAt: "desc" },
    });

    if (!grant) return null;

    return {
      id: grant.id,
      sourceType: grant.sourceType,
    };
  },

  async findProduct(productId: ProductId) {
    const product = await prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      select: {
        id: true,
        creatorId: true,
        status: true,
      },
    });

    if (!product) return null;

    return {
      id: product.id,
      creatorId: product.creatorId as CreatorId,
      status: product.status,
    };
  },

  async findPreference(userId: string) {
    const pref = await prisma.notificationPreference.findUnique({
      where: { userId },
      select: {
        inappChatReply: true,
        emailNewLesson: true,
      },
    });

    if (!pref) return null;

    return {
      inappChatReply: pref.inappChatReply,
      emailNewLesson: pref.emailNewLesson,
    };
  },

  async findSentOfferCardsInWindow({
    recipientId,
    windowDays,
    now,
  }: {
    recipientId: RecipientId;
    windowDays: number;
    now: Date;
  }) {
    const windowStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

    const rows = await prisma.offerCard.findMany({
      where: {
        recipientId,
        status: { in: ["sent", "viewed", "clicked", "converted", "expired", "withdrawn"] },
        sentAt: { gte: windowStart },
      },
      select: { sentAt: true },
      orderBy: { sentAt: "desc" },
    });

    return rows.map((r) => r.sentAt).filter((d): d is Date => d !== null);
  },
};
