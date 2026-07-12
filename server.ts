import { createServer, type IncomingMessage } from "http";
import { parse } from "url";
import next from "next";
import { WebSocketServer, WebSocket } from "ws";
import { createHmac } from "crypto";
import { prisma } from "./src/lib/db/prisma";
import {
  messageBroker,
  NEW_MESSAGE,
  THREAD_DELETED,
  type NewMessageEvent,
  type ThreadDeletedEvent,
} from "./src/lib/ws/broker";
import {
  deliverNewMessage,
  deliverInboxUpdate,
  deliverThreadDeleted,
} from "./src/lib/ws/broadcast";
import { resolveMessagingPermission, MessagingDenyReason } from "./src/lib/messaging/resolve-message-permission";
import { getPartnerId } from "./src/lib/messaging/get-partner-id";

/**
 * Fase 5: tipo di WS che ha passato l'upgrade handler.
 * `WebSocket & { userId, conversationId }` è strutturalmente compatibile
 * con `BroadcastSocketLike` (subset di proprietà), quindi può alimentare
 * `deliverNewMessage` direttamente senza cast loose.
 */
type SubscribedSocket = WebSocket & {
  userId: string;
  conversationId: string;
};

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
 * ogni WS è scoped a UNA Conversation.
 */
const clients = new Map<string, Set<WebSocket>>();

/**
 * Conversazioni che hanno almeno un WS aperto. Usato come cache di
 * membership: lookup O(1) invece di N round-trip al DB. Aggiornato
 * durante l'upgrade handler e rimosso quando l'ultimo WS di una
 * Conversation si chiude.
 */
const subscribedConversations = new Map<string, Set<SubscribedSocket>>();

/**
 * Fase 4.3: WS user-scoped subscribed all'inbox personale dell'utente.
 * Quando un client apre `ws://...?token=...&scope=inbox`, questa cache
 * viene popolata. Il bridge `NEW_MESSAGE` fan-out anche a
 * `inboxClients[event.receiverId]` con `{type:"inboxUpdate"}` per
 * aggiornare i badge "non letti" senza refresh della pagina.
 */
const inboxClients = new Map<string, Set<SubscribedSocket>>();

/**
 * Verify a WS token.
 *
 * Token format (Fase 4.1 + Fase 4.3): `userId:<scope>:timestamp:signature`
 *
 * Scope possibilities per la `[1]` slot:
 *   - conversationId reale → subscript per-conversation. WS upgrade
 *     handler fa DB membership check prima di accettare.
 *   - literal `"inbox"` → subscript user-scoped per l'inbox
 *     personale (Fase 4.3). Nessun DB membership check richiesto.
 *
 * HMAC-SHA256(secret, `${userId}:<scope>:${timestamp}`) hex[0:16]
 * Expires 5 minutes after timestamp.
 */
