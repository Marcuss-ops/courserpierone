import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getServerUser } from "@/lib/supabase/get-user";
import { withRateLimit } from "@/lib/utils/rate-limit";
import { sanitizeHtml } from "@/lib/utils/sanitize";
import { apiErrorResponse } from "@/lib/errors";
import { messageBroker, NEW_MESSAGE } from "@/lib/ws/broker";
import { sendDmNotificationEmail } from "@/lib/services/email";

/**
 * Trova o crea una conversazione tra due utenti LEGATA A UN PRODOTTO.
 * L'ordinamento degli ID è deterministico (sort lessicografico) per garantire
 * che l'unique constraint su [userOneId, userTwoId, productId] funzioni
 * correttamente a prescindere dall'ordine con cui vengono passati i due userId.
 *
 * Phase 1.3 del piano DMs: productId è OBBLIGATORIO — non esiste DM
 * generico tra due utenti se non in relazione a un prodotto acquistato.
 */
async function findOrCreateConversation(
  userId: string,
  otherUserId: string,
  productId: string,
) {
  const [minId, maxId] = [userId, otherUserId].sort();

  const existing = await prisma.conversation.findUnique({
    where: {
      userOneId_userTwoId_productId: {
        userOneId: minId,
        userTwoId: maxId,
        productId,
      },
    },
  });

  if (existing) return existing;

  return prisma.conversation.create({
    data: {
      userOneId: minId,
      userTwoId: maxId,
      productId,
    },
  });
}

/**
 * Cerca una conversazione esistente tra due utenti scope a un prodotto.
 * L'ordine (userOneId, userTwoId) può essere either way — risolviamo
 * con un OR pair.
 */
async function findConversation(
  userId: string,
  otherUserId: string,
  productId: string,
) {
  const [minId, maxId] = [userId, otherUserId].sort();

  return prisma.conversation.findFirst({
    where: {
      productId,
      OR: [
        { userOneId: minId, userTwoId: maxId },
        { userOneId: maxId, userTwoId: minId },
      ],
    },
  });
}

/**
 * GET /api/messages?with=<userId>&productId=<productId>&cursor=<id>&limit=50
 *
 * Cursor-based pagination per la conversazione tra due utenti, scoped a
 * un prodotto (Phase 1.3). productId è obbligatorio.
 *
 * - Senza cursor: restituisce i messaggi più recenti (prima pagina)
 * - Con cursor: restituisce i messaggi più vecchi del cursor
 * - Ordine: createdAt DESC (più recenti prima)
 * - Risposta: { messages, nextCursor }
 *   nextCursor = id del messaggio più vecchio nella pagina, o null se non ce ne sono altri
 *
 * CONTROLLO DI ACCESSO: verifica che la Conversation esista e appartenga
 * all'utente. Fase 1.5 aggiungerà il resolveMessagingPermission per il check
 * completo creator↔cliente↔prodotto.
 */
