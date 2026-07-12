import { describe, it, expect } from "vitest";
import {
  deliverNewMessage,
  type BroadcastSocketLike,
  type SubscribedConversationsCache,
} from "./broadcast";
import type { NewMessageEvent } from "./broker";

// ─── Test harness ───────────────────────────────────────────
// Build a fake WS that records `send` calls. `readyState` defaults to
// 1 (OPEN). `throwOnSend` simulates a dead socket.
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

// Helper per popolare la cache: converte un array di ws in una Map
// keyed per `conversationId`. I ws creati con `makeWs` non hanno
// `.conversationId` — è il mock server.ts a popolare la cache per-conv.
function makeCache(
  conversations: Record<string, BroadcastSocketLike[]>,
): SubscribedConversationsCache {
  const cache: SubscribedConversationsCache = new Map();
  for (const [convId, sockets] of Object.entries(conversations)) {
    cache.set(convId, new Set(sockets));
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

  // Nota: il test precedente "delivers to BOTH participants" aveva
  // titolo misleading e count inconsistente (`delivered === 1` ma due
  // wsA1/wsA2 ricevevano). Sostituito con uno scenario più chiaro
  // sotto ("delivers to a receiver across their own tabs"). Questo
  // scenario è già coperto; rimuoviamo il duplicato.
  it("delivers to BOTH participants on separate sockets (no self-skip)", () => {
    const wsA = makeWs({ userId: "user-A" });
    const wsB = makeWs({ userId: "user-B" });
    const cache = makeCache({ "conv-A": [wsA, wsB] });

    // B è sender, A è receiver (single tab). Verifica il path
    // fondamentale: 1 delivery a A, 0 a B (sender-skip).
    const result = deliverNewMessage(
      cache,
      makeEvent({ message: { ...baseMessage, senderId: "user-B" } }),
    );

    expect(result.delivered).toBe(1);
    expect(wsA.sent).toHaveLength(1); // tab di A (receiver) riceve
    expect(wsB.sent).toEqual([]); // sender (B) skip
  });

  it("delivers to both tabs of the receiver when sender has one tab", () => {
    const wsA = makeWs({ userId: "user-A" });
    const wsB1 = makeWs({ userId: "user-B" }); // desktop
    const wsB2 = makeWs({ userId: "user-B" }); // mobile
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
    // B è anche su conv-B (chat con user-C) — non deve ricevere msg di conv-A.
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
    expect(wsBinConvB.sent).toEqual([]); // B's tab on conv-B: NO leak
    expect(wsCinConvB.sent).toEqual([]);
  });
});

describe("deliverNewMessage — closed & broken sockets", () => {
  it("skips a WS whose readyState is not OPEN", () => {
    const wsA = makeWs({ userId: "user-A" });
    const wsBclosed = makeWs({ userId: "user-B", readyState: 3 }); // CLOSED
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
    // Setup che verifica effettivamente la caduta della Map key: tutti
    // i subscribers broken (sender NON è subscribed qui — es. è già
    // disconnesso o è il lato REST dell'emit). Dopo l'iter, ogni ws è
    // rimosso nel catch, il Set si svuota, e cache.delete libera la
    // Map entry.
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

    expect(result.delivered).toBe(1); // wsB2
    expect(result.closed).toBe(1); // wsB1Broken
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

  it("self-skip is strct by senderId, not by socket identity", () => {
    // Tre ws dello stesso user (sender): tutti skippano.
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
