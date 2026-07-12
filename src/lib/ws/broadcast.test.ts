import { describe, it, expect } from "vitest";
import {
  deliverNewMessage,
  deliverInboxUpdate,
  type BroadcastSocketLike,
  type SubscribedConversationsCache,
  type InboxClientsCache,
} from "./broadcast";
import type { NewMessageEvent } from "./broker";

// ─── Test harness ───────────────────────────────────────────
// Build a fake WS che registra `send` calls. `readyState` default 1 (OPEN).
// `throwOnSend` simula un dead socket.
function makeWs(opts: {
  userId: string;
  readyState?: number;
  throwOnSend?: Error;
}): BroadcastSocketLike & { sent: string[] } {
  const sent: string[] = [];
  return {
    userId: opts.userId,
    readyState: opts.readyState ?? 1,
    send(payload: string) {
      if (opts.throwOnSend) throw opts.throwOnSend;
      sent.push(payload);
    },
    sent,
  };
}

// Helper: popola la cache conversazioni da un Record keyed per convId.
function makeCache(
  conversations: Record<string, BroadcastSocketLike[]>,
): SubscribedConversationsCache {
  const cache: SubscribedConversationsCache = new Map();
  for (const [convId, sockets] of Object.entries(conversations)) {
    cache.set(convId, new Set(sockets));
  }
  return cache;
}

// Helper: popola la cache inbox da un Record keyed per userId.
function makeInboxCache(
  inboxes: Record<string, BroadcastSocketLike[]>,
): InboxClientsCache {
  const cache: InboxClientsCache = new Map();
  for (const [userId, sockets] of Object.entries(inboxes)) {
    cache.set(userId, new Set(sockets));
  }
  return cache;
}

const baseMessage = {
  id: "msg-1",
  conversationId: "conv-A",
  senderId: "user-A",
  content: "Ciao",
  read: false,
  createdAt: "2026-07-12T10:00:00.000Z",
  sender: {
    id: "user-A",
    name: "Alice",
    image: null,
    role: "customer",
  },
};

function makeEvent(overrides: Partial<NewMessageEvent> = {}): NewMessageEvent {
  return {
    conversationId: "conv-A",
    productId: "prod-1",
    receiverId: "user-B",
    message: { ...baseMessage, ...(overrides.message ?? {}) },
    ...overrides,
  };
}

describe("deliverNewMessage — contract: solo i due partecipanti ricevono", () => {
  it("returns zero deliveries when nobody is subscribed", () => {
    const cache = makeCache({});
    const result = deliverNewMessage(cache, makeEvent());
    expect(result).toEqual({ delivered: 0, closed: 0 });
  });

  it("delivers to a single receiver (A sends, B receives)", () => {
    const wsA = makeWs({ userId: "user-A" });
    const wsB = makeWs({ userId: "user-B" });
    const cache = makeCache({ "conv-A": [wsA, wsB] });

    const result = deliverNewMessage(cache, makeEvent());

    expect(result.delivered).toBe(1);
    expect(result.closed).toBe(0);
    expect(wsA.sent).toEqual([]); // sender skip
    expect(wsB.sent).toHaveLength(1);
    const payload = JSON.parse(wsB.sent[0]);
    expect(payload).toMatchObject({
      type: "newMessage",
      conversationId: "conv-A",
      message: { id: "msg-1", senderId: "user-A" },
    });
  });

  it("delivers to receiver across multiple sender tabs (sender skip strict)", () => {
    // Setup: B è il sender del messaggio. A è receiver con 2 tab
    // (desktop + mobile). Il bridge deve raggiungere ENTRAMBI i tab di A
    // (= 2 deliver totali) e skippare B (sender).
    const wsA1 = makeWs({ userId: "user-A" });
    const wsA2 = makeWs({ userId: "user-A" });
    const wsB = makeWs({ userId: "user-B" });
    const cache = makeCache({ "conv-A": [wsA1, wsA2, wsB] });

    const result = deliverNewMessage(
      cache,
      makeEvent({ message: { ...baseMessage, senderId: "user-B" } }),
    );

    expect(result.delivered).toBe(2);
    expect(wsA1.sent).toHaveLength(1);
    expect(wsA2.sent).toHaveLength(1);
    expect(wsB.sent).toEqual([]);
  });

  it("delivers to both tabs of the receiver when sender has one tab", () => {
    const wsA = makeWs({ userId: "user-A" });
    const wsB1 = makeWs({ userId: "user-B" });
    const wsB2 = makeWs({ userId: "user-B" });
    const cache = makeCache({ "conv-A": [wsA, wsB1, wsB2] });

    const result = deliverNewMessage(cache, makeEvent());

    expect(result.delivered).toBe(2);
    expect(wsA.sent).toEqual([]);
    expect(wsB1.sent).toHaveLength(1);
    expect(wsB2.sent).toHaveLength(1);
  });

  it("does NOT deliver across conversations (cross-conv isolation)", () => {
    const wsAinConvA = makeWs({ userId: "user-A" });
    const wsBinConvA = makeWs({ userId: "user-B" });
    const wsCinConvB = makeWs({ userId: "user-C" });
    const wsBinConvB = makeWs({ userId: "user-B" });

    const cache = makeCache({
      "conv-A": [wsAinConvA, wsBinConvA],
      "conv-B": [wsBinConvB, wsCinConvB],
    });

    const result = deliverNewMessage(cache, makeEvent());
    expect(result.delivered).toBe(1);

    expect(wsAinConvA.sent).toEqual([]);
    expect(wsBinConvA.sent).toHaveLength(1);
    expect(wsBinConvB.sent).toEqual([]);
    expect(wsCinConvB.sent).toEqual([]);
  });
});

