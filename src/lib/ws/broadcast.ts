import type { NewMessageEvent, ThreadDeletedEvent } from "./broker";

/**
 * Minimal interface required by the broadcast functions. Lets us unit-test
 * the routing logic without a real `ws` library WebSocket (which depends
 * on a network connection). `readyState === 1` mirrors `WebSocket.OPEN`.
 */
export interface BroadcastSocketLike {
  userId: string;
  readyState: number;
  send(payload: string): void;
}

/**
 * Subscribed-conversations cache (Fase 4.1): maps `conversationId` →
 * Set of WS currently subscribed to that conversation. Each WS entered
 * this Map only after passing the DB membership check at upgrade time.
 */
export type SubscribedConversationsCache = Map<
  string,
  Set<BroadcastSocketLike>
>;

/**
 * Fase 4.3: subscribes-user-to-inbox cache. Maps `userId` → Set of WS
 * subscribed to that user's personal inbox (via `?scope=inbox` token).
 * Used to fan-out `inboxUpdate` events to the partner (NOT the sender)
 * unabhängig della specifica Conversation che hanno aperto in WS.
 */
export type InboxClientsCache = Map<string, Set<BroadcastSocketLike>>;

export type BroadcastResult = {
  delivered: number;
  closed: number;
};

const OPEN = 1;

/**
 * Deliver a `newMessage` event to every WebSocket subscribed to the
 * event's conversation, EXCEPT the sender.
 *
 * Reasoning: il REST handler in `src/app/api/messages/route.ts` already
 * restituisce il messaggio persistito nella POST response, quindi il
 * sender ce l'ha già client-side. Re-inviare rischia un render duplicato.
 *
 * Contract (coperto dai unit test):
 *   1. Solo WS in `subscribedConversations.get(conversationId)` raggiunti.
 *   2. WS con `userId === message.senderId` sono skippato (no self-receive).
 *   3. WS con `readyState !== OPEN` skippato + cleanup (Set→Map prune).
 *   4. Gli altri partecipanti ricevono esattamente 1 payload.
 *
 * Pura: mutates solo la cache e i sockets dentro. Niente DB / HTTP.
 */
export function deliverNewMessage(
  subscribedConversations: SubscribedConversationsCache,
  event: NewMessageEvent,
): BroadcastResult {
  const { conversationId, message } = event;

  const convSockets = subscribedConversations.get(conversationId);
  if (!convSockets) return { delivered: 0, closed: 0 };

  let delivered = 0;
  let closed = 0;

  // Snapshot: possiamo mutare `convSockets` mid-loop (cleanup su send throws).
  for (const ws of [...convSockets]) {
    if (ws.readyState !== OPEN) continue;
    if (ws.userId === message.senderId) continue;

    try {
      ws.send(
        JSON.stringify({
          type: "newMessage",
          conversationId,
          message,
        }),
      );
      delivered++;
    } catch {
      convSockets.delete(ws);
      if (convSockets.size === 0) {
        subscribedConversations.delete(conversationId);
      }
      closed++;
    }
  }

  return { delivered, closed };
}

/**
 * Fase 4.3: deliver an `inboxUpdate` event to every WebSocket subscribed
 * to the RECEIVER's inbox, UNCONDITIONALLY.
 *
 * Rationale: lato server, il bridge new message ha già determinato
 * `event.receiverId` = il partner (NON il sender). Il sender NON ha
 * inbox WS subscribed (o se ne ha, è la sua inbox — non deve ricevere
 * un update di un msg che ha appena inviato). La funzione è idempotente
 * per `receiverId`.
 *
 * Contract (coperto dai unit test):
 *   1. Solo WS in `inboxClients.get(receiverId)` raggiunti.
 *   2. NO self-skip perché il chiamante (server.ts) ha già determinato
 *      `receiverId !== senderId` (a meno di self-messaging, bloccato dal
 *      resolver upstream).
 *   3. WS con `readyState !== OPEN` skippato + cleanup speculare a
 *      deliverNewMessage.
 *   4. Tutti i WS subscribed all'inbox ricevono 1 payload
 *      `{type:"inboxUpdate", conversationId, message}`.
 *
 * Memory-safe: snapshot `[...inboxSockets]`, cleanup on throws, delete-
 * if-empty Map pruning.
 *
 * Pura: stesso principio di deliverNewMessage.
 */
