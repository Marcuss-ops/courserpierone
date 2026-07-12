import { createServer, type IncomingMessage } from "http";
import { parse } from "url";
import next from "next";
import { WebSocketServer, WebSocket } from "ws";
import { createHmac } from "crypto";
import { prisma } from "./src/lib/db/prisma";
import { messageBroker, NEW_MESSAGE, type NewMessageEvent } from "./src/lib/ws/broker";

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = parseInt(process.env.PORT ?? "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

/**
 * Maps userId → Set of WebSocket connections.
 *
 * Fase 4.2 (multi-tab/multi-device friendly): un utente può avere più
 * WS aperti contemporaneamente. Fase 4.1 (protocollo conversationId):
 * ogni WS è scoped a UNA Conversation — la `withUserId + withProductId`
 * coppia è sostituita da un singolo `conversationId`. Il filter del
 * bridge diventa `meta.conversationId === event.conversationId`.
 */
const clients = new Map<string, Set<WebSocket>>();

/**
 * Conversazioni che hanno almeno un WS aperto. Usato come cache di
 * membership: lookup O(1) invece di N round-trip al DB. Aggiornato
 * durante l'upgrade handler e rimosso quando l'ultimo WS di una
 * Conversation si chiude.
 *
 * NB: questa cache è una scorciatoia; la membership-canonica rimane
 * la riga Conversation su Postgres. Quando si riceve un nuovo messaggio
 * per una Conversation, lo si confronta con `subscribedConversations`
 * per filtrare i WS. È un Set di WS per conversationId.
 */
const subscribedConversations = new Map<string, Set<WebSocket>>();

/**
 * Verify a WS token signed for a specific conversation.
 *
 * Token format (Fase 4.1): `userId:conversationId:timestamp:signature`
 * HMAC-SHA256(secret, `${userId}:${conversationId}:${timestamp}`) hex[0:16]
 * Expires 5 minutes after timestamp.
 *
 * Lato issuer (`/api/auth/ws-token`) verifica DB membership PRIMA
 * di firmare; qui ri-verifichiamo la membership solo dopo che la
 * HMAC è valida (defense-in-depth: un attacker non può costruire
 * un token senza WS_SECRET).
 */
function verifyToken(token: string): { userId: string; conversationId: string } | null {
  const parts = token.split(":");
  if (parts.length !== 4) return null;

  const [userId, conversationId, timestampStr, signature] = parts;
  const timestamp = parseInt(timestampStr, 10);
  const now = Date.now();

  if (isNaN(timestamp) || now - timestamp > 5 * 60 * 1000) return null;

  const secret = process.env.WS_SECRET ?? "dev-secret-change-in-production";
  const payload = `${userId}:${conversationId}:${timestamp}`;
  const expectedSig = createHmac("sha256", secret)
    .update(payload)
    .digest("hex")
    .slice(0, 16);

  if (signature !== expectedSig) return null;

  return { userId, conversationId };
}

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  // ── WebSocket server ────────────────────────────────────────
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request: IncomingMessage, socket, head) => {
    const { pathname, query } = parse(request.url!, true);

    if (pathname !== "/ws") {
      socket.destroy();
      return;
    }

    const token = query.token as string | undefined;
    const conversationId = query.conversationId as string | undefined;

    if (!token || !conversationId) {
      socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
      socket.destroy();
      return;
    }

    const verified = verifyToken(token);
    if (!verified) {
      // Token non valido (bad HMAC, scaduto, o malformato).
      // NB: 401 vs 403: token invalido = 401; token valido ma
      // membership OK negata = 403 (vedi sotto).
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    // ── Conversation check (Fase 4.1) ──────────────────────
    // Doppia verifica: il token dice `conversationId` ma l'URL query
    // passa una `conversationId` separata. Le due devono coincidere O
    // respingiamo l'upgrade: impedisce a un attacker di sostituire la
    // conversation target dopo aver ottenuto un token valido per
    // un'altra Conversation.
    if (verified.conversationId !== conversationId) {
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }

    const { userId } = verified;

    // ── DB membership check ────────────────────────────────
    // La Conversation row deve esistere E l'utente deve esserne
    // userOneId oppure userTwoId. Una O(1) lookup unique.
    prisma.conversation
      .findUnique({
        where: { id: conversationId },
        select: { userOneId: true, userTwoId: true },
      })
      .then((conv) => {
        if (!conv) {
          socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
          socket.destroy();
          return;
        }

        if (conv.userOneId !== userId && conv.userTwoId !== userId) {
          console.log(
            `[ws] Upgrade refused: conversation membership (user=${userId}, conv=${conversationId})`,
          );
          socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
          socket.destroy();
          return;
        }

        // ── Attach meta + complete upgrade ──────────────────────
        wss.handleUpgrade(request, socket, head, (ws) => {
          const meta = ws as WebSocket & {
            userId: string;
            conversationId: string;
          };
          meta.userId = userId;
          meta.conversationId = conversationId;

          wss.emit("connection", ws, request);
        });
      })
      .catch((err) => {
        console.error("[ws] DB lookup error during upgrade:", err);
        socket.write("HTTP/1.1 500 Internal Server Error\r\n\r\n");
        socket.destroy();
      });
  });

  wss.on("connection", (ws: WebSocket) => {
    const meta = ws as WebSocket & { userId: string; conversationId: string };
    const { userId, conversationId } = meta;

    // Aggiungi al Set per-user (Fase 4.2 multi-tab).
    if (!clients.has(userId)) {
      clients.set(userId, new Set());
    }
    clients.get(userId)!.add(ws);

    // Aggiungi al Set per-conversation (Fase 4.1 cache subscription).
    if (!subscribedConversations.has(conversationId)) {
      subscribedConversations.set(conversationId, new Set());
    }
    subscribedConversations.get(conversationId)!.add(ws);

    // Update lastSeenAt in DB (user is now online)
    prisma.user
      .update({ where: { id: userId }, data: { lastSeenAt: new Date() } })
      .catch((err) =>
        console.error("[ws] Failed to update lastSeenAt on connect:", err),
      );

    console.log(
      `[ws] Client connected: ${userId} on conversation ${conversationId}`,
    );

    // Heartbeat every 30s
    const heartbeat = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }, 30_000);

    ws.on("close", () => {
      clearInterval(heartbeat);

      // Cleanup per-tab (Fase 4.2).
      const userSockets = clients.get(userId);
      if (userSockets) {
        userSockets.delete(ws);
        if (userSockets.size === 0) {
          clients.delete(userId);
        }
      }

      // Cleanup per-conversation (Fase 4.1).
      const convSockets = subscribedConversations.get(conversationId);
      if (convSockets) {
        convSockets.delete(ws);
        if (convSockets.size === 0) {
          subscribedConversations.delete(conversationId);
        }
      }

      prisma.user
        .update({ where: { id: userId }, data: { lastSeenAt: new Date() } })
        .catch((err) =>
          console.error(
            "[ws] Failed to update lastSeenAt on disconnect:",
            err,
          ),
        );
      console.log(`[ws] Client disconnected: ${userId}`);
    });

    ws.on("error", (err) => {
      console.error(`[ws] Error for ${userId}:`, err.message);
      // Allinea la pulizia.
      const userSockets = clients.get(userId);
      if (userSockets) {
        userSockets.delete(ws);
        if (userSockets.size === 0) {
          clients.delete(userId);
        }
      }
      const convSockets = subscribedConversations.get(conversationId);
      if (convSockets) {
        convSockets.delete(ws);
        if (convSockets.size === 0) {
          subscribedConversations.delete(conversationId);
        }
      }
    });

    // ── Handle client messages (typing indicators) ─────────
    // Fase 4.1: ogni WS è scoped a UNA Conversation. Il typing
    // indicator del sender va a TUTTI gli altri WS subscribed alla
    // stessa Conversation. Cache O(1) via `subscribedConversations`.
    ws.on("message", (raw) => {
      try {
        const data = JSON.parse(raw.toString());
        if (data.type === "typing" || data.type === "stopTyping") {
          const convSockets = subscribedConversations.get(conversationId);
          if (!convSockets) return;
          for (const otherWs of convSockets) {
            // Non rimandare al sender stesso (no self-receive).
            const otherMeta = otherWs as WebSocket & { userId: string };
            if (otherMeta.userId === userId) continue;
            if (otherWs.readyState === WebSocket.OPEN) {
              otherWs.send(
                JSON.stringify({
                  type: data.type,
                  userId,
                  conversationId,
                }),
              );
            }
          }
        }
      } catch {
        // Ignore malformed messages
      }
    });
  });

  // ── Bridge: REST API → WebSocket ────────────────────────────
  // Fase 4.1: il filter diventa una singola equality check
  // `meta.conversationId === event.conversationId`. La coppia sender
  // / productId è sostituita da una sola chiave canonica. Niente più
  // cross-tab/cross-product leak: il filter per-conversation è
  // Ermetico.
  messageBroker.on(NEW_MESSAGE, (event: NewMessageEvent) => {
    const { conversationId, message } = event;

    const convSockets = subscribedConversations.get(conversationId);
    if (!convSockets) return;

    // Snapshot per evitare mutazioni-during-iteration.
    for (const ws of [...convSockets]) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      const wsMeta = ws as WebSocket & { userId: string };
      // Skip self (sender): il sender ha già il messaggio dal POST
      // response, niente da re-inviare.
      if (wsMeta.userId === message.senderId) continue;

      try {
        ws.send(
          JSON.stringify({
            type: "newMessage",
            conversationId,
            message,
          }),
        );
      } catch {
        // Cleanup per-tab + per-conversation.
        convSockets.delete(ws);
        if (convSockets.size === 0) {
          subscribedConversations.delete(conversationId);
        }
        const userSockets = clients.get(wsMeta.userId);
        if (userSockets) {
          userSockets.delete(ws);
          if (userSockets.size === 0) {
            clients.delete(wsMeta.userId);
          }
        }
      }
    }
  });

  // ── Start server ────────────────────────────────────────────
  server.listen(port, () => {
    console.log(
      `> Server ready on http://${hostname}:${port} (${dev ? "development" : "production"})`,
    );
    console.log(`> WebSocket server ready on ws://${hostname}:${port}/ws`);
  });
});
