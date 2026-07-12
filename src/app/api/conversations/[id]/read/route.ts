import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getServerUser } from "@/lib/supabase/get-user";
import { apiErrorResponse } from "@/lib/errors";
import { loadAuthorizedConversation } from "@/lib/messaging/load-authorized-conversation";

/**
 * PATCH /api/conversations/[id]/read
 *
 * Fase 2.3 del piano DMs: idempotente mark-as-read keyato su
 * `Conversation.id` (URL path segment). NON richiede body — il
 * conversationId è canonico nel URL.
 *
 * Differenze rispetto a legacy /api/messages/read PATCH (Fase 1.6):
 *   - URL-restyled: niente più `{ conversationId }` nel body.
 *   - Pipeline identica internamente (loadAuthorizedConversation +
 *     message.updateMany with sender != me filter).
 *
 * Side effects:
 *   - Aggiorna `read: true` su tutti i Message della conversation
 *     il cui sender NON è me (i propri messaggi non si auto-marcano
 *     read, semantica di "ricevuto").
 *   - NON emette alcun evento WS: il browser già sa di aver marcato
 *     read localmente (o via SSE/poll che arrivano). Un inboxUpdate
 *     con badge=0 verrà eventualmente emesso dal client quando
 *     la prossima inbox WS poll/WS message arriva.
 *
 * Idempotente: chiamate ripetute ritornano sempre 200 con count aggiornato.
 *
 * Rate limit: non wrappato da withRateLimit (PATCH idempotente, alta freq
 * consentita per focus tab / chat visibility change). Vedi Fase 4.x.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user, dbUser } = await getServerUser();
    if (!user?.email || !dbUser) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    const { id: conversationId } = await params;

    // ── Pipeline canonica (helper Fase 2.3) ────────────────────
    const { conversation } = await loadAuthorizedConversation(
      dbUser.id,
      conversationId,
    );

    // ── Mark messages read (sender != self filter) ───────────
    // updateMany è O(1) batch (NO loop per-message): un singolo SQL
    // statement eseguito in un round-trip.
    const result = await prisma.message.updateMany({
      where: {
        conversationId: conversation.id,
        senderId: { not: dbUser.id }, // NON marcare i propri messaggi
        read: false,
      },
      data: { read: true },
    });

    return NextResponse.json({ success: true, count: result.count });
  } catch (error) {
    return apiErrorResponse(error, "Errore interno");
  }
}
