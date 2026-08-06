import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getServerUser } from "@/lib/supabase/get-user";
import { authorizeDmRequest } from "@/lib/messaging/api-authorize";
import { getPartnerId } from "@/domains/messaging";

// Hoisted constants — single allocation lifetime per process. Avoids
// re-allocating a fresh TextEncoder + UInt8Array on every per-tick
// heartbeat encode. Multiplied by N open SSE connections × 4
// heartbeats/min, this is meaningful GC pressure reduction on the
// Vercel Edge runtime.
const encoder = new TextEncoder();
const HEARTBEAT_BYTES = encoder.encode(": heartbeat\n\n");

/**
 * GET /api/conversations/[id]/stream?since=<ISO timestamp>
 *
 * Canonical SSE (Server-Sent Events) endpoint, Fase 4.x del piano DMs.
 * Status: L'UNICA route SSE per-conversation canonica. La versione legacy
 * `/api/messages/stream?conversationId=…` è stata rimossa in commit
 * `chore(dm): delete legacy /api/messages routes + shim`. Tutto il path
 * è keyato sulla Conversation.id (URL path segment), non più su una
 * coppia (otherUserId, productId) o su un query param.
 *
 * Differenze rispetto a `/api/messages/stream/route.ts`:
 *   - `conversationId` viene dall'`URL path params` (Next.js dynamic
 *     route `[id]`). Niente più `?conversationId=…` query.
 *   - Subscription puramente canonical: l'SSE è già aperto sopra
 *     una row Conversation nota, garantita dal read-side guard
 *     upstream (`loadAuthorizedConversation`).
 *
 * Membership + permission semantics:
 *   - Membership precheck fast-fail: l'utente DEVE essere userOneId
 *     o userTwoId della Conversation (403 immediato se non lo è).
 *   - authorizeDmRequest completa la validazione: delega al resolver
 *     (Fase 1.6 single source of truth) la verifica su Order.completed
 *     e Product.creatorId. Restituisce deny mapping 400/403/404/409.
 *
 * Wire contract:
 *   - Output: `text/event-stream`
 *   - Heartbeat: `: heartbeat\n\n` ogni 15s
 *   - Poll loop: 500ms di delay iniziale → 2s successivi
 *   - SSE message: `data: ${JSON.stringify({messages})}\n\n` con batch
 *     ascendente ordinato per `createdAt`
 *   - `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`,
 *     `X-Accel-Buffering: no` (Vercel/NGINX friendly).
 *
 * Status: SOSTITUISCE `/api/messages/stream` (legacy rimosso — vedi commit
 * titolo sopra). Originariamente coesistente durante la finestra di
 * migrazione client; ora è l'unica route SSE canonica. Per i client che
 * ancora aprono SSE col vecchio URL: il fallback graceful diventa un
 * 404 esplicito, non un silent misroute.
 *
 * Rate limit: NON wrappato da withRateLimit qui. SSE è long-lived e
 * il tier "MESSAGES" (10/min) sarebbe troppo stretto per una
 * connessione che resta aperta minuti-ore. Il rate-limit si applica
 * alle REST POST, non all'SSE passivo. NB: pre-C3 esisteva anche un
 * rate-limit sul WS upgrade handler in server.ts (ormai rimosso).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, dbUser } = await getServerUser();
  if (!user?.email || !dbUser) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id: conversationIdParam } = await params;
  if (!conversationIdParam || typeof conversationIdParam !== "string") {
    return new Response("Missing 'id' path param (canonical Fase 4.x)", {
      status: 400,
    });
  }
  // Narrowed local: la guard qui sopra esclude null/non-string, ma la
  // closure ReadableStream.start() cattura la const nello scope
  // esterno. TS non porta automaticamente la narrowing dentro arrow
  // function annidate, quindi riassegnamo a `conversationId: string`
  // (non-null) qui.
  const conversationId: string = conversationIdParam;

  const { searchParams } = new URL(request.url);
  const sinceRaw = searchParams.get("since");

  // ── Membership + productId lookup (Fase 4.1 + Fase 2.0 wire) ────
  // Selezioniamo `productId` qui perché il resolver richiede la tripla
  // (actorId, targetId, productId) come input canonico. Aggiungere il
  // productId nella select evita un secondo `prisma.product.findUnique`
  // dentro authorizeDmRequest → 1 round-trip in meno per stream/upgrade.
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { userOneId: true, userTwoId: true, productId: true },
  });

  if (!conversation) {
    return new Response("Conversation not found", { status: 404 });
  }

  // Membership precheck (defense-in-depth, fast-fail prima del resolver).
  // Se l'ID non appartiene al viewer, 403 immediato senza ulteriori DB hit.
  if (
    conversation.userOneId !== dbUser.id &&
    conversation.userTwoId !== dbUser.id
  ) {
    return new Response("Forbidden", { status: 403 });
  }

  // ── Permission check (Fase 2.0 wire, single source of truth) ─────
  // Deriva (targetId, productId) dalla row Conversation e delega al
  // resolver via authorizeDmRequest. Recupera anche lo status code
  // corretto dal deny mapping di api-authorize (400 SelfMessage,
  // 404 ProductNotFound, 403 NotCreatorStudentPair, 403 NoCompletedOrderForStudent)
  // per propagarlo in avanti senza reimplementare la matrice.
  //
  // Phase 2.0 V2: usa `getPartnerId` helper per DRY (la stessa logica
  // ~~lives in server.ts al WS upgrade handler~~ — pre-C3 era in due
  // posti, ora vive solo qui dopo la rimozione del bridge WS).
  const targetId = getPartnerId(conversation, dbUser.id);

  const auth = await authorizeDmRequest({
    actorId: dbUser.id,
    targetId,
    productId: conversation.productId,
  });
  if (!auth.allowed) {
    // Restituiamo lo status code dal NextResponse del resolver
    // (rango 400/403/404/409) come `Response` plain text. L'SSE non
    // parte: il client vede il reject immediato.
    //
    // Phase 2.0 V2: rimuoviamo il leak del `reason` interno (es.
    // "no_completed_order_for_student"). Il reason è fingerprinting-
    // prone e non deve mai uscire dal boundary API. Il client può
    // discriminare 403 vs 404 vs 409 dallo status code, ma le
    // stringhe interne sono mapping-only.
    const denyText =
      auth.response.status === 404
        ? "Not found"
        : auth.response.status === 409
          ? "Conflict"
          : "Forbidden";
    return new Response(denyText, { status: auth.response.status });
  }

  // NB: la versione legacy `/api/messages/stream` accettava qualsiasi
  // stringa come `since` (anche invalida → silently degraded a "from
  // dawn of time"). Questo handler canonico rifiuta esplicitamente
  // timestamp invalidi con 400 per prevenire diagnostica ambigua
  // lato client in caso di bug a monte (es. `since="undefined"` da
  // una Date malformata). Divergenza difensiva, non scope creep.
  const since = sinceRaw ? new Date(sinceRaw) : new Date(0);
  if (Number.isNaN(since.getTime())) {
    return new Response("Invalid 'since' timestamp", { status: 400 });
  }

  let stopped = false;

  const stream = new ReadableStream({
    start(controller) {
      let lastSeen = since;
      // Hoisted `where` object — mutated in-place each tick so the
      // shape stays cached and Prisma receives only the updated
      // timestamp. Avoids 1 object-literal allocation per 2s tick.
      // Step 9 code-reviewer nit-1: type annotation OMITTED so TS
      // infers Prisma's `MessageWhereInput` structural shape at the
      // findMany call site (over-specifying would drift on Prisma
      // upgrades — narrowing was brittle).
      const findManyWhere = {
        conversationId,
        createdAt: { gt: lastSeen },
      };

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(HEARTBEAT_BYTES);
        } catch {
          clearInterval(heartbeat);
          stopped = true;
        }
      }, 15_000);

      async function poll(): Promise<void> {
        if (stopped) return;

        try {
          const newMessages = await prisma.message.findMany({
            where: findManyWhere,
            include: {
              sender: {
                select: { id: true, name: true, image: true, role: true },
              },
            },
            orderBy: { createdAt: "asc" },
            take: 50,
          });

          if (newMessages.length > 0) {
            const lastMsg = newMessages[newMessages.length - 1];
            lastSeen = lastMsg.createdAt;
            // Mutate the cached where.createdAt.gt rather than
            // re-allocating the literal each tick.
            findManyWhere.createdAt.gt = lastSeen;

            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ messages: newMessages })}\n\n`,
              ),
            );
          }
        } catch (err) {
          // Defer the error log to the next macrotask so a synchronous
          // console.error doesn't block the SSE poll loop on an
          // unrelated tick. The error is observation-only — no I/O
          // fan-out, just dev/prod visibility.
          setTimeout(() => console.error("[sse] poll error:", err), 0);
        }

        if (!stopped) {
          setTimeout(poll, 2_000);
        }
      }

      setTimeout(poll, 500);

      request.signal.addEventListener("abort", () => {
        stopped = true;
        clearInterval(heartbeat);
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
