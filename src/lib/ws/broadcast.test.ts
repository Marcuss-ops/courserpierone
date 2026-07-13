import { describe, it, expect } from "vitest";
import {
  deliverNewMessage,
  deliverInboxUpdate,
  deliverThreadDeleted,
  type BroadcastSocketLike,
  type SubscribedConversationsCache,
  type InboxClientsCache,
} from "./broadcast";
import type { NewMessageEvent, ThreadDeletedEvent } from "./broker";

// ─── Helpers ─────────────────────────────────────────────────
const OPEN = 1;

function makeSocket(userId: string, sendImpl?: (s: string) => void): BroadcastSocketLike & {
  sentPayloads: string[];
} {
  const sent: string[] = [];
  return {
    userId,
    readyState: OPEN,
    sentPayloads: sent,
    send: sendImpl ?? ((s: string) => sent.push(s)),
  };
}

const BASE_MESSAGE: NewMessageEvent = {
  conversationId: "conv-1",
  productId: "prod-1",
  receiverId: "user-b",
  message: {
    id: "msg-1",
    conversationId: "conv-1",
    senderId: "user-a",
    content: "Hello",
    read: false,
    createdAt: "2026-07-12T00:00:00.000Z",
    sender: { id: "user-a", name: "Alice", image: null, role: "creator" },
  },
};

// ─── deliverNewMessage (Fase 4.1) ────────────────────────────
describe("deliverNewMessage", () => {
  it("delivers to all subscribers except the sender", () => {
    const conv: SubscribedConversationsCache = new Map();
    const wsA = makeSocket("user-a");
    const wsB = makeSocket("user-b");
    const wsC = makeSocket("user-c"); // unrelated third WS (not subbed to conv-1)
    conv.set("conv-1", new Set([wsA, wsB]));
    conv.set("conv-2", new Set([wsC]));

    const result = deliverNewMessage(conv, BASE_MESSAGE);
    expect(result.delivered).toBe(1);
    expect(wsA.sentPayloads).toHaveLength(0); // sender skipped
    expect(wsB.sentPayloads).toHaveLength(1);
    expect(wsC.sentPayloads).toHaveLength(0); // different conv
    const payload = JSON.parse(wsB.sentPayloads[0]);
    expect(payload.type).toBe("newMessage");
    expect(payload.conversationId).toBe("conv-1");
  });

  it("returns zero delivered when no subscribers", () => {
    const conv: SubscribedConversationsCache = new Map();
    const result = deliverNewMessage(conv, BASE_MESSAGE);
    expect(result).toEqual({ delivered: 0, closed: 0 });
  });

  it("cleans up closed sockets and prunes empty Map entries", () => {
    // The test verifies the empty-Set→Map-prune invariant. We must
    // NOT include the sender in the Set here: `deliverNewMessage`
    // self-skips the sender (`continue`, no Set.delete), so the Set
    // would still contain them after the loop, and the prune branch
    // would never fire. The correct fixture is "only non-sender
    // subscribers, exactly one of which is closed": after the throw
    // and the Set.delete, the Set becomes empty, and the Map entry
    // is pruned.
    const conv: SubscribedConversationsCache = new Map();
    const closingWs = makeSocket("user-b", () => {
      throw new Error("WS closed");
    });
    conv.set("conv-1", new Set([closingWs]));

    const result = deliverNewMessage(conv, BASE_MESSAGE);
    expect(result.closed).toBe(1);
    expect(result.delivered).toBe(0);
    expect(conv.has("conv-1")).toBe(false); // pruned because empty
  });
});

// ─── deliverInboxUpdate (Fase 4.3) ──────────────────────────
describe("deliverInboxUpdate", () => {
  it("delivers to ALL subscribers of receiver inbox (no self-skip)", () => {
    const inbox: InboxClientsCache = new Map();
    const wsA = makeSocket("user-a"); // sender
    const wsB1 = makeSocket("user-b");
    const wsB2 = makeSocket("user-b");
    inbox.set("user-a", new Set([wsA]));
    inbox.set("user-b", new Set([wsB1, wsB2]));

    const result = deliverInboxUpdate(inbox, "user-b", BASE_MESSAGE);
    expect(result.delivered).toBe(2);
    expect(wsA.sentPayloads).toHaveLength(0); // sender NOT in receiverId channel
    expect(wsB1.sentPayloads).toHaveLength(1);
    expect(wsB2.sentPayloads).toHaveLength(1);
    const payload = JSON.parse(wsB1.sentPayloads[0]);
    expect(payload.type).toBe("inboxUpdate");
  });
});