describe("deliverNewMessage — closed & broken sockets", () => {
  it("skips a WS whose readyState is not OPEN", () => {
    const wsA = makeWs({ userId: "user-A" });
    const wsBclosed = makeWs({ userId: "user-B", readyState: 3 });
    const wsBopen = makeWs({ userId: "user-B", readyState: 1 });
    const cache = makeCache({ "conv-A": [wsA, wsBclosed, wsBopen] });

    const result = deliverNewMessage(cache, makeEvent());

    expect(result.delivered).toBe(1);
    expect(result.closed).toBe(0);
    expect(wsBclosed.sent).toEqual([]);
    expect(wsBopen.sent).toHaveLength(1);
  });

  it("removes a WS whose send() throws and increments closed counter", () => {
    const wsA = makeWs({ userId: "user-A" });
    const wsBbroken = makeWs({
      userId: "user-B",
      throwOnSend: new Error("socket reset"),
    });
    const cache = makeCache({ "conv-A": [wsA, wsBbroken] });

    const result = deliverNewMessage(cache, makeEvent());

    expect(result.delivered).toBe(0);
    expect(result.closed).toBe(1);
    expect(cache.get("conv-A")?.has(wsBbroken)).toBe(false);
  });

  it("prunes the conversation key when the last WS is removed", () => {
    const wsB1broken = makeWs({
      userId: "user-B",
      throwOnSend: new Error("reset"),
    });
    const wsB2broken = makeWs({
      userId: "user-B",
      throwOnSend: new Error("reset"),
    });
    const cache = makeCache({ "conv-A": [wsB1broken, wsB2broken] });

    deliverNewMessage(
      cache,
      makeEvent({ message: { ...baseMessage, senderId: "user-A" } }),
    );

    expect(cache.has("conv-A")).toBe(false);
  });

  it("continues delivering to other sockets after one throws", () => {
    const wsA = makeWs({ userId: "user-A" });
    const wsB1Broken = makeWs({
      userId: "user-B",
      throwOnSend: new Error("reset"),
    });
    const wsB2 = makeWs({ userId: "user-B" });
    const cache = makeCache({ "conv-A": [wsA, wsB1Broken, wsB2] });

    const result = deliverNewMessage(cache, makeEvent());

    expect(result.delivered).toBe(1);
    expect(result.closed).toBe(1);
    expect(wsB2.sent).toHaveLength(1);
  });
});

describe("deliverNewMessage — payload integrity", () => {
  it("serializes the message exactly once per receiving WS", () => {
    const wsA = makeWs({ userId: "user-A" });
    const wsB = makeWs({ userId: "user-B" });
    const cache = makeCache({ "conv-A": [wsA, wsB] });

    deliverNewMessage(
      cache,
      makeEvent({
        message: {
          ...baseMessage,
          id: "msg-42",
          content: "Hello world 🌍",
          createdAt: "2026-07-12T12:34:56.000Z",
        },
      }),
    );

    expect(JSON.parse(wsB.sent[0]).message.content).toBe("Hello world 🌍");
    expect(JSON.parse(wsB.sent[0]).message.id).toBe("msg-42");
  });

  it("self-skip is strict by senderId, not by socket identity", () => {
    const wsA1 = makeWs({ userId: "user-A" });
    const wsA2 = makeWs({ userId: "user-A" });
    const wsA3 = makeWs({ userId: "user-A" });
    const wsB = makeWs({ userId: "user-B" });
    const cache = makeCache({ "conv-A": [wsA1, wsA2, wsA3, wsB] });

    deliverNewMessage(cache, makeEvent());

    expect(wsA1.sent).toEqual([]);
    expect(wsA2.sent).toEqual([]);
    expect(wsA3.sent).toEqual([]);
    expect(wsB.sent).toHaveLength(1);
  });
});

