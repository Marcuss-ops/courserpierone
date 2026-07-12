import { createServer, type IncomingMessage } from "http";
import { parse } from "url";
import next from "next";
import { WebSocketServer, WebSocket } from "ws";
import { createHmac } from "crypto";
import { prisma } from "./src/lib/db/prisma";
import { messageBroker, NEW_MESSAGE, type NewMessageEvent } from "./src/lib/ws/broker";
import { resolveMessagingPermission } from "./src/lib/messaging/resolve-message-permission";

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = parseInt(process.env.PORT ?? "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

/**
 * Maps userId → Set of WebSocket connections. Phase 4.2:
 * multi-tab/multi-device friendly — un utente può avere più WS aperti
 * contemporaneamente (browser desktop + mobile + admin tab + ecc.).
 *
 * Iterazione broadcast: si itera su `Map.values()` per ogni userId, poi
 * `forEach` sul Set. Filter per-tab (withUserId + withProductId) è il
 * discriminante per il routing dei messaggi.
 */
const clients = new Map<string, Set<WebSocket>>();

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

    // Phase 1.6: il WS upgrade passa per resolveMessagingPermission.
    // Se la DM non è autorizzata (self, prodotto inesistente, coppia
    // non creator↔cliente, studente senza Order.completed) l'upgrade
    // viene rifiutato con 403. Il client riceverà un close code 1008
    // (policy violation) e può mostrare "subscription ended" o simile.
    if (!withProductId) {
      // productId obbligatorio post-Phase 1.3
      socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
      socket.destroy();
      return;
    }

    resolveMessagingPermission({
      actorId: userId,
      targetId: withUserId,
      productId: withProductId,
    })
      .then((permission) => {
        if (!permission.allowed) {
          console.log(
            `[ws] Upgrade refused: ${permission.reason} (user=${userId}, with=${withUserId}, product=${withProductId})`,
          );
          socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
          socket.destroy();
          return;
        }

        // ── Attach meta + complete upgrade ──────────────────────
        // Phase 4.2: nessun force-close del socket precedente.
        // Multi-tab / multi-device sono ora cittadini di prima classe;
        // ogni WS è un Set member indipendente con i propri meta.
        wss.handleUpgrade(request, socket, head, (ws) => {
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
      })
      .catch((err) => {
        console.error("[ws] permission resolution error:", err);
        socket.write("HTTP/1.1 500 Internal Server Error\r\n\r\n");
        socket.destroy();
      });
    // Tutta la gestione dell'upgrade è dentro il .then()/.catch()
    // async sopra (Phase 1.6). Nessun codice ulteriore qui.
  });

  wss.on("connection", (ws: WebSocket) => {
    const meta = ws as WebSocket & { userId: string; withUserId: string };
    const { userId, withUserId } = meta;

    // Aggiungi al Set: il primo tab crea il Set, gli altri entrano nello stesso.
    if (!clients.has(userId)) {
      clients.set(userId, new Set());
    }
    clients.get(userId)!.add(ws);

    // Update lastSeenAt in DB (user is now online)
    prisma.user.update({ where: { id: userId }, data: { lastSeenAt: new Date() } })
      .catch((err) => console.error("[ws] Failed to update lastSeenAt on connect:", err));

    console.log(`[ws] Client connected: ${userId} (chat with ${withUserId})`);

    // Heartbeat every 30s
    const heartbeat = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }, 30_000);

    ws.on("close", () => {
      clearInterval(heartbeat);

      // Phase 4.2: cleanup per-tab. Rimuovi solo lo specifico ws dal Set;
      // l'eventuale presenza di altri tab (Set non vuoto) tiene vivo il
      // mapping userId → Set. Quando l'ultimo tab si chiude, il Set
      // diventa vuoto → cancelliamo la key dal map per evitare memory leak.
      const userSockets = clients.get(userId);
      if (userSockets) {
        userSockets.delete(ws);
        if (userSockets.size === 0) {
          clients.delete(userId);
        }
      }

      // Update lastSeenAt on disconnect (last known activity)
      prisma.user.update({ where: { id: userId }, data: { lastSeenAt: new Date() } })
        .catch((err) => console.error("[ws] Failed to update lastSeenAt on disconnect:", err));
      console.log(`[ws] Client disconnected: ${userId}`);
    });

    ws.on("error", (err) => {
      console.error(`[ws] Error for ${userId}:`, err.message);
      // Allinea la pulizia: rimuovi questo socket dal Set (non altri tab).
      const userSockets = clients.get(userId);
      if (userSockets) {
        userSockets.delete(ws);
        if (userSockets.size === 0) {
          clients.delete(userId);
        }
      }
    });

    // ── Handle client messages (typing indicators) ─────────
    // Phase 4.2: itera TUTTI i socket del partner (multi-tab friendly),
    // ma filtra PER-TAB per evitare il cross-tab data leak. Esempio:
    // U sta scrivendo "typing" sulla chat con W (prod X). W ha tab1 con U
    // (prod X) e tab2 con Q (prod Y). Senza il filtro, tab2 riceverebbe
    // il typing indicator destinato alla chat con U. Filtro speculare
    // a quello del NEW_MESSAGE bridge: solo le WS del partner la cui
    // `withUserId === userId` (sender del typing) E `withProductId ===
    // self.withProductId` (stesso contesto prodotto) ricevono il typing.
    ws.on("message", (raw) => {
      try {
        const data = JSON.parse(raw.toString());
        if (data.type === "typing" || data.type === "stopTyping") {
          const otherSockets = clients.get(withUserId);
          if (!otherSockets) return;
          const selfMeta = ws as WebSocket & {
            userId: string;
            withUserId: string;
            withProductId: string | null;
          };
          for (const otherWs of otherSockets) {
            if (otherWs.readyState !== WebSocket.OPEN) continue;
            const otherMeta = otherWs as WebSocket & {
              userId: string;
              withUserId: string;
              withProductId: string | null;
            };
            // Cross-tab fix: solo i tab del partner che stanno
            // visualizzando QUESTA chat (sender = userId, prodotto = self).
            if (otherMeta.withUserId !== userId) continue;
            if (otherMeta.withProductId !== selfMeta.withProductId) continue;
            otherWs.send(
              JSON.stringify({
                type: data.type,
                userId,
              }),
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

    // Broadcast solo ai partecipanti della conversazione, su tutti i loro
    // device aperti (multi-tab friendly).
    //
    // Phase 4.2 (fix bug Fase 1.3): il filtro di partecipazione è ORA
    // PER-TAB. Prima della Fase 4.2 esisteva una mappa ausiliaria
    // userConversations: Map<userId, Set<withUserId>> che aggregava lo
    // stato di subscription a livello UTENTE. Questo causava un
    // cross-tab data leak: un utente B che apriva tab1 con A e tab2
    // con C vedeva arrivare sulla tab2 i messaggi destinati alla
    // chat con A (perché userConversations[B].has(A) era true).
    // Rimosso del tutto: ogni WS ha già i propri meta (withUserId,
    // withProductId) per-tab, che sono la source of truth canonica.
    for (const [clientId, clientSockets] of clients) {
      // Skip the sender — they already have the message from the POST response
      if (clientId === message.senderId) continue;

      for (const clientWs of clientSockets) {
        if (clientWs.readyState !== WebSocket.OPEN) continue;

        const meta = clientWs as WebSocket & {
          userId: string;
          withUserId: string;
          withProductId: string | null;
        };

        // Phase 1.3: skip WS che non si sono sottoscritti a questo
        // specifico prodotto. Mitigazione pragmatica contro il
        // data-leak cross-prodotto fino a quando Fase 4.1 non
        // sostituirà `withUserId` con `conversationId` (check
        // definitivo server-side).
        if (!meta.withProductId || meta.withProductId !== eventProductId) {
          continue;
        }

        // Phase 4.2 (cross-tab leak fix): il tab del recipient deve
        // essere ESPLICITAMENTE in chat con il sender. Filtro
        // PER-TAB (la singola WS), non user-level aggregato.
        // Esempio: B ha tab1 con A (withUserId=A) e tab2 con C
        // (withUserId=C). Un msg da A deve raggiungere SOLO tab1 di B,
        // non tab2 — `meta.withUserId === message.senderId` blocca
        // tab2 che ha withUserId=C !== A.
        if (meta.withUserId !== message.senderId) {
          continue;
        }

        try {
          clientWs.send(
            JSON.stringify({
              type: "newMessage",
              conversationId,
              message,
            }),
          );
        } catch {
          // Phase 4.2: rimuovi dal Set (non dal Map direttamente)
          // e svuota la key se questo era l'ultimo socket del user.
          clientSockets.delete(clientWs);
          if (clientSockets.size === 0) {
            clients.delete(clientId);
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