// ─── deliverThreadDeleted (Phase 2.3) ───────────────────────
describe("deliverThreadDeleted", () => {
  const event: ThreadDeletedEvent = {
    conversationId: "conv-1",
    userOneId: "user-a",
    userTwoId: "user-b",
  };

  it("fan-outs to conversation subscribers AND both inbox cache slots", () => {
    const conv: SubscribedConversationsCache = new Map();
    const inbox: InboxClientsCache = new Map();
    const wsAConv = makeSocket("user-a");
    const wsBConv = makeSocket("user-b");
    const wsAInbox = makeSocket("user-a");
    const wsBInbox = makeSocket("user-b");
    conv.set("conv-1", new Set([wsAConv, wsBConv]));
    inbox.set("user-a", new Set([wsAInbox]));
    inbox.set("user-b", new Set([wsBInbox]));

    const result = deliverThreadDeleted(conv, inbox, event);
    // 2 chat subscribers + 2 inbox subscribers = 4 delivered, 0 closed
    expect(result).toEqual({ delivered: 4, closed: 0 });

    expect(wsAConv.sentPayloads).toHaveLength(1);
    expect(wsBConv.sentPayloads).toHaveLength(1);
    expect(wsAInbox.sentPayloads).toHaveLength(1);
    expect(wsBInbox.sentPayloads).toHaveLength(1);

    const payload = JSON.parse(wsAConv.sentPayloads[0]);
    expect(payload).toEqual({ type: "threadDeleted", conversationId: "conv-1" });
  });

  it("does NOT skip the deleter — both participants receive the event", () => {
    // The deleter (user-a) is subscribed to the conversation they just
    // closed. They must receive confirmation to close their own UI.
    const conv: SubscribedConversationsCache = new Map();
    const inbox: InboxClientsCache = new Map();
    const wsADeleter = makeSocket("user-a");
    const _conv = conv.set("conv-1", new Set([wsADeleter]));

    const result = deliverThreadDeleted(conv, inbox, event);
    expect(result.delivered).toBe(1);
    expect(wsADeleter.sentPayloads).toHaveLength(1);
  });

  it("is no-op (delivered=0) when neither cache has subscribers", () => {
    const conv: SubscribedConversationsCache = new Map();
    const inbox: InboxClientsCache = new Map();
    const result = deliverThreadDeleted(conv, inbox, event);
    expect(result).toEqual({ delivered: 0, closed: 0 });
  });

  it("delivers to conversation subscribers even if inbox has no entries", () => {
    const conv: SubscribedConversationsCache = new Map();
    const inbox: InboxClientsCache = new Map();
    const wsAConv = makeSocket("user-a");
    conv.set("conv-1", new Set([wsAConv]));

    const result = deliverThreadDeleted(conv, inbox, event);
    expect(result.delivered).toBe(1);
    expect(wsAConv.sentPayloads).toHaveLength(1);
  });

  it("cleans up non-OPEN WS and prunes empty cache entries on send throws", () => {
    const conv: SubscribedConversationsCache = new Map();
    const inbox: InboxClientsCache = new Map();
    const wsConv = makeSocket("user-a", () => {
      throw new Error("WS closed");
    });
    const wsInbox = makeSocket("user-b", () => {
      throw new Error("WS closed");
    });
    conv.set("conv-1", new Set([wsConv]));
    inbox.set("user-b", new Set([wsInbox]));

    const result = deliverThreadDeleted(conv, inbox, event);
    expect(result.closed).toBe(2);
    expect(result.delivered).toBe(0);
    expect(conv.has("conv-1")).toBe(false);
    expect(inbox.has("user-b")).toBe(false);
  });
});