function verifyToken(
  token: string,
): { userId: string; conversationId: string | null; inbox: boolean } | null {
  const parts = token.split(":");
  if (parts.length !== 4) return null;

  const [userId, scopeMarker, timestampStr, signature] = parts;
  const timestamp = parseInt(timestampStr, 10);
  const now = Date.now();

  if (isNaN(timestamp) || now - timestamp > 5 * 60 * 1000) return null;

  const secret = process.env.WS_SECRET ?? "dev-secret-change-in-production";
  const payload = `${userId}:${scopeMarker}:${timestamp}`;
  const expectedSig = createHmac("sha256", secret)
    .update(payload)
    .digest("hex")
    .slice(0, 16);

  if (signature !== expectedSig) return null;

  if (scopeMarker === "inbox") {
    return { userId, conversationId: null, inbox: true };
  }

  return { userId, conversationId: scopeMarker, inbox: false };
}

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  // WebSocket server
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request: IncomingMessage, socket, head) => {
    const { pathname, query } = parse(request.url!, true);

    if (pathname !== "/ws") {
      socket.destroy();
      return;
    }

    const token = query.token as string | undefined;
    const conversationId = query.conversationId as string | undefined;
    const scope = query.scope as string | undefined;

    if (!token) {
      socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
      socket.destroy();
      return;
    }

    // Fase 4.3: scope=inbox richiede solo il token, niente conversationId.
    if (scope !== "inbox" && !conversationId) {
      socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
      socket.destroy();
      return;
    }

    const verified = verifyToken(token);
    if (!verified) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    // Fase 4.3: inbox scope, skip DB membership check.
    if (verified.inbox) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        const meta = ws as SubscribedSocket;
        meta.userId = verified.userId;
        // Sentinel typed `conversationId === "inbox"`. Mai collision
        // con conversationId reali (cuid/uuid), l'inboxClients Map è
        // separata da subscribedConversations.
        meta.conversationId = "inbox";

        wss.emit("connection", ws, request);
      });
      return;
    }

    // Conversation scope (Fase 4.1): doppia verifica token vs URL.
    if (!conversationId || verified.conversationId !== conversationId) {
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }

    const { userId } = verified;

    // DB membership + resolver check (Fase 2.0 wire).
    // 1. Look up Conversation per (userOneId, userTwoId, productId).
    // 2. Membership precheck inline (fast-fail prima del resolver).
    // 3. Delegate to resolveMessagingPermission per la policy canonica.
    // Il resolver riapre le query Product + Order.completed — accettabile
    // perché il WS è long-lived (1 round-trip per upgrade, non per poll).
    prisma.conversation
      .findUnique({
        where: { id: conversationId },
        select: { userOneId: true, userTwoId: true, productId: true },
      })
      .then(async (conv) => {
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

        // ── Fase 2.0 (wire): delega al resolver single-source-of-truth ──
        // Phase 2.0 V2: usa `getPartnerId` helper per DRY (la stessa
        // logica è in src/app/api/conversations/[id]/stream/route.ts
        // al SSE auth wiring — estratta per garantire che entrambi i
        // path concordino sull'identità del partner canonical pair).
        // NB: src/app/api/messages/stream/route.ts era il legacy ed è
        // stato rimosso in commit `chore(dm): delete legacy
        // /api/messages routes + shim`.
        const partnerId = getPartnerId(conv, userId);
        const permission = await resolveMessagingPermission({
          actorId: userId,
          targetId: partnerId,
          productId: conv.productId,
        });
        if (!permission.allowed) {
          console.log(
            `[ws] Upgrade refused: resolver deny (user=${userId}, conv=${conversationId}, reason=${permission.reason ?? MessagingDenyReason.NoCompletedOrderForStudent})`,
          );
          // 403 per deny canonico. ProductNotFound/NoCreatorForProduct
          // sarebbero 404/409 nel path API ma la WS upgrade handshake
          // usa solo 403 + socket close; i dettagli sono nel log.
          socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
          socket.destroy();
          return;
        }

        wss.handleUpgrade(request, socket, head, (ws) => {
          const meta = ws as SubscribedSocket;
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
    const meta = ws as SubscribedSocket;
    const { userId, conversationId } = meta;
    // Fase 4.3: discriminatore typed `conversationId === "inbox"`.
    const inboxScope = conversationId === "inbox";

    // Per-tab (Fase 4.2).
    if (!clients.has(userId)) {
      clients.set(userId, new Set());
    }
    clients.get(userId)!.add(ws);

    if (inboxScope) {
      // Fase 4.3: route inbox.
      if (!inboxClients.has(userId)) {
        inboxClients.set(userId, new Set());
      }
      inboxClients.get(userId)!.add(meta);
      console.log(`[ws] Inbox subscribed: ${userId}`);
    } else {
      // Per-conversation (Fase 4.1).
      if (!subscribedConversations.has(conversationId)) {
        subscribedConversations.set(conversationId, new Set());
      }
      subscribedConversations.get(conversationId)!.add(meta);
    }

    prisma.user
      .update({ where: { id: userId }, data: { lastSeenAt: new Date() } })
      .catch((err) =>
        console.error("[ws] Failed to update lastSeenAt on connect:", err),
      );

    console.log(
      `[ws] Client connected: ${userId} on conversation ${conversationId}`,
    );

    // Heartbeat every 30s.
    const heartbeat = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }, 30_000);

    ws.on("close", () => {
      clearInterval(heartbeat);

      const userSockets = clients.get(userId);
      if (userSockets) {
        userSockets.delete(ws);
        if (userSockets.size === 0) {
          clients.delete(userId);
        }
      }

      if (inboxScope) {
        const inboxSockets = inboxClients.get(userId);
        if (inboxSockets) {
          inboxSockets.delete(meta);
          if (inboxSockets.size === 0) {
            inboxClients.delete(userId);
          }
        }
        console.log(`[ws] Inbox disconnected: ${userId}`);
      } else {
        const convSockets = subscribedConversations.get(conversationId);
        if (convSockets) {
          convSockets.delete(meta);
          if (convSockets.size === 0) {
            subscribedConversations.delete(conversationId);
          }
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
      // Se l'error handler si attiva senza un successivo close (es. TCP
      // RST, network drop), il heartbeat altrimenti leakerebbe fino al
      // close. Pulizia speculare a quella del ws.on("close").
      clearInterval(heartbeat);
      const userSockets = clients.get(userId);
      if (userSockets) {
        userSockets.delete(ws);
        if (userSockets.size === 0) {
          clients.delete(userId);
        }
      }
      if (inboxScope) {
        const inboxSockets = inboxClients.get(userId);
        if (inboxSockets) {
          inboxSockets.delete(meta);
          if (inboxSockets.size === 0) {
            inboxClients.delete(userId);
          }
        }
      } else {
        const convSockets = subscribedConversations.get(conversationId);
        if (convSockets) {
          convSockets.delete(meta);
          if (convSockets.size === 0) {
            subscribedConversations.delete(conversationId);
          }
        }
      }
    });

    // Typing indicator relay (WS → WS subscribed alla stessa conv).
    ws.on("message", (raw) => {
      try {
        const data = JSON.parse(raw.toString());
        if (data.type === "typing" || data.type === "stopTyping") {
          const convSockets = subscribedConversations.get(conversationId);
          if (!convSockets) return;
          for (const otherWs of convSockets) {
            if (otherWs.userId === userId) continue;
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
        /* malformed JSON: ignore */
      }
    });
  });

  // Bridge REST → WS.
  messageBroker.on(NEW_MESSAGE, (event: NewMessageEvent) => {
    // 1) Per-conversation fan-out (Fase 4.1) → WS subscribed a quella
    //    conversation, SKIP self.
    deliverNewMessage(subscribedConversations, event);

    // 2) Inbox fan-out (Fase 4.3) → WS subscribed all'inbox del PARTNER
    //    (NON del sender — skip self implicito perché receiverId !== senderId).
    deliverInboxUpdate(inboxClients, event.receiverId, event);
  });

  // Phase 2.3: bridge per la cancellazione di una Conversation via
  // DELETE /api/conversations/[id]. Entrambi i partecipanti storici
  // (userOneId + userTwoId) devono ricevere immediatamente il sealed
  // event sulla loro vista chat E inbox subscription, così la UI
  // client può chiudere il thread in tempo reale senza refresh.
  // Vedi JSDoc di deliverThreadDeleted per il rationale del "no
  // self-skip" (entrambi i partecipanti, deleter incluso, ricevono).
  messageBroker.on(THREAD_DELETED, (event: ThreadDeletedEvent) => {
    deliverThreadDeleted(subscribedConversations, inboxClients, event);
  });

  server.listen(port, () => {
    console.log(
      `> Server ready on http://${hostname}:${port} (${dev ? "development" : "production"})`,
    );
    console.log(`> WebSocket server ready on ws://${hostname}:${port}/ws`);
  });
});
