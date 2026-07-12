/**
 * src/domains/insights/customer-profile/get-creator-inbox.ts
 *
 * Creator inbox query service.
 *
 * Phase 7 of the MCR plan extracts the 3 direct Prisma calls from
 * `src/app/dashboard/creator/messages/page.tsx` into this service.
 * The page is now thin: auth + role gating + the URL-state
 * `selectedConversationId` validation. All inbox data fetching
 * happens here.
 *
 * Current state (V1.5 + Phase 7):
 *   - 3 round-trips total: products, conversations, message groupBy
 *   - Returns the existing `CreatorConversationPreview` shape
 *   - No N+1 on the inbox page
 *
 * Future state (Phase 5 — design on main, NOT yet implemented):
 *   - Will be extended to 5 round-trips: products, conversations,
 *     message groupBy, customer insights (read model), lazy
 *     backfill (fire-and-forget).
 *   - Will return `CreatorConversationPreviewEnriched` (4 new
 *     fields: completionPercent, lastLessonTitle, sourceChannelName,
 *     lifetimeValueCents, lastContentAt).
 *   - The read model is `CustomerProductInsight` (Phase 5 design).
 *   - Phase 5 cannot ship until `CustomerProductInsight` is added
 *     to the schema (separate PR).
 *
 * Per-record, no-break rollout:
 *   - This extraction is a pure refactor. No behavior change.
 *   - Phase 5 will extend this service without touching page.tsx
 *     (the component will get the 4 new fields via the type
 *     change from `CreatorConversationPreview` to
 *     `CreatorConversationPreviewEnriched`).
 *   - If a future maintainer needs to add a new data source to the
 *     inbox (e.g., a new analytics aggregate), add it HERE — not
 *     inline in page.tsx. The page is intentionally thin.
 *
 * Why the service lives in `src/domains/insights/customer-profile/`:
 *   - The MCR plan defers the `src/lib/commerce/payments` →
 *     `src/domains/payments` rename to Phase 7 cleanup. We're
 *     landing the new `src/domains/insights/customer-profile/`
 *     path now, in the same release train, so Phase 5 can build
 *     on it without a separate rename PR.
 *   - The path is the future home of all customer-profile read
 *     services (Phase 5's `CustomerProductInsight` queries, the
 *     inbox, the analytics aggregations).
 */

import { prisma } from "@/lib/db/prisma";

/** Max chars per last-message preview (truncated to fit the inbox row). */
const PREVIEW_MAX = 80;

/**
 * Conversation preview shape for the creator-side inbox.
 *
 * Mirrors the V1.5 shape from `page.tsx` (single source of truth is
 * this service as of Phase 7). Phase 5 will extend this with 4 new
 * fields (completionPercent, lastLessonTitle, sourceChannelName,
 * lifetimeValueCents, lastContentAt) via a new
 * `CreatorConversationPreviewEnriched` interface that extends this.
 */
export interface CreatorConversationPreview {
  id: string;
  productId: string;
  productLabel: string;
  productCoverUrl: string | null;
  otherUser: {
    id: string;
    name: string | null;
    image: string | null;
    role: string;
  };
  lastMessage: {
    id: string;
    content: string;
    createdAt: string;
    senderId: string;
    read: boolean;
  } | null;
  unreadCount: number;
}

export interface CreatorInboxProductOption {
  id: string;
  slug: string;
  coverUrl: string | null;
}

export interface CreatorInboxResult {
  previews: CreatorConversationPreview[];
  productOptions: CreatorInboxProductOption[];
  totalUnread: number;
}

export interface CreatorInboxUser {
  id: string;
  role: string;
}

/**
 * Fetch the creator inbox data for the given user.
 *
 * - For `role='creator'`: scopes to products owned by the user
 *   (`Product.creatorId === user.id`).
 * - For `role='admin'`: scopes to all published products (the admin
 *   bypass for the V1.5 "oldest admin" fallback in the resolver;
 *   see `resolve-message-permission.ts`).
 * - For all other roles: returns an empty result (the page redirects
 *   to the standard inbox before calling this, but defense-in-depth).
 *
 * 3 round-trips:
 *   1. Owned products (for the scope + the product filter dropdown)
 *   2. Conversations on those products (with last-message preview,
 *      ordered by `updatedAt DESC`)
 *   3. Batched message groupBy for unread counts (one query for the
 *      entire inbox, not N per-row)
 *
 * No N+1. The `unreadMap` is built in-app from the groupBy result.
 * The `lastMessage` is fetched via the `include.messages.take: 1`
 * pattern, not a separate per-row query.
 */
export async function getCreatorInbox(
  dbUser: CreatorInboxUser
): Promise<CreatorInboxResult> {
  // ── 1. Scope products ────────────────────────────────────
  // Admin bypass: vede tutti i prodotti published (l'admin fallback nel
  // resolver è "oldest admin" per prodotti legacy senza creatorId).
  const ownedProducts =
    dbUser.role === "admin"
      ? await prisma.product.findMany({
          where: { status: "published" },
          select: { id: true, slug: true, coverUrl: true },
        })
      : await prisma.product.findMany({
          where: { creatorId: dbUser.id },
          select: { id: true, slug: true, coverUrl: true },
        });

  const productIds = ownedProducts.map((p) => p.id);

  // ── 2. Conversations (the inbox) ─────────────────────────
  const conversations = await prisma.conversation.findMany({
    where: {
      productId: { in: productIds },
      OR: [{ userOneId: dbUser.id }, { userTwoId: dbUser.id }],
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

  // ── 3. Batched unread counts via groupBy ─────────────────
  // Una sola query aggregata invece di N query per-riga. Esclude i
  // messaggi del sender (l'utente non conta i propri messaggi come
  // "non letti").
  const conversationIds = conversations.map((c) => c.id);
  const unreadRows =
    conversationIds.length > 0
      ? await prisma.message.groupBy({
          by: ["conversationId"],
          where: {
            conversationId: { in: conversationIds },
            read: false,
            senderId: { not: dbUser.id },
          },
          _count: { id: true },
        })
      : [];

  const unreadMap = new Map<string, number>();
  for (const row of unreadRows) {
    unreadMap.set(row.conversationId, row._count.id);
  }

  // ── Compose the final shape ──────────────────────────────
  const previews: CreatorConversationPreview[] = conversations.map((c) => {
    const otherUser = c.userOneId === dbUser.id ? c.userTwo : c.userOne;
    const lastMessage = c.messages[0] ?? null;

    return {
      id: c.id,
      productId: c.productId,
      productLabel: c.product?.slug ?? "Prodotto",
      productCoverUrl: c.product?.coverUrl ?? null,
      otherUser,
      lastMessage: lastMessage
        ? {
            id: lastMessage.id,
            content:
              lastMessage.content.length > PREVIEW_MAX
                ? lastMessage.content.slice(0, PREVIEW_MAX) + "…"
                : lastMessage.content,
            createdAt: lastMessage.createdAt.toISOString(),
            senderId: lastMessage.senderId,
            read: lastMessage.read,
          }
        : null,
      unreadCount: unreadMap.get(c.id) ?? 0,
    };
  });

  // Product options for the filter dropdown (scope of owned products)
  const productOptions: CreatorInboxProductOption[] = ownedProducts.map((p) => ({
    id: p.id,
    slug: p.slug,
    coverUrl: p.coverUrl,
  }));

  // Total unread for the page badge.
  const totalUnread = previews.reduce((sum, p) => sum + p.unreadCount, 0);

  return { previews, productOptions, totalUnread };
}
