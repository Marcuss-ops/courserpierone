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
 * Subscribed-conversations cache: maps `conversationId` → Set of WS
 * currently subscribed to that conversation. The server (server.ts)
 * populates this on WS upgrade and removes from it on ws close.
 *
 * NB: this is a routing cache, not the canonical authority on
 * membership — that remains the `conversation` row. Filtering WS by
 * `conversationId` here is correct because each WS entered this Map
 * only after passing the DB membership check at upgrade time.
 */
export type SubscribedConversationsCache = Map<
  string,
  Set<BroadcastSocketLike>
>;

export type BroadcastResult = {
  delivered: number;
  closed: number;
};

const OPEN = 1;

/**
 * Deliver a `newMessage` event to every WebSocket subscribed to the
 * event's conversation, EXCEPT the sender.
 *
 * Why "except sender": the REST handler in `src/app/api/messages/route.ts`
 * already returns the persisted message in the POST response, so the
 * sender has it client-side. Re-sending would risk a duplicate render.
 *
 * Routing rules (these are the contracts the unit tests assert):
 *   1. Only WS in `subscribedConversations.get(conversationId)` are reached.
 *   2. WS whose `userId === message.senderId` are skipped (no self-receive).
 *   3. WS whose `readyState !== OPEN` are skipped (closed sockets fall
 *      out of the Set and `closed++` is incremented; the Set is pruned
 *      when its last member is removed).
 *   4. Other participants receive exactly one `newMessage` payload.
 *
 * The function is pure: it mutates only the supplied cache and the
 * sockets in it. No DB, no HTTP, no other globals.
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

  // Snapshot to a new array because we may mutate `convSockets` mid-loop
  // (when a `send` throws on a dead socket we delete it).
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
