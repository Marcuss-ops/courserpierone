import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getServerUser } from "@/lib/supabase/get-user";

/**
 * GET /api/messages/stream?with=<userId>&productId=<productId>&since=<ISO timestamp>
 *
 * SSE (Server-Sent Events) endpoint per ricevere nuovi messaggi in tempo reale.
 *
 * Query params:
 *   - with:      ID dell'altro utente nella conversazione
 *   - productId: ID prodotto per scoping (opzionale)
 *   - since:     ISO timestamp — riceve solo messaggi creati dopo questa data
 *
 * Il server polla il DB ogni 2 secondi e invia i nuovi messaggi tramite SSE.
 * Heartbeat ogni 15s per mantenere la connessione viva.
 * Timeout: dipende dal piano Vercel — il client si riconnette automaticamente.
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

  const since = sinceRaw ? new Date(sinceRaw) : new Date(0);
  const userId = dbUser.id; // catturato fuori dalla closure per TS narrowing
  const otherUserId = withUserId; // ora è string (controllato sopra)

  const encoder = new TextEncoder();
  let stopped = false;

  const stream = new ReadableStream({
    start(controller) {
      let lastSeen = since;

      // Heartbeat per mantenere viva la connessione
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          clearInterval(heartbeat);
          stopped = true;
        }
      }, 15_000);

      // Poll DB con setTimeout ricorsivo (evita race condition di setInterval asincrono)
      async function poll(): Promise<void> {
        if (stopped) return;
        try {
          const newMessages = await prisma.message.findMany({
            where: {
              OR: [
                { senderId: userId, receiverId: otherUserId },
                { senderId: otherUserId, receiverId: userId },
              ],
              ...(productId ? { productId } : {}),
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

      // Avvia il primo poll dopo 500ms (lascia tempo al client di connettersi)
      setTimeout(poll, 500);

      // Cleanup alla disconnessione
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
