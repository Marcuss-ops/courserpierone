/**
 * src/domains/creator-ops/read-models/prisma-inbox-repository.ts
 *
 * Phase 3 Step 2 — inbox Prisma adapter (Adapter layer).
 *
 * MIGRATION of the in-line prisma calls from the legacy
 * `src/domains/insights/customer-profile/get-creator-inbox.ts` into
 * a canonical adapter implementing the `InboxRepository` port.
 *
 * Implements `InboxRepository` (Domain port from `./inbox-types`).
 * Three bounded round-trips per `getCreatorInbox` call:
 *
 * 1. `fetchOwnedProducts({userId, role})`
 *    - role='creator': `where: { creatorId: userId }`
 *    - role='admin':   `where: { status: 'published' }` (admin bypass)
 *    - other roles:    caller-side filter (use case returns empty)
 *    - Index used: `Product @@index([creatorId, status])`
 *
 * 2. `fetchConversationsWithLastMessage({userId, productIds})`
 *    - `where: { productId: { in: productIds }, OR: [{userOneId:me},{userTwoId:me}] }`
 *    - `include.messages.take:1 orderBy:createdAt desc` (inline last message)
 *    - `include.userOne/userTwo/product` minimal select
 *    - Index used: `Conversation @@index([productId, updatedAt])`
 *
 * 3. `fetchUnreadCounts({userId, conversationIds})`
 *    - `prisma.message.groupBy({by:['conversationId'], where:{conversationId:{in:...}, read:false, senderId:{not:userId}}, _count:{id:true}})`
 *    - Excludes viewer's own messages (sender) from "unread".
 *    - Skipped entirely when `conversationIds.length === 0` (perf).
 */

import { prisma } from "@/lib/db/prisma";

import type {
  InboxRepository,
  RawInboxConversation,
  RawInboxProduct,
  RawInboxUnreadCount,
} from "./inbox-types";

/**
 * Canonical Prisma adapter — module-level const. Mirrors the
 * `prismaAudienceRepository` + `prismaContinueWatchingRepository`
 * singleton pattern (no extra instantiation; prisma itself is a
 * globalForPrisma singleton).
 */
export const prismaInboxRepository: InboxRepository = {
  async fetchOwnedProducts({ userId, role }) {
    if (role === "admin") {
      const products = await prisma.product.findMany({
        where: { status: "published" },
        select: { id: true, slug: true, coverUrl: true },
      });
      return products.map(
        (p): RawInboxProduct => ({
          id: p.id,
          slug: p.slug,
          coverUrl: p.coverUrl,
        }),
      );
    }
    // role === 'creator' (use case filters other roles before this call)
    const products = await prisma.product.findMany({
      where: { creatorId: userId },
      select: { id: true, slug: true, coverUrl: true },
    });
    return products.map(
      (p): RawInboxProduct => ({
        id: p.id,
        slug: p.slug,
        coverUrl: p.coverUrl,
      }),
    );
  },

  async fetchConversationsWithLastMessage({ userId, productIds }) {
    if (productIds.length === 0) return [];

    const rows = await prisma.conversation.findMany({
      where: {
        productId: { in: [...productIds] },
        OR: [{ userOneId: userId }, { userTwoId: userId }],
      },
      include: {
        userOne: {
          select: { id: true, name: true, image: true, role: true },
        },
        userTwo: {
          select: { id: true, name: true, image: true, role: true },
        },
        product: { select: { id: true, slug: true, coverUrl: true } },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            content: true,
            createdAt: true,
            senderId: true,
            read: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    return rows.map((c): RawInboxConversation => {
      const otherUser = c.userOneId === userId ? c.userTwo : c.userOne;
      const lastMessage = c.messages[0] ?? null;
      return {
        id: c.id,
        userOneId: c.userOneId,
        userTwoId: c.userTwoId,
        productId: c.productId,
        productSlug: c.product?.slug ?? "Prodotto",
        productCoverUrl: c.product?.coverUrl ?? null,
        updatedAt: c.updatedAt,
        otherUser: {
          id: otherUser.id,
          name: otherUser.name ?? null,
          image: otherUser.image ?? null,
          role: otherUser.role,
        },
        lastMessage: lastMessage
          ? {
              id: lastMessage.id,
              content: lastMessage.content,
              createdAt: lastMessage.createdAt,
              senderId: lastMessage.senderId,
              read: lastMessage.read,
            }
          : null,
      };
    });
  },

  async fetchUnreadCounts({ userId, conversationIds }) {
    if (conversationIds.length === 0) return [];
    const rows = await prisma.message.groupBy({
      by: ["conversationId"],
      where: {
        conversationId: { in: [...conversationIds] },
        read: false,
        senderId: { not: userId },
      },
      _count: { id: true },
    });
    return rows.map(
      (r): RawInboxUnreadCount => ({
        conversationId: r.conversationId,
        unreadCount: r._count.id,
      }),
    );
  },
};