import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getServerUser } from "@/lib/supabase/get-user";
import { withRateLimit } from "@/lib/utils/rate-limit";
import { apiErrorResponse } from "@/lib/errors";

/**
 * DELETE /api/conversations/[id]
 *
 * Phase 2.3 del piano DMs: hard-delete di una Conversation. Effetti:
 *   - La row Conversation viene eliminata.
 *   - CASCADE su `Message.conversationId` (definito in `prisma/schema.prisma`):
 *     TUTTI i messaggi associati vengono cancellati automaticamente
 *     dal DB in un colpo solo.
 *   - ~~Viene emesso un evento WS `threadDeleted` (via messageBroker)~~ →
 *     C3 cleanup: rimosso insieme a server.ts + src/lib/ws/*. Il partner
 *     che ha la conversation aperta la vede chiudersi alla prossima poll
 *     SSE (2s) oppure via navigation successiva. La eventuale
 *     inconsistenza UI temporanea (≤2s) è accettabile per V1 e accelera
 *     il cleanup.
 *   - 204 No Content: conferma canonica per idempotenza.
 *
 * Authorization (deliberatamente SEMPLIFICATA rispetto a
 * loadAuthorizedConversation):
 *   - Membership check inline: deve essere userOne O userTwo della
 *     Conversation. NO chiavi esterne verificano.
 *   - NON chiamiamo `authorizeDmRequest` qui. Perché: dopo un rimborso
 *     di Order che ha fatto scattare il deny del resolver, l'utente
 *     vorrebbe POTER chiudere il thread orfano per pulizia inbox.
 *     Bloccare la DELETE dietro al resolver vanificherebbe questo
 *     self-cleanup, lasciando row Conversation orfane visibili in
 *     inbox (= delta inutile dal POV utente). NB Fase 5 (DM plan):
 *     una V2 cleanup scheduler potrebbe CASCADE-pulire queste row
 *     automaticamente, ma per V1 è OK lasciarle.
 *
 * Idempotenza:
 *   - DELETE su row assente → 404 (sia per "mai esistita" sia per
 *     "già cancellata da una DELETE precedente"). La idempotenza è
 *     sull'end-state (row-non-più-presenti), non sul response code.
 *     Un DELETE successivo che ritorna 404 è informativo: la row non
 *     c'è, il client può assumere "thread chiuso". Per ottenere
 *     true HTTP-204-idempotency servirebbe un tombstone logico
 *     (soft-delete), ma la Fase 2.3 ha optato per hard-delete.
 *
 * Rate limit: tier "MESSAGES" (10 req/min). La DELETE è "uncommon"
 *    (utente chiude il thread occasionalmente), non serve alto
 *    throughput. Tier AUTH (30/min) sarebbe troppo permissivo.
 *    Implementato via `withRateLimit(handler, "MESSAGES")` wrapper.
 *
 * Self-skip e membership error semantics:
 *   - 404 (e NON 403) per "Conversation esistente ma io non sono
 *     partecipante". Per info-leak mitigation: un attacker NON deve
 *     poter distinguere "row-inesistente" da "row-altrui", altrimenti
 *     potrebbe enumerare Conversation ID di altri utenti. Il 404
 *     collassa i due casi (= no info leak). Differente dalla
 *     semantica di `loadAuthorizedConversation` (che lancia 403
 *     NOT_CONVERSATION_MEMBER), giustificato dal fatto che DELETE è
 *     un'azione DISTRUTTIVA info-leak-sensibile, mentre loadAuthorized
 *     è lettura difensiva.
 *   - 401 anon (no session).
 */
export const DELETE = withRateLimit(
  async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
  ) {
    try {
      // ── 1. Auth (anon → 401) ────────────────────────────────
      const { user, dbUser } = await getServerUser();
      if (!user?.email || !dbUser) {
        return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
      }

      const { id: conversationId } = await params;
      if (!conversationId || typeof conversationId !== "string") {
        return NextResponse.json(
          { error: "Id conversazione obbligatorio" },
          { status: 400 },
        );
      }

      // ── 2. Membership-only lookup (no authorizeDmRequest) ───
      // NB: predicate inline `OR: [{userOneId=me}, {userTwoId=me}]` —
      // Filename diverso da `loadAuthorizedConversation` perché
      // DELIBERATAMENTE skippa il sanity check su authorizeDmRequest
      // (vedi JSDoc sopra). Restituiamo null per entrambi i casi
      // "non esiste" e "non sono partecipante" → 404 senza info leak.
      const conversation = await prisma.conversation.findFirst({
        where: {
          id: conversationId,
          OR: [{ userOneId: dbUser.id }, { userTwoId: dbUser.id }],
        },
        select: {
          id: true,
          userOneId: true,
          userTwoId: true,
          productId: true,
        },
      });

      if (!conversation) {
        // 404 collapses "not found" + "not a member" → no info leak
        // su Conversation ID altrui. Vedi JSDoc sopra.
        return NextResponse.json(
          { error: "Conversazione non trovata" },
          { status: 404 },
        );
      }

      // ── 3. Hard-delete (FK CASCADE → tutti i Message) ───────
      // `prisma.conversation.delete` esegue una singola DELETE row;
      // Postgres CASCADE prende tutte le Message associate. Una sola
      // round-trip al DB. NB: NON 'soft-delete' (Phase 2.3 design choice
      // → hard-delete). Vedi JSDoc top-of-file per la rationale.
      await prisma.conversation.delete({
        where: { id: conversation.id },
      });

      // ── 4. ~WS broadcast (entrambi i partecipanti)~ — C3 removed ──
      // Pre-C3: messageBroker.emit(THREAD_DELETED, {...}) chiamava il
      // bridge WS in server.ts che fan-out a subscribedConversations
      // + inboxClients[userOneId/userTwoId]. C3 cleanup ha rimosso
      // l'intera infrastruttura WS; il partner vede la chiusura alla
      // prossima SSE-poll (≤2s) o via navigation successiva.

      // ── 5. 204 No Content (success canonico) ─────────────────
      return new NextResponse(null, { status: 204 });
    } catch (error) {
      return apiErrorResponse(error, "Errore interno");
    }
  },
  "MESSAGES",
);
