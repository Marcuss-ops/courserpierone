import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getServerUser } from "@/lib/supabase/get-user";
import { withRateLimit } from "@/lib/utils/rate-limit";
import { sanitizeHtml } from "@/lib/utils/sanitize";
import { apiErrorResponse } from "@/lib/errors";

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
 * GET /api/messages?with=<userId>&productId=<productId>
 *
 * Recupera la conversazione tra l'utente corrente e un altro utente,
 * opzionalmente filtrata per prodotto.
 *
 * CONTROLLO DI ACCESSO: cerca la Conversation tra i due utenti.
 * Se non esiste, restituisce 403 (nessuna conversazione autorizzata).
 * Se esiste, recupera i messaggi filtrati per conversationId.
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

    if (!withUserId) {
      return NextResponse.json({ error: "Parametro 'with' obbligatorio" }, { status: 400 });
    }

    // Impedisci a un utente di interrogare i propri messaggi
    if (withUserId === dbUser.id) {
      return NextResponse.json({ error: "Non puoi visualizzare una conversazione con te stesso" }, { status: 400 });
    }

    // Verifica che l'utente destinatario esista
    const otherUser = await prisma.user.findUnique({
      where: { id: withUserId },
      select: { id: true },
    });
    if (!otherUser) {
      return NextResponse.json({ error: "Utente non trovato" }, { status: 404 });
    }

    // Cerca la conversazione tra i due utenti
    const conversation = await findConversation(dbUser.id, withUserId, productId);

    if (!conversation) {
      return NextResponse.json(
        { error: "Accesso negato — nessuna conversazione con questo utente" },
        { status: 403 },
      );
    }

    // Recupera messaggi della conversazione
    const messages = await prisma.message.findMany({
      where: { conversationId: conversation.id },
      include: {
        sender: {
          select: { id: true, name: true, image: true, role: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ messages });
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
    const receiver = await prisma.user.findUnique({ where: { id: receiverId } });
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

    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, "Errore interno");
  }
}, "MESSAGES");
