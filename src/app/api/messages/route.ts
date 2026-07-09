import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getServerUser } from "@/lib/supabase/get-user";

/**
 * GET /api/messages?with=<userId>&productId=<productId>
 * Recupera la conversazione tra l'utente corrente e un altro utente,
 * opzionalmente filtrata per prodotto.
 */
export async function GET(request: NextRequest) {
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

    // Recupera messaggi tra i due utenti (entrambe le direzioni)
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

    return NextResponse.json({ messages });
  } catch (error) {
    console.error("GET /api/messages error:", error);
    return NextResponse.json({ error: "Errore interno" }, { status: 500 });
  }
}

/**
 * POST /api/messages
 * Invia un nuovo messaggio.
 * Body: { receiverId: string, content: string, productId?: string }
 */
export async function POST(request: NextRequest) {
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
    console.error("POST /api/messages error:", error);
    return NextResponse.json({ error: "Errore interno" }, { status: 500 });
  }
}
