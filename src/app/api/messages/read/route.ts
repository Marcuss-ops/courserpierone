import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getServerUser } from "@/lib/supabase/get-user";
import { apiErrorResponse } from "@/lib/errors";
import { authorizeDmRequest } from "@/lib/messaging/api-authorize";

/**
 * PATCH /api/messages/read
 * Segna come letti tutti i messaggi in una conversazione specifica.
 * Body: { conversationId: string }
 *
 * Phase 1.6: il check autorizzativo passa da authorizeDmRequest →
 * resolveMessagingPermission. La route ricava productId e l'altro
 * partecipante dalla Conversation stessa, poi delega la decisione
 * al resolver (single source of truth).
 *
 * Ordine dei check:
 *   1) lookup Conversation (membership precheck) ─→ 403 se user non
 *      è partecipante (qui short-circuit per evitare DB hits sul
 *      resolver per non-membri).
 *   2) derivation di productId + partnerId dal row trovato.
 *   3) authorizeDmRequest (l'unica fonte di verità per le regole
 *      creator↔studente↔prodotto).
 *   4) updateMany per marcare i messaggi come letti.
 *
 * Lo step 1 ritorna 403 (e non 404) per evitare info-leak sulla
 * esistenza di conversation IDs: un attaccante che prova ID random
 * non distingue "non esiste" da "non autorizzato".
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

    // Recupera la conversazione per ricavare productId e partner.
    // Include un guard preliminare: solo i partecipanti possono leggere.
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        OR: [
          { userOneId: dbUser.id },
          { userTwoId: dbUser.id },
        ],
      },
      select: { id: true, userOneId: true, userTwoId: true, productId: true },
    });

    if (!conversation) {
      return NextResponse.json(
        { error: "Conversazione non trovata o accesso negato" },
        { status: 403 },
      );
    }

    const partnerId =
      conversation.userOneId === dbUser.id
        ? conversation.userTwoId
        : conversation.userOneId;

    // ── Permission check (Phase 1.6 single source of truth) ─────
    const auth = await authorizeDmRequest({
      actorId: dbUser.id,
      targetId: partnerId,
      productId: conversation.productId,
    });
    if (!auth.allowed) {
      return auth.response;
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
