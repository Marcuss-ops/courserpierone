import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getServerUser } from "@/lib/supabase/get-user";
import { withRateLimit } from "@/lib/utils/rate-limit";
import { apiErrorResponse } from "@/lib/errors";

/**
 * GET /api/conversations
 *
 * Lista le conversazioni a cui l'utente loggato partecipa. Per ogni
 * conversation restituisce:
 *   - id
 *   - product { id, slug }
 *   - otherUser { id, name, image, role } (il partner, non me stesso)
 *   - lastMessage { id, content, createdAt, senderId, read } (preview
 *     troncata a 80 caratteri) oppure null (mai scambiato ancora)
 *   - unreadCount (messaggi non letti ricevuti, non propri)
 *
 * Ordinamento: più recente per updatedAt (la conversation con l'ultimo
 * messaggio scambiato viene prima).
 *
 * Auth (lista-only path): la query filtra solo le conversation dove
 * l'utente loggato è userOne o userTwo. NON chiamiamo
 * authorizeDmRequest qui: la Conversation row è nata da un POST che ha
 * già passato il resolver (Fase 1.6 single-source-of-truth), quindi
 * rivalidare la policy creator↔studente↔prodotto per ogni row
 * sarebbe N round-trip al DB inutili. La WHERE clause Prisma
 * `userOne/userTwo = me` è già la garanzia autorizzativa per V1.
 *
 * Fase 4.x: se si vuole revalidare su Order completions live (es.
 * admin revoca, customer refund in-flight), aggiungere un pre-check
 * batch `Order.status='completed'` per prodotto. Vedi Fase 5 del
 * piano DMs per i casi di revoca retroattiva.
 *
 * Performance: una sola query per le conversation + una groupBy batch
 * per gli unread. Nessun N+1 sui message.
 *
 * Rate limit: tier AUTH (30 req/min). Sufficienti per inbox polllati
 * (focus tab, scroll refresh). Per polling più aggressivi servirà un
 * tier AUTH_RO dedicato (follow-up FASE 4). Non usare MESSAGES (10/min)
 * perché troppo stretto per una lista read-only.
 *
 * Performance: Conversation ha già @@index([userOneId, updatedAt]) e
 * @@index([userTwoId, updatedAt]) nello schema Prisma — la WHERE OR +
 * ORDER BY updatedAt è coperta dai composite indexes (Postgres fa
 * bitmap OR-merge tra i due). Nessuna migration necessaria.
 */

const PREVIEW_MAX = 80;

export interface ConversationListItem {
  id: string;
  product: { id: string; slug: string };
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

export const GET = withRateLimit(async function GET() {
  try {
    const { user, dbUser } = await getServerUser();
    if (!user?.email || !dbUser) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    const conversations = await prisma.conversation.findMany({
      where: {
        OR: [{ userOneId: dbUser.id }, { userTwoId: dbUser.id }],
      },
      include: {
        userOne: { select: { id: true, name: true, image: true, role: true } },
        userTwo: { select: { id: true, name: true, image: true, role: true } },
        product: { select: { id: true, slug: true } },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { id: true, content: true, createdAt: true, senderId: true, read: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    // Batch unread counts via groupBy: una sola query aggregata invece
    // di N query per-riga. Esclude i messaggi del sender (l'utente non
    // conta i propri messaggi come "non letti").
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

    const items: ConversationListItem[] = conversations.flatMap((c) => {
      // Defensive guard: se una join è null a runtime (es. User cancellato
      // durante un tx, race con soft-delete) saltiamo la row silenziosamente
      // e logghiamo un warn per osservabilità. Mai pushare `{id:null,…}` al
      // client: peggiorerebbe l'UX dell'inbox.
      if (!c.userOne || !c.userTwo || !c.product) {
        console.warn(
          `[api/conversations] Skipping malformed conversation row id=${c.id} ` +
            `(missing userOne/userTwo/product). Data integrity issue.`
        );
        return [];
      }

      const otherUser = c.userOneId === dbUser.id ? c.userTwo : c.userOne;
      const lastMessageRaw = c.messages[0] ?? null;

      return [{
        id: c.id,
        // Product.slug è NOT NULL per schema (vedi riga `slug String @unique`).
        product: { id: c.product.id, slug: c.product.slug },
        otherUser,
        lastMessage: lastMessageRaw
          ? {
              id: lastMessageRaw.id,
              content:
                lastMessageRaw.content.length > PREVIEW_MAX
                  ? lastMessageRaw.content.slice(0, PREVIEW_MAX) + "…"
                  : lastMessageRaw.content,
              createdAt: lastMessageRaw.createdAt.toISOString(),
              senderId: lastMessageRaw.senderId,
              read: lastMessageRaw.read,
            }
          : null,
        unreadCount: unreadMap.get(c.id) ?? 0,
      }];
    });

    return NextResponse.json({ conversations: items });
  } catch (error) {
    return apiErrorResponse(error, "Errore interno");
  }
}, "AUTH");
