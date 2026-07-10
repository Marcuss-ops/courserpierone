import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getServerUser } from "@/lib/supabase/get-user";
import { apiErrorResponse } from "@/lib/errors";

/**
 * PATCH /api/messages/read
 * Segna come letti tutti i messaggi in una conversazione specifica.
 * Body: { conversationId: string }
 */
export async function PATCH(request: NextRequest) {
  try {
    const { user, dbUser } = await getServerUser();
    if (!user?.email || !dbUser) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    const body = await request.json();
    const { conversationId } = body;

    if (!conversationId) {
      return NextResponse.json({ error: "conversationId obbligatorio" }, { status: 400 });
    }

    // Verifica che la conversazione appartenga all'utente (accesso controllato)
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        OR: [
          { userOneId: dbUser.id },
          { userTwoId: dbUser.id },
        ],
      },
      select: { id: true },
    });

    if (!conversation) {
      return NextResponse.json({ error: "Conversazione non trovata o accesso negato" }, { status: 403 });
    }

    const result = await prisma.message.updateMany({
      where: {
        conversationId,
        senderId: { not: dbUser.id }, // non segnare come letti i propri messaggi
        read: false,
      },
      data: { read: true },
    });

    return NextResponse.json({ success: true, count: result.count });
  } catch (error) {
    return apiErrorResponse(error, "Errore interno");
  }
}
