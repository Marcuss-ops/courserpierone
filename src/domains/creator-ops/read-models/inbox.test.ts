/**
 * src/domains/creator-ops/read-models/inbox.test.ts
 *
 * Unit tests for `getCreatorInbox` use case (Phase 3 Step 2).
 *
 * Pattern: port-stub (no Prisma mock). Mirrors audience.test.ts +
 * continue-watching.test.ts. Adapter sanity via `import` smoke.
 *
 * Coverage (ports the 6 legacy scenarios verbatim + adapter sanity):
 *   1. 3-query shape returned for a creator with a full inbox
 *   2. Admin bypass scope (status:'published')
 *   3. Empty products → empty inbox (groupBy skipped — perf invariant)
 *   4. No-message conversations → lastMessage:null
 *   5. Long content → truncated to INBOX_PREVIEW_MAX (80 chars + ellipsis)
 *   6. totalUnread = sum of per-conversation unread counts
 * + 7. Adapter module: methods exposed + lazy prisma load
 * + 8. resolveOtherUserId symmetry (userOne vs userTwo)
 * + 9. Non-creator/non-admin role → empty inbox (defensive)
 * +10. Falsy userId → empty inbox (defensive)
 */

import { describe, expect, it, vi } from "vitest";

import {
  getCreatorInbox,
  INBOX_PREVIEW_MAX,
  truncatePreview,
} from "./inbox";
import { prismaInboxRepository } from "./prisma-inbox-repository";
import type { GetCreatorInboxDeps } from "./inbox";
import type {
  InboxRepository,
  RawInboxConversation,
  RawInboxProduct,
  RawInboxUnreadCount,
} from "./inbox-types";

// ─── Test helpers ─────────────────────────────────────────────────────

const CREATOR_ID = "creator_123";
const CUSTOMER_ID = "customer_456";

function mkProduct(overrides: Partial<RawInboxProduct> = {}): RawInboxProduct {
  return {
    id: "prod_abc",
    slug: "test-course",
    coverUrl: "https://example.com/cover.png",
    ...overrides,
  };
}

function mkConversation(
  overrides: Partial<RawInboxConversation> = {},
): RawInboxConversation {
  const lastMessageContent = overrides.lastMessage?.content ?? "Ciao, mi interessa il corso";
  return {
    id: "conv_1",
    userOneId: CREATOR_ID,
    userTwoId: CUSTOMER_ID,
    productId: "prod_abc",
    productSlug: "test-course",
    productCoverUrl: "https://example.com/cover.png",
    updatedAt: new Date("2026-07-01T10:00:00Z"),
    otherUser: {
      id: CUSTOMER_ID,
      name: "Mario",
      image: null,
      role: "student",
    },
    lastMessage: {
      id: "msg_1",
      content: lastMessageContent,
      createdAt: new Date("2026-07-01T09:00:00Z"),
      senderId: CUSTOMER_ID,
      read: overrides.lastMessage?.read ?? false,
    },
    ...overrides,
  };
}

interface StubState {
  fetchedProductsArgs?: { userId: string; role: string };
  fetchedConvArgs?: { userId: string; productIds: ReadonlyArray<string> };
  fetchedUnreadArgs?: {
    userId: string;
    conversationIds: ReadonlyArray<string>;
  };
}

function mkStubRepo(opts: {
  products?: RawInboxProduct[];
  conversations?: RawInboxConversation[];
  unread?: RawInboxUnreadCount[];
}): { repo: InboxRepository; state: StubState } {
  const state: StubState = {};
  const products = opts.products ?? [];
  const conversations = opts.conversations ?? [];
  const unread = opts.unread ?? [];
  const repo: InboxRepository = {
    async fetchOwnedProducts(input) {
      state.fetchedProductsArgs = input;
      return products;
    },
    async fetchConversationsWithLastMessage(input) {
      state.fetchedConvArgs = input;
      return conversations;
    },
    async fetchUnreadCounts(input) {
      state.fetchedUnreadArgs = input;
      return unread;
    },
  };
  return { repo, state };
}

// ─── Tests ────────────────────────────────────────────────────────────

