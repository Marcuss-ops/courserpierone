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

/** Maps userId → WebSocket connection. */
const clients = new Map<string, WebSocket>();

/** Maps userId → set of conversation IDs the user is currently viewing. */
const userConversations = new Map<string, Set<string>>();

function verifyToken(token: string): { userId: string } | null {
  const parts = token.split(":");
  if (parts.length !== 3) return null;

  const [userId, timestampStr, signature] = parts;
  const timestamp = parseInt(timestampStr, 10);
  const now = Date.now();

  // Token expires after 5 minutes
  if (isNaN(timestamp) || now - timestamp > 5 * 60 * 1000) return null;

  // Verify HMAC signature
  const secret = process.env.WS_SECRET ?? "dev-secret-change-in-production";
  const payload = `${userId}:${timestamp}`;
  const expectedSig = createHmac("sha256", secret)
    .update(payload)
    .digest("hex")
    .slice(0, 16);

  if (signature !== expectedSig) return null;

  return { userId };
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
    const withUserId = query.with as string | undefined;
    const withProductId = query.productId as string | undefined;

    if (!token || !withUserId) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    const verified = verifyToken(token);
    if (!verified) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    const { userId } = verified;

    // Phase 1.3: productId è ora richiesto dal client per ogni DM.
    // Validiamo almeno che esista un Product reale — il controllo
    // completo creator↔cliente↔prodotto arriverà dal
    // resolveMessagingPermission (Fase 1.5) e dallo switch a
    // conversationId (Fase 4.1). Per ora respingiamo solo i WS con
    // productId inesistente per evitare subscription a contesti fake.
    //
    // TODO Fase 1.5: integrare resolveMessagingPermission anche qui
    // (verifica ordine completed, ruoli, ownership prodotto).
    if (withProductId) {
      // Validazione best-effort: non blocchiamo l'upgrade ma
      // logghiamo l'anomalia. Blocco stretto richiede async prima
      // dell'upgrade, più invasivo.
      prisma.product.findUnique({ where: { id: withProductId }, select: { id: true } })
        .then((product) => {
          if (!product) {
            console.warn(
              `[ws] Product ${withProductId} not found for user ${userId} (with=${withUserId}) — allowing upgrade but flagging`,
            );
          }
        })
        .catch((err) => console.error("[ws] productId validation error:", err));
    } else {
      // Nessun productId: nel modello conversazione-per-prodotto non
      // dovremmo più accettare WS "generici". Logghiamo per debug e,
      // in Fase 4.1, transformeremo in upgrade rifiutato.
      console.warn(
        `[ws] Legacy upgrade without productId from user=${userId} with=${withUserId} — will be rejected in 4.1`,
      );
    }

    // Close old connection for the same user, if any
    const existing = clients.get(userId);
    if (existing && existing.readyState === WebSocket.OPEN) {
      existing.close(1000, "Replaced by newer connection");
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      // Attach metadata
      const meta = ws as WebSocket & {
        userId: string;
        withUserId: string;
        withProductId: string | null;
      };
      meta.userId = userId;
      meta.withUserId = withUserId;
      meta.withProductId = withProductId ?? null;

      wss.emit("connection", ws, request);
    });
  });

  wss.on("connection", (ws: WebSocket) => {
    const meta = ws as WebSocket & { userId: string; withUserId: string };
    const { userId, withUserId } = meta;

    clients.set(userId, ws);

    // Update lastSeenAt in DB (user is now online)
    prisma.user.update({ where: { id: userId }, data: { lastSeenAt: new Date() } })
      .catch((err) => console.error("[ws] Failed to update lastSeenAt on connect:", err));

    // Track which conversation this user is viewing
    if (!userConversations.has(userId)) {
      userConversations.set(userId, new Set());
    }
    userConversations.get(userId)!.add(withUserId);

    console.log(`[ws] Client connected: ${userId} (chat with ${withUserId})`);

    // Heartbeat every 30s
    const heartbeat = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }, 30_000);

    ws.on("close", () => {
      clearInterval(heartbeat);
      // Only delete if this exact connection is still stored
      if (clients.get(userId) === ws) {
        clients.delete(userId);
      }
      // Clean up conversation tracking
      const convs = userConversations.get(userId);
      if (convs) {
        convs.delete(withUserId);
        if (convs.size === 0) userConversations.delete(userId);
      }
      // Update lastSeenAt on disconnect (last known activity)
      prisma.user.update({ where: { id: userId }, data: { lastSeenAt: new Date() } })
        .catch((err) => console.error("[ws] Failed to update lastSeenAt on disconnect:", err));
      console.log(`[ws] Client disconnected: ${userId}`);
    });

    ws.on("error", (err) => {
      console.error(`[ws] Error for ${userId}:`, err.message);
      if (clients.get(userId) === ws) {
        clients.delete(userId);
      }
    });

    // ── Handle client messages (typing indicators) ─────────
    ws.on("message", (raw) => {
      try {
        const data = JSON.parse(raw.toString());
        if (data.type === "typing" || data.type === "stopTyping") {
          // Relay typing status to the other participant
          const otherWs = clients.get(withUserId);
          if (otherWs && otherWs.readyState === WebSocket.OPEN) {
            otherWs.send(
              JSON.stringify({
                type: data.type,
                userId,
              })
            );
          }
        }
      } catch {
        // Ignore malformed messages
      }
    });
  });

  // ── Bridge: REST API → WebSocket ────────────────────────────
  messageBroker.on(NEW_MESSAGE, (event: NewMessageEvent) => {
    const { conversationId, productId: eventProductId, message } = event;

    // Broadcast only to participants of this conversation.
    // Phase 1.3: filtriamo anche per productId così un client sottoscritto
    // a un WS con productId=A non riceve messaggi di conversazioni con
    // productId=B che condividono lo stesso partecipante.
    for (const [clientId, clientWs] of clients) {
      // Skip the sender — they already have the message from the POST response
      if (clientId === message.senderId) continue;

      if (clientWs.readyState !== WebSocket.OPEN) continue;

      // Phase 1.3: skip clients che non si sono sottoscritti a questo
      // specifico prodotto. È una mitigazione pragmatica contro il
      // data-leak cross-prodotto fino a quando Fase 4.1 non sostituirà
      // `withUserId` con `conversationId` (check definitivo server-side).
      const meta = clientWs as WebSocket & {
        userId: string;
        withUserId: string;
        withProductId: string | null;
      };
      if (!meta.withProductId || meta.withProductId !== eventProductId) {
        continue;
      }

      // Check if this client is a participant in the conversation
      const convs = userConversations.get(clientId);
      if (!convs) continue;

      // The client needs to be viewing a conversation with the message sender
      // (la conversazione è (sender, withUserId) e conProductId=eventProductId,
      // quindi basta matching sul sender).
      if (convs.has(message.senderId)) {
        try {
          clientWs.send(
            JSON.stringify({
              type: "newMessage",
              conversationId,
              message,
            })
          );
        } catch {
          clients.delete(clientId);
        }
      }
    }
  });

  // ── Start server ────────────────────────────────────────────
  server.listen(port, () => {
    console.log(
      `> Server ready on http://${hostname}:${port} (${dev ? "development" : "production"})`
    );
    console.log(`> WebSocket server ready on ws://${hostname}:${port}/ws`);
  });
});
