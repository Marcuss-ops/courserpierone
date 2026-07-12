import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getServerUser } from "@/lib/supabase/get-user";
import { authorizeDmRequest } from "@/lib/messaging/api-authorize";

/**
 * GET /api/messages/stream?with=<userId>&productId=<productId>&since=<ISO timestamp>
 *
 * SSE (Server-Sent Events) endpoint per ricevere nuovi messaggi in tempo reale.
 *
 * Phase 1.6: il check autorizzativo passa da authorizeDmRequest →
 * resolveMessagingPermission. Se la DM non è autorizzata, restituiamo
 * 403 subito senza aprire lo stream.
 *
 * NB: lo stream resta connesso anche su conversation "non esistente" —
 * continuerà a polllare e ad aprire la chat quando i due utenti avranno
 * il primo scambio autorizzato.
 */
export async function GET(request: NextRequest) {
  const { user, dbUser } = await getServerUser();
  if (!user?.email || !dbUser) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const withUserId = searchParams.get("with");
  const productId = searchParams.get("productId") || undefined;
  const sinceRaw = searchParams.get("since");

  if (!withUserId) {
    return new Response("Missing 'with' parameter", { status: 400 });
  }
  if (!productId) {
    return new Response("Missing 'productId' parameter", { status: 400 });
  }

  // ── Permission check (Phase 1.6 single source of truth) ─────
  const auth = await authorizeDmRequest({
    actorId: dbUser.id,
    targetId: withUserId,
    productId,
  });
  if (!auth.allowed) {
    return new Response(auth.permission.reason ?? "forbidden", {
      status: auth.response.status,
    });
  }

  const since = sinceRaw ? new Date(sinceRaw) : new Date(0);

  // Cerca la conversation tra i due utenti scope al prodotto (ordinamento deterministico)
  const [minId, maxId] = [dbUser.id, withUserId].sort();
  const conversation = await prisma.conversation.findFirst({
    where: {
      productId,
      OR: [
        { userOneId: minId, userTwoId: maxId },
        { userOneId: maxId, userTwoId: minId },
      ],
    },
    select: { id: true },
  });

  let conversationId = conversation?.id ?? null;

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

        if (!conversationId) {
          const found = await prisma.conversation.findFirst({
            where: {
              productId,
              OR: [
                { userOneId: minId, userTwoId: maxId },
                { userOneId: maxId, userTwoId: minId },
              ],
            },
            select: { id: true },
          });
          conversationId = found?.id ?? null;

          if (!stopped) setTimeout(poll, 2_000);
          return;
        }

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
                `data: ${JSON.stringify({ messages: newMessages })}\n\n`
              )
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
