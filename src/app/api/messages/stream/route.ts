import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getServerUser } from "@/lib/supabase/get-user";
import { authorizeDmRequest } from "@/lib/messaging/api-authorize";

/**
 * GET /api/messages/stream?conversationId=<id>&since=<ISO timestamp>
 *
 * SSE (Server-Sent Events) endpoint per ricevere nuovi messaggi in
 * tempo reale con subscription per-conversation (Fase 4.1).
 *
 * Cambiamenti rispetto a Fase 1.3 / Fase 1.6:
 *   - Niente più `withUserId` o `productId` come query param.
 *   - Membership check diretta via `prisma.conversation.findUnique`
 *     (l'utente DEVE essere userOneId O userTwoId della Conversation).
 *
 * Fase 2.0 (wire): tutti i 403/404 del check autorizzativo fluiscono
 * da `resolveMessagingPermission` (via wrapper `authorizeDmRequest`)
 * per garantire single-source-of-truth. La membership precheck rimane
 * come fast-fail inline (evita 1 round-trip al resolver quando l'ID
 * della conversation non appartiene al viewer); il resolver successivo
 * re-valida con la coppia (me, partner, productId) canonica.
 *
 * Niente più loop di "aspetta che la Conversation venga creata":
 * il conversationId è già nel path, si sa subito se esiste.
 */
export async function GET(request: NextRequest) {
  const { user, dbUser } = await getServerUser();
  if (!user?.email || !dbUser) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const conversationIdParam = searchParams.get("conversationId");
  const sinceRaw = searchParams.get("since");

  if (!conversationIdParam) {
    return new Response("Missing 'conversationId' parameter (Fase 4.1)", {
      status: 400,
    });
  }

  // Narrowed local: il controllo sopra esclude il null, ma la closure
  // ReadableStream.start() cattura la const nello scope esterno. TS non
  // porta automaticamente la narrowing dentro arrow function annidate,
  // quindi riassegnamo a `conversationId: string` (non-null) qui.
  const conversationId: string = conversationIdParam;

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
  // corretto dal deny mapping di api-authorize (404 ProductNotFound,
  // 403 NoCompletedOrderForStudent, 409 NoCreatorForProduct, ecc.)
  // per propagarlo in avanti senza reimplementare la matrice.
  const targetId =
    conversation.userOneId === dbUser.id
      ? conversation.userTwoId
      : conversation.userOneId;

  const auth = await authorizeDmRequest({
    actorId: dbUser.id,
    targetId,
    productId: conversation.productId,
  });
  if (!auth.allowed) {
    // Restituiamo lo status code dal NextResponse del resolver
    // (rango 400/403/404/409) come `Response` plain text. L'SSE non
    // parte: il client vede il reject immediato.
    return new Response(
      `Forbidden (Fase 2.0 resolver: ${auth.permission.reason ?? "DM_DENIED"})`,
      { status: auth.response.status },
    );
  }

  const since = sinceRaw ? new Date(sinceRaw) : new Date(0);

  const encoder = new TextEncoder();
  let stopped = false;

  const stream = new ReadableStream({
    start(controller) {
      let lastSeen = since;

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          clearInterval(heartbeat);
          stopped = true;
        }
      }, 15_000);

      async function poll(): Promise<void> {
        if (stopped) return;

        try {
          const newMessages = await prisma.message.findMany({
            where: {
              conversationId,
              createdAt: { gt: lastSeen },
            },
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

            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ messages: newMessages })}\n\n`,
              ),
            );
          }
        } catch (err) {
          console.error("[sse] poll error:", err);
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