export const GET = withRateLimit(async function GET(request: NextRequest) {
  try {
    const { user, dbUser } = await getServerUser();
    if (!user?.email || !dbUser) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const withUserId = searchParams.get("with");
    const productId = searchParams.get("productId") || undefined;
    const cursor = searchParams.get("cursor") || undefined;
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10) || 50, 100);

    if (!withUserId) {
      return NextResponse.json({ error: "Parametro 'with' obbligatorio" }, { status: 400 });
    }

    if (!productId) {
      return NextResponse.json(
        { error: "Parametro 'productId' obbligatorio" },
        { status: 400 },
      );
    }

    if (withUserId === dbUser.id) {
      return NextResponse.json({ error: "Non puoi visualizzare una conversazione con te stesso" }, { status: 400 });
    }

    const otherUser = await prisma.user.findUnique({
      where: { id: withUserId },
      select: { id: true },
    });
    if (!otherUser) {
      return NextResponse.json({ error: "Utente non trovato" }, { status: 404 });
    }

    const conversation = await findConversation(dbUser.id, withUserId, productId);

    if (!conversation) {
      return NextResponse.json(
        { error: "Accesso negato — nessuna conversazione con questo utente su questo prodotto" },
        { status: 403 },
      );
    }

    // Cursor-based: fetch one extra to determine if there's a next page
    const messages = await prisma.message.findMany({
      where: {
        conversationId: conversation.id,
        ...(cursor ? { id: { lt: cursor } } : {}),
      },
      include: {
        sender: {
          select: { id: true, name: true, image: true, role: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
    });

    const hasMore = messages.length > limit;
    const page = hasMore ? messages.slice(0, limit) : messages;
    // nextCursor = ID of the oldest message in this page (to fetch the next older page)
    const nextCursor = hasMore ? page[page.length - 1].id : null;

    return NextResponse.json({ messages: page, nextCursor });
  } catch (error) {
    return apiErrorResponse(error, "Errore interno");
  }
}, "AUTH");

/**
 * POST /api/messages
 * Invia un nuovo messaggio.
 * Body: { receiverId: string, content: string, productId: string }
 *
 * productId è OBBLIGATORIO (Phase 1.3): ogni DM è scoped a un prodotto.
 * Trova o crea una Conversation tra sender e receiver, poi crea il Message.
 * Il senderId è sempre l'utente autenticato.
 *
 * NOTA: il controllo autorizzativo completo (creator/cliente/ordine
 * completed) arriverà dal resolveMessagingPermission (Fase 1.5).
 */
export const POST = withRateLimit(async function POST(request: NextRequest) {
  try {
    const { user, dbUser } = await getServerUser();
    if (!user?.email || !dbUser) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    const body = await request.json();
    const { receiverId, content, productId } = body;

    if (!receiverId || !content || typeof content !== "string" || content.trim().length === 0) {
      return NextResponse.json({ error: "receiverId, content e productId sono obbligatori" }, { status: 400 });
    }

    if (!productId || typeof productId !== "string") {
      return NextResponse.json({ error: "productId è obbligatorio" }, { status: 400 });
    }

    if (content.length > 5000) {
      return NextResponse.json({ error: "Il messaggio non può superare 5000 caratteri" }, { status: 400 });
    }

    // Impedisci auto-invio
    if (receiverId === dbUser.id) {
      return NextResponse.json({ error: "Non puoi inviare un messaggio a te stesso" }, { status: 400 });
    }

    // Verifica che il receiver esista
    const receiver = await prisma.user.findUnique({
      where: { id: receiverId },
      select: { id: true, email: true, lastSeenAt: true },
    });
    if (!receiver) {
      return NextResponse.json({ error: "Destinatario non trovato" }, { status: 404 });
    }

    // Verifica che il prodotto esista (FK cascade lo cattura, ma errore più chiaro)
    const productExists = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });
    if (!productExists) {
      return NextResponse.json({ error: "Prodotto non trovato" }, { status: 404 });
    }

    // Trova o crea la conversazione (ordinamento deterministico)
    const conversation = await findOrCreateConversation(dbUser.id, receiverId, productId);

    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderId: dbUser.id,
        content: sanitizeHtml(content.trim()),
      },
      include: {
        sender: {
          select: { id: true, name: true, image: true, role: true },
        },
      },
    });

    // Emit to WebSocket broker for real-time delivery to connected clients.
    // Phase 1.3: includiamo productId così il bridge WS può filtrare i
    // messaggi al solo participant della conversazione-prodotto (evita
    // data-leak cross-prodotto tra partecipanti diversi).
    messageBroker.emit(NEW_MESSAGE, {
      conversationId: conversation.id,
      productId,
      message: {
        ...message,
        createdAt: message.createdAt.toISOString(),
      },
    });

    // Send email notification if receiver appears offline.
    // Only send if lastSeenAt has been populated (WS server is tracking activity)
    // AND it was more than 5 minutes ago.
    const OFFLINE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
    const isOffline =
      receiver.lastSeenAt != null &&
      Date.now() - receiver.lastSeenAt.getTime() > OFFLINE_THRESHOLD_MS;

    if (isOffline && receiver.email) {
      // Cooldown: only send if receiver has ≤ 1 unread message in this conversation
      // (prevents email spam from rapid-fire messages)
      const unreadCount = await prisma.message.count({
        where: {
          conversationId: conversation.id,
          senderId: { not: receiver.id },
          read: false,
        },
      });

      if (unreadCount <= 1) {
        sendDmNotificationEmail(
          receiver.email,
          dbUser.name || dbUser.email?.split("@")[0] || "Uno studente",
          "en",
        ).catch((err) => console.error("[dm-email] Failed to send:", err));
      }
    }

    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, "Errore interno");
  }
}, "MESSAGES");