// ═════════════════════════════════════════════════════════════════
// Fase 4.3: deliverInboxUpdate — fan-out all'inbox del receiverId
// (client user-scoped WS subscribed via ?scope=inbox).
//
// Contract:
//   1. Solo WS in `inboxClients.get(receiverId)` raggiunti.
//   2. NO self-skip (il server garantisce che receiverId !== senderId).
//   3. WS con `readyState !== OPEN` skippato + cleanup speculare.
//   4. Payload: `{type:"inboxUpdate", conversationId, message}`.
//   5. Memory-safe: snapshot `[...]`, closed=count, Map pruning.
// ═════════════════════════════════════════════════════════════════
describe("deliverInboxUpdate — receiver's inbox", () => {
  it("returns zero deliveries when nobody is subscribed to inbox", () => {
    const cache = makeInboxCache({});
    const result = deliverInboxUpdate(cache, "user-B", makeEvent());
    expect(result).toEqual({ delivered: 0, closed: 0 });
  });

  it("delivers to receiver's inbox WS (single tab, single delivery)", () => {
    const wsA = makeWs({ userId: "user-A" });
    const wsB = makeWs({ userId: "user-B" });
    const cache = makeInboxCache({ "user-B": [wsB] });

    const result = deliverInboxUpdate(cache, "user-B", makeEvent());

    expect(result.delivered).toBe(1);
    expect(wsA.sent).toEqual([]); // A non è nel target inbox
    expect(wsB.sent).toHaveLength(1);

    const payload = JSON.parse(wsB.sent[0]);
    expect(payload).toMatchObject({
      type: "inboxUpdate",
      conversationId: "conv-A",
      message: { id: "msg-1", senderId: "user-A" },
    });
  });

  it("delivers to ALL inbox tabs of receiver (multi-tab)", () => {
    const wsB1 = makeWs({ userId: "user-B" });
    const wsB2 = makeWs({ userId: "user-B" });
    const wsB3 = makeWs({ userId: "user-B" });
    const cache = makeInboxCache({ "user-B": [wsB1, wsB2, wsB3] });

    const result = deliverInboxUpdate(cache, "user-B", makeEvent());

    expect(result.delivered).toBe(3);
    expect(wsB1.sent).toHaveLength(1);
    expect(wsB2.sent).toHaveLength(1);
    expect(wsB3.sent).toHaveLength(1);
  });

  it("does NOT deliver to other users' inbox (multi-user isolation)", () => {
    const wsA = makeWs({ userId: "user-A" });
    const wsBinbox = makeWs({ userId: "user-B" });
    const wsCinbox = makeWs({ userId: "user-C" });
    const cache = makeInboxCache({
      "user-A": [wsA],
      "user-B": [wsBinbox],
      "user-C": [wsCinbox],
    });

    // receiverId = user-B → solo wsBinbox riceve.
    const result = deliverInboxUpdate(cache, "user-B", makeEvent());
    expect(result.delivered).toBe(1);

    expect(wsA.sent).toEqual([]);
    expect(wsBinbox.sent).toHaveLength(1);
    expect(wsCinbox.sent).toEqual([]);
  });

  it("skips a closed WS and prunes when last is removed", () => {
    const wsBclosed = makeWs({ userId: "user-B", readyState: 3 });
    const cache = makeInboxCache({ "user-B": [wsBclosed] });

    const result = deliverInboxUpdate(cache, "user-B", makeEvent());
    expect(result.delivered).toBe(0);
    expect(wsBclosed.sent).toEqual([]);
    // WS closed ma non genera delete (è già filtrato dal readyState check)
    expect(cache.has("user-B")).toBe(true); // non rimosso perché non ho inviato
  });

  it("removes a WS whose send() throws + prunes empty inbox", () => {
    const wsBbroken = makeWs({
      userId: "user-B",
      throwOnSend: new Error("reset"),
    });
    const cache = makeInboxCache({ "user-B": [wsBbroken] });

    const result = deliverInboxUpdate(cache, "user-B", makeEvent());

    expect(result.delivered).toBe(0);
    expect(result.closed).toBe(1);
    expect(cache.has("user-B")).toBe(false);
  });

  it("continues delivering to other inbox WS after one throws", () => {
    const wsB1Broken = makeWs({
      userId: "user-B",
      throwOnSend: new Error("reset"),
    });
    const wsB2 = makeWs({ userId: "user-B" });
    const cache = makeInboxCache({ "user-B": [wsB1Broken, wsB2] });

    const result = deliverInboxUpdate(cache, "user-B", makeEvent());

    expect(result.delivered).toBe(1);
    expect(result.closed).toBe(1);
    expect(wsB2.sent).toHaveLength(1);
  });

  it("payload includes conversationId but NOT receiverId / productId (privacy)", () => {
    const wsB = makeWs({ userId: "user-B" });
    const cache = makeInboxCache({ "user-B": [wsB] });

    deliverInboxUpdate(
      cache,
      "user-B",
      makeEvent({
        conversationId: "conv-X",
        productId: "prod-secret",
        receiverId: "user-B",
      }),
    );

    const payload = JSON.parse(wsB.sent[0]);
    expect(payload.type).toBe("inboxUpdate");
    expect(payload.conversationId).toBe("conv-X");
    expect(payload.message).toBeDefined();
    expect(payload.message.id).toBe("msg-1");
    // Privacy: il client user-scope non deve sapere productId esplicito
    // (lo recupera via /api/conversations/[id] solo se ne ha bisogno).
    expect(payload.productId).toBeUndefined();
    expect(payload.receiverId).toBeUndefined();
  });
});
