import type { NewMessageEvent } from "./broker";

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