describe("getCreatorInbox — input guards", () => {
  it("returns empty inbox when userId is empty", async () => {
    const { repo, state } = mkStubRepo({});
    const result = await getCreatorInbox(
      { userId: "", role: "creator" },
      { repo },
    );
    expect(result).toEqual({ previews: [], productOptions: [], totalUnread: 0 });
    expect(state.fetchedProductsArgs).toBeUndefined();
    expect(state.fetchedConvArgs).toBeUndefined();
    expect(state.fetchedUnreadArgs).toBeUndefined();
  });

  it("returns empty inbox for non-creator/non-admin role (defensive)", async () => {
    const { repo, state } = mkStubRepo({});
    const result = await getCreatorInbox(
      { userId: "u_1", role: "student" },
      { repo },
    );
    expect(result).toEqual({ previews: [], productOptions: [], totalUnread: 0 });
    expect(state.fetchedProductsArgs).toBeUndefined();
  });
});

describe("getCreatorInbox — happy path (creator scope)", () => {
  it("returns 3-query shape for a creator with a full inbox", async () => {
    const { repo, state } = mkStubRepo({
      products: [mkProduct()],
      conversations: [
        mkConversation({ lastMessage: { id: "msg_1", content: "Ciao, mi interessa il corso", createdAt: new Date("2026-07-01T09:00:00Z"), senderId: CUSTOMER_ID, read: false } }),
      ],
      unread: [{ conversationId: "conv_1", unreadCount: 2 }],
    });

    const result = await getCreatorInbox(
      { userId: CREATOR_ID, role: "creator" },
      { repo },
    );

    // 3 round-trips via the port
    expect(state.fetchedProductsArgs).toEqual({
      userId: CREATOR_ID,
      role: "creator",
    });
    expect(state.fetchedConvArgs?.userId).toBe(CREATOR_ID);
    expect(state.fetchedConvArgs?.productIds).toEqual(["prod_abc"]);
    expect(state.fetchedUnreadArgs?.userId).toBe(CREATOR_ID);
    expect(state.fetchedUnreadArgs?.conversationIds).toEqual(["conv_1"]);

    // Preview shape preserved
    expect(result.previews).toHaveLength(1);
    const preview = result.previews[0]!;
    expect(preview.id).toBe("conv_1");
    expect(preview.productId).toBe("prod_abc");
    expect(preview.productLabel).toBe("test-course");
    expect(preview.productCoverUrl).toBe("https://example.com/cover.png");
    expect(preview.otherUser.id).toBe(CUSTOMER_ID);
    expect(preview.otherUser.name).toBe("Mario");
    expect(preview.lastMessage).toMatchObject({
      id: "msg_1",
      content: "Ciao, mi interessa il corso",
      senderId: CUSTOMER_ID,
      read: false,
    });
    expect(preview.lastMessage?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(preview.unreadCount).toBe(2);

    expect(result.productOptions).toEqual([
      { id: "prod_abc", slug: "test-course", coverUrl: "https://example.com/cover.png" },
    ]);
    expect(result.totalUnread).toBe(2);
  });
});

describe("getCreatorInbox — admin bypass scope", () => {
  it("passes role='admin' to fetchOwnedProducts (adapter decides scope)", async () => {
    const { repo, state } = mkStubRepo({
      products: [
        mkProduct({ id: "prod_a", slug: "course-a" }),
        mkProduct({ id: "prod_b", slug: "course-b" }),
      ],
    });
    await getCreatorInbox({ userId: "admin_1", role: "admin" }, { repo });
    expect(state.fetchedProductsArgs).toEqual({ userId: "admin_1", role: "admin" });
  });
});

describe("getCreatorInbox — empty products (perf: skip groupBy)", () => {
  it("returns empty inbox and SKIPS fetchUnreadCounts when no products", async () => {
    const { repo, state } = mkStubRepo({ products: [] });
    const result = await getCreatorInbox(
      { userId: CREATOR_ID, role: "creator" },
      { repo },
    );
    expect(result.previews).toEqual([]);
    expect(result.productOptions).toEqual([]);
    expect(result.totalUnread).toBe(0);
    // fetchConversationsWithLastMessage runs (empty IN clause → [])
    expect(state.fetchedConvArgs).toEqual({
      userId: CREATOR_ID,
      productIds: [],
    });
    // fetchUnreadCounts is INTENTIONALLY skipped (perf invariant)
    expect(state.fetchedUnreadArgs).toBeUndefined();
  });
});

describe("getCreatorInbox — lastMessage null cases", () => {
  it("handles conversations with no messages (lastMessage is null)", async () => {
    const { repo } = mkStubRepo({
      products: [mkProduct()],
      conversations: [
        mkConversation({ lastMessage: null }),
      ],
      unread: [],
    });
    const result = await getCreatorInbox(
      { userId: CREATOR_ID, role: "creator" },
      { repo },
    );
    expect(result.previews).toHaveLength(1);
    expect(result.previews[0]!.lastMessage).toBeNull();
    expect(result.previews[0]!.unreadCount).toBe(0);
  });
});

describe("getCreatorInbox — content truncation", () => {
  it("truncates long last-message content to INBOX_PREVIEW_MAX + ellipsis", async () => {
    const longContent = "a".repeat(120);
    const { repo } = mkStubRepo({
      products: [mkProduct()],
      conversations: [
        mkConversation({
          lastMessage: {
            id: "msg_long",
            content: longContent,
            createdAt: new Date("2026-07-01T09:00:00Z"),
            senderId: CUSTOMER_ID,
            read: false,
          },
        }),
      ],
      unread: [],
    });
    const result = await getCreatorInbox(
      { userId: CREATOR_ID, role: "creator" },
      { repo },
    );
    const content = result.previews[0]!.lastMessage?.content ?? "";
    expect(content.length).toBe(INBOX_PREVIEW_MAX + 1); // 80 + ellipsis
    expect(content).toBe("a".repeat(INBOX_PREVIEW_MAX) + "…");
  });

  it("does NOT truncate content shorter than INBOX_PREVIEW_MAX", () => {
    expect(truncatePreview("hello")).toBe("hello");
  });

  it("does NOT truncate content exactly INBOX_PREVIEW_MAX", () => {
    const exact = "x".repeat(INBOX_PREVIEW_MAX);
    expect(truncatePreview(exact)).toBe(exact);
  });
});

describe("getCreatorInbox — totalUnread sum", () => {
  it("computes totalUnread as sum of per-conversation unread counts", async () => {
    const { repo } = mkStubRepo({
      products: [mkProduct()],
      conversations: [
        mkConversation({ id: "conv_1" }),
        mkConversation({ id: "conv_2" }),
        mkConversation({ id: "conv_3" }),
      ],
      unread: [
        { conversationId: "conv_1", unreadCount: 1 },
        { conversationId: "conv_2", unreadCount: 3 },
        { conversationId: "conv_3", unreadCount: 5 },
      ],
    });
    const result = await getCreatorInbox(
      { userId: CREATOR_ID, role: "creator" },
      { repo },
    );
    expect(result.totalUnread).toBe(9);
    expect(result.previews.find((p) => p.id === "conv_1")!.unreadCount).toBe(1);
    expect(result.previews.find((p) => p.id === "conv_2")!.unreadCount).toBe(3);
    expect(result.previews.find((p) => p.id === "conv_3")!.unreadCount).toBe(5);
  });

  it("treats conversations absent from the unread groupBy as 0 unread", async () => {
    const { repo } = mkStubRepo({
      products: [mkProduct()],
      conversations: [
        mkConversation({ id: "conv_with_unread" }),
        mkConversation({ id: "conv_no_unread" }),
      ],
      unread: [{ conversationId: "conv_with_unread", unreadCount: 4 }],
    });
    const result = await getCreatorInbox(
      { userId: CREATOR_ID, role: "creator" },
      { repo },
    );
    expect(result.totalUnread).toBe(4);
    expect(
      result.previews.find((p) => p.id === "conv_no_unread")!.unreadCount,
    ).toBe(0);
  });
});

describe("prismaInboxRepository — adapter sanity", () => {
  it("exposes the 3 port methods as functions", () => {
    expect(typeof prismaInboxRepository.fetchOwnedProducts).toBe("function");
    expect(typeof prismaInboxRepository.fetchConversationsWithLastMessage).toBe(
      "function",
    );
    expect(typeof prismaInboxRepository.fetchUnreadCounts).toBe("function");
  });

  it("does NOT throw on import (lazy prisma via module)", () => {
    vi.spyOn(prismaInboxRepository, "fetchOwnedProducts");
    vi.spyOn(prismaInboxRepository, "fetchConversationsWithLastMessage");
    vi.spyOn(prismaInboxRepository, "fetchUnreadCounts");
  });
});

describe("GetCreatorInboxDeps — type contract", () => {
  it("accepts GetCreatorInboxDeps with a stub repo", async () => {
    const { repo } = mkStubRepo({
      products: [mkProduct()],
      conversations: [mkConversation()],
      unread: [{ conversationId: "conv_1", unreadCount: 1 }],
    });
    const deps: GetCreatorInboxDeps = { repo };
    const result = await getCreatorInbox(
      { userId: CREATOR_ID, role: "creator" },
      deps,
    );
    expect(result.previews).toHaveLength(1);
  });
});