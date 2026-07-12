import { Suspense } from "react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { getServerUser } from "@/lib/supabase/get-user";
import { CreatorInbox } from "./creator-inbox";
import { InboxProvider } from "@/components/layout/inbox-provider";

/** Max chars per last-message preview. */
const PREVIEW_MAX = 80;

/**
 * Conversation preview shape for the creator-side inbox.
 * Mirrors `/dashboard/messages/page.tsx` ConversationPreview (single source of
 * truth should be consolidated in Fase 3.3+) with the addition of
 * `productCoverUrl` so the row can show the product thumb.
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

interface PageProps {
  searchParams: Promise<{ c?: string }>;
}

/**
 * /dashboard/creator/messages
 *
 * Fase 3.2 del piano DMs: inbox two-column view dedicato al lato creator.
 * - Left: lista conversationi dei prodotti venduti dal creator (o tutte per admin).
 * - Right: chat view inline (no redirect a /dashboard/messages/[userId]).
 *
 * Filtri supportati lato client:
 * - search per nome cliente (debounced)
 * - product dropdown (scope per prodotto)
 * - unread-only toggle
 *
 * Selection: `?c=<conversationId>` seleziona la conversation mostrata nel
 * right column. URL state per deep-linking.
 *
 * Role gating: solo `creator` o `admin`. Per altri ruoli redirect
 * alla inbox standard /dashboard/messages.
 */
export default async function CreatorMessagesPage({ searchParams }: PageProps) {
  const { user, dbUser } = await getServerUser();
  if (!user?.email || !dbUser) {
    redirect("/login");
  }

  if (dbUser.role !== "creator" && dbUser.role !== "admin") {
    // Studenti e altri ruoli non hanno accesso all'inbox creator-only.
    redirect("/dashboard/messages");
  }

  const { c: rawSelectedConversationId } = await searchParams;

  // ── Scope prodotti: i prodotti di cui l'utente è creator ──
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

  // ── Fetch conversationi sui prodotti owned ─────────────
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

  // ── Batch unread counts via groupBy ─────────────────────
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

  // ── Costruisci preview shape ────────────────────────────
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
  const productOptions = ownedProducts.map((p) => ({
    id: p.id,
    slug: p.slug,
    coverUrl: p.coverUrl,
  }));

  // Total unread for the page badge.
  const totalUnread = previews.reduce((sum, p) => sum + p.unreadCount, 0);

  // Security/UX: validate `c` server-side against THIS user's previews.
  // Without this guard, an attacker could probe arbitrary conversationIds
  // via `?c=GHOST_ID` → ChatView's fetch would silently 403. Normalizing
  // to null here gives a graceful "Seleziona una conversazione" empty
  // state instead of a confusing silent fail.
  const selectedConversationId =
    rawSelectedConversationId &&
    previews.some((p) => p.id === rawSelectedConversationId)
      ? rawSelectedConversationId
      : null;

  return (
    <InboxProvider
      initialTotalUnread={totalUnread}
      initialByConversation={Object.fromEntries(
        previews.map((p) => [p.id, p.unreadCount]),
      )}
    >
    <Suspense fallback={null}>
      <CreatorInbox
        previews={previews}
        productOptions={productOptions}
        initialSelectedConversationId={selectedConversationId}
        currentUserId={dbUser.id}
        currentUserName={
          dbUser.name || dbUser.email?.split("@")[0] || "Creator"
        }
        role={dbUser.role}
        totalUnread={totalUnread}
      />
    </Suspense>
    </InboxProvider>
  );
}
