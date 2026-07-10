import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getServerUser } from "@/lib/supabase/get-user";
import { withRateLimit } from "@/lib/utils/rate-limit";
import { sanitizeHtml } from "@/lib/utils/sanitize";
import { apiErrorResponse } from "@/lib/errors";
import { messageBroker, NEW_MESSAGE } from "@/lib/ws/broker";
import { sendDmNotificationEmail } from "@/lib/services/email";

/**
 * Trova o crea una conversazione tra due utenti.
 * L'ordinamento degli ID è deterministico (sort lessicografico) per garantire
 * che l'unique constraint su [userOneId, userTwoId] funzioni correttamente.
 */
async function findOrCreateConversation(
  userId: string,
  otherUserId: string,
  productId?: string,
) {
  const [minId, maxId] = [userId, otherUserId].sort();

  const existing = await prisma.conversation.findUnique({
    where: {
      userOneId_userTwoId: { userOneId: minId, userTwoId: maxId },
    },
  });

  if (existing) return existing;

  return prisma.conversation.create({
    data: {
      userOneId: minId,
      userTwoId: maxId,
      productId: productId || null,
    },
  });
}

/**
 * Cerca una conversazione esistente tra due utenti.
 */
async function findConversation(
  userId: string,
  otherUserId: string,
  productId?: string,
) {
  const [minId, maxId] = [userId, otherUserId].sort();

  return prisma.conversation.findFirst({
    where: {
      OR: [
        { userOneId: minId, userTwoId: maxId },
        { userOneId: maxId, userTwoId: minId },
      ],
      ...(productId ? { productId } : {}),
    },
  });
}

/**
 * GET /api/messages?with=<userId>&productId=<productId>&cursor=<id>&limit=50
 *
 * Cursor-based pagination per la conversazione tra due utenti.
 *
 * - Senza cursor: restituisce i messaggi più recenti (prima pagina)
 * - Con cursor: restituisce i messaggi più vecchi del cursor
 * - Ordine: createdAt DESC (più recenti prima)
 * - Risposta: { messages, nextCursor }
 *   nextCursor = id del messaggio più vecchio nella pagina, o null se non ce ne sono altri
 *
 * CONTROLLO DI ACCESSO: verifica che la Conversation esista e appartenga all'utente.
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
        { error: "Accesso negato — nessuna conversazione con questo utente" },
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
 * Body: { receiverId: string, content: string, productId?: string }
 *
 * Trova o crea una Conversation tra sender e receiver, poi crea il Message.
 * Il senderId è sempre l'utente autenticato.
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
      return NextResponse.json({ error: "receiverId e content sono obbligatori" }, { status: 400 });
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

    // Emit to WebSocket broker for real-time delivery to connected clients
    messageBroker.emit(NEW_MESSAGE, {
      conversationId: conversation.id,
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
