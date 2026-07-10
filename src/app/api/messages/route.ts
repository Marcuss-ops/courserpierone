import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getServerUser } from "@/lib/supabase/get-user";
import { withRateLimit } from "@/lib/utils/rate-limit";
import { apiErrorResponse } from "@/lib/errors";

/**
 * GET /api/messages?with=<userId>&productId=<productId>
 *
 * Recupera la conversazione tra l'utente corrente e un altro utente,
 * opzionalmente filtrata per prodotto.
 *
 * CONTROLLO DI ACCESSO: la clausola WHERE limita i risultati ai soli
 * messaggi in cui l'utente autenticato è sender o receiver.
 * Se un utente malintenzionato modifica il parametro `with`, vedrà
 * solo messaggi propri con quell'utente (array vuoto se non ci sono).
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

    // Impedisci a un utente di interrogare i propri messaggi (senza senso)
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

    // Recupera messaggi tra i due utenti (entrambe le direzioni).
    // Il WHERE garantisce isolamento: l'utente vede SOLO i propri messaggi.
    const messages = await prisma.message.findMany({
      where: {
        OR: [
          { senderId: dbUser.id, receiverId: withUserId },
          { senderId: withUserId, receiverId: dbUser.id },
        ],
        ...(productId ? { productId } : {}),
      },
      include: {
        sender: {
          select: { id: true, name: true, image: true, role: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    // CONTROLLO DI ACCESSO ESPLICITO: se non ci sono messaggi tra i due
    // utenti, l'utente corrente non è autorizzato a visualizzare questa
    // conversazione (non esiste). Ritorna 403 per evitare information
    // leakage (200 [] rivelerebbe che l'utente esiste).
    if (messages.length === 0) {
      return NextResponse.json(
        { error: "Accesso negato — nessuna conversazione con questo utente" },
        { status: 403 },
      );
    }

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
 * CONTROLLO DI ACCESSO: il senderId è sempre l'utente autenticato.
 * Impedisce auto-invio (senderId === receiverId).
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

    const message = await prisma.message.create({
      data: {
        senderId: dbUser.id,
        receiverId,
        productId: productId || null,
        content: content.trim(),
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