export function deliverInboxUpdate(
  inboxClients: InboxClientsCache,
  receiverId: string,
  event: NewMessageEvent,
): BroadcastResult {
  const { conversationId, message } = event;

  const inboxSockets = inboxClients.get(receiverId);
  if (!inboxSockets) return { delivered: 0, closed: 0 };

  const inboxPayload = JSON.stringify({
    type: "inboxUpdate",
    conversationId,
    message,
  });

  let delivered = 0;
  let closed = 0;

  for (const ws of [...inboxSockets]) {
    if (ws.readyState !== OPEN) continue;
    try {
      ws.send(inboxPayload);
      delivered++;
    } catch {
      inboxSockets.delete(ws);
      if (inboxSockets.size === 0) {
        inboxClients.delete(receiverId);
      }
      closed++;
    }
  }

  return { delivered, closed };
}

/**
 * Phase 2.3: deliver a `threadDeleted` event to BOTH participants.
 *
 * La firma differisce dalle altre broadcast functions perché qui NON c'è
 * un singolo destinatario immediato: dopo una DELETE /api/conversations/[id]
 * che ha prodotto CASCADE-delete della Conversation + Messages, il partner
 * (se online E subscribed via `?scope=inbox` o `?conversation=<id>`) deve
 * sapere immediatamente di non avere più quel thread nel suo inbox /
 * vista chat. Anche il deleter stesso riceve l'evento: utile se era
 * collegato via SSE/WS alla Conversation e vuole chiudere la UI lato
 * client in modo atomico.
 *
 * Fan-out su TRE cache:
 *   1. `subscribedConversations.get(conversationId)` — entrambi i WS
 *      subscribed a quella conversation chat. Nessuno skip self: la
 *      DELETE è una conferma "definitiva", entrambi i WS devono
 *      chiudere la UI di quel thread.
 *   2. `inboxClients.get(userOneId)` — la inbox subscription
 *      dell'utente uno (se partner era qui subscribed, gli arriva
 *      `type:"threadDeleted"` per rimuovere la riga inbox).
 *   3. `inboxClients.get(userTwoId)` — speculare.
 *
 * Contract (coperto dai unit test Fase 2.3):
 *   - Idempotente per `conversationId + (userOneId, userTwoId)`.
 *   - Se la Conversation era già stata cancellata da una DELETE
 *     precedente, i subscribed WS potrebbero già essere stati
 *     auto-puliti dal bridge WS (`/ws upgrade` non esiste più →
 *     `subscribedConversations.delete(convId)`). In quel caso
 *     `delivered = 0` ed è OK.
 *   - Memory-safe: stessi pattern di cleanup di `deliverNewMessage`
 *     (snapshot, readyState check, throw cleanup, delete-if-empty).
 *
 * Pura: stesso principio di deliverNewMessage/deliverInboxUpdate.
 */
export function deliverThreadDeleted(
  subscribedConversations: SubscribedConversationsCache,
  inboxClients: InboxClientsCache,
  event: ThreadDeletedEvent,
): BroadcastResult {
  const { conversationId, userOneId, userTwoId } = event;

  const payload = JSON.stringify({
    type: "threadDeleted",
    conversationId,
  });

  let delivered = 0;
  let closed = 0;

  // ── 1. Fan-out alla vista chat della conversation cancellata ──
  const convSockets = subscribedConversations.get(conversationId);
  if (convSockets) {
    for (const ws of [...convSockets]) {
      if (ws.readyState !== OPEN) continue;
      try {
        ws.send(payload);
        delivered++;
      } catch {
        convSockets.delete(ws);
        if (convSockets.size === 0) {
          subscribedConversations.delete(conversationId);
        }
        closed++;
      }
    }
  }

  // ── 2. Fan-out alla inbox subscription di userOne + userTwo ──
  // Spec: entrambi i partecipanti devono sapere che la Conversation è
  // cancellata dal loro inbox, indipendentemente da chi ha iniziato
  // l'azione. Vedi JSDoc sopra per il rationale del "no self-skip".
  //
  // Cleanup pattern matching `deliverInboxUpdate`: non-open WS sono
  // semplicemente skippati (lasciati nel Set); la rimozione effettiva
  // avviene solo quando `ws.send` throws (driven dal connection state
  // runtime, non da una speculazione su readyState). Vedi
  // `deliverInboxUpdate` per il rationale (consistente con i WS readyState
  // semantics di Node ws lib).
  for (const userId of [userOneId, userTwoId]) {
    const inboxSockets = inboxClients.get(userId);
    if (!inboxSockets) continue;
    for (const ws of [...inboxSockets]) {
      if (ws.readyState !== OPEN) continue;
      try {
        ws.send(payload);
        delivered++;
      } catch {
        inboxSockets.delete(ws);
        if (inboxSockets.size === 0) {
          inboxClients.delete(userId);
        }
        closed++;
      }
    }
  }

  return { delivered, closed };
}
