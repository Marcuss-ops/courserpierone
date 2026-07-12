import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getServerUser } from "@/lib/supabase/get-user";

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
 *     Niente più pass-through al `resolveMessagingPermission` policy
 *     layer: una volta che la Conversation row esiste, i suoi due
 *     partecipanti possono streamare in/out senza re-verificare
 *     Order.status ogni volta.
 *   - Niente più loop di "aspetta che la Conversation venga creata":
 *     il conversationId è già nel path, si sa subito se esiste.
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

  // ── Membership check (Fase 4.1, O(1) via unique) ────────
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { userOneId: true, userTwoId: true },
  });

  if (!conversation) {
    return new Response("Conversation not found", { status: 404 });
  }

  if (
    conversation.userOneId !== dbUser.id &&
    conversation.userTwoId !== dbUser.id
  ) {
    return new Response("Forbidden", { status: 403 });
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
