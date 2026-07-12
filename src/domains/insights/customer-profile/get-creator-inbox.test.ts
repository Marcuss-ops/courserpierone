import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock dependencies BEFORE importing the service ─────────
vi.mock("@/lib/db/prisma", () => {
  const mockPrisma = {
    product: {
      findMany: vi.fn(),
    },
    conversation: {
      findMany: vi.fn(),
    },
    message: {
      groupBy: vi.fn(),
    },
  };
  return { prisma: mockPrisma };
});

import { prisma } from "@/lib/db/prisma";
import { getCreatorInbox } from "./get-creator-inbox";

// ─── Helpers ───────────────────────────────────────────────
function resetMocks() {
  vi.clearAllMocks();
}

function buildConversationRow(overrides: Partial<{
  id: string;
  userOneId: string;
  userTwoId: string;
  productId: string;
  productSlug: string;
  lastMessageContent: string | null;
  lastMessageRead: boolean;
}> = {}) {
  return {
    id: overrides.id ?? "conv_1",
    userOneId: overrides.userOneId ?? "creator_123",
    userTwoId: overrides.userTwoId ?? "customer_456",
    productId: overrides.productId ?? "prod_abc",
    updatedAt: new Date("2026-07-01T10:00:00Z"),
    userOne: { id: "creator_123", name: "Creator", image: null, role: "creator" },
    userTwo: { id: "customer_456", name: "Mario", image: null, role: "student" },
    product: {
      id: overrides.productId ?? "prod_abc",
      slug: overrides.productSlug ?? "test-course",
      coverUrl: "https://example.com/cover.png",
    },
    messages: overrides.lastMessageContent
      ? [
          {
            id: "msg_1",
            content: overrides.lastMessageContent,
            createdAt: new Date("2026-07-01T09:00:00Z"),
            senderId: "customer_456",
            read: overrides.lastMessageRead ?? false,
          },
        ]
      : [],
  };
}

// ─── Tests ─────────────────────────────────────────────────

describe("getCreatorInbox", () => {
  beforeEach(resetMocks);

  it("returns 3-query shape for a creator with a full inbox", async () => {
    // 1 product owned by the creator
    vi.mocked(prisma.product.findMany).mockResolvedValue([
      { id: "prod_abc", slug: "test-course", coverUrl: "https://example.com/cover.png" },
    ] as never);

    // 1 conversation on that product, with a last message
    vi.mocked(prisma.conversation.findMany).mockResolvedValue([
      buildConversationRow({ lastMessageContent: "Ciao, mi interessa il corso" }),
    ] as never);

    // 2 unread messages in that conversation
    vi.mocked(prisma.message.groupBy).mockResolvedValue([
      { conversationId: "conv_1", _count: { id: 2 } },
    ] as never);

    const result = await getCreatorInbox({
      id: "creator_123",
      role: "creator",
    });

    // 3 round-trips (products + conversations + groupBy)
    expect(prisma.product.findMany).toHaveBeenCalledOnce();
    expect(prisma.conversation.findMany).toHaveBeenCalledOnce();
    expect(prisma.message.groupBy).toHaveBeenCalledOnce();

    // Creator scope: where: { creatorId: user.id }
    expect(prisma.product.findMany).toHaveBeenCalledWith({
      where: { creatorId: "creator_123" },
      select: { id: true, slug: true, coverUrl: true },
    });

    // Preview shape
    expect(result.previews).toHaveLength(1);
    const preview = result.previews[0];
    expect(preview.id).toBe("conv_1");
    expect(preview.productId).toBe("prod_abc");
    expect(preview.productLabel).toBe("test-course");
    expect(preview.productCoverUrl).toBe("https://example.com/cover.png");
    expect(preview.otherUser.id).toBe("customer_456"); // the non-creator
    expect(preview.otherUser.name).toBe("Mario");
    expect(preview.lastMessage).toMatchObject({
      id: "msg_1",
      content: "Ciao, mi interessa il corso",
      senderId: "customer_456",
      read: false,
    });
    expect(preview.lastMessage?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO string
    expect(preview.unreadCount).toBe(2);

    // Product options
    expect(result.productOptions).toEqual([
      { id: "prod_abc", slug: "test-course", coverUrl: "https://example.com/cover.png" },
    ]);

    // Total unread
    expect(result.totalUnread).toBe(2);
  });

  it("scopes to all published products for admin (creatorId bypass)", async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([
      { id: "prod_a", slug: "course-a", coverUrl: null },
      { id: "prod_b", slug: "course-b", coverUrl: null },
    ] as never);
    vi.mocked(prisma.conversation.findMany).mockResolvedValue([]);
    vi.mocked(prisma.message.groupBy).mockResolvedValue([]);

    await getCreatorInbox({ id: "admin_1", role: "admin" });

    // Admin scope: where: { status: 'published' }
    expect(prisma.product.findMany).toHaveBeenCalledWith({
      where: { status: "published" },
      select: { id: true, slug: true, coverUrl: true },
    });
  });

  it("returns an empty result when the creator owns no products", async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([]);
    vi.mocked(prisma.conversation.findMany).mockResolvedValue([]);
    vi.mocked(prisma.message.groupBy).mockResolvedValue([]);

    const result = await getCreatorInbox({
      id: "creator_no_products",
      role: "creator",
    });

    expect(result.previews).toEqual([]);
    expect(result.productOptions).toEqual([]);
    expect(result.totalUnread).toBe(0);

    // The conversation query runs (with an empty `IN` clause, Prisma
    // returns []). The groupBy is INTENTIONALLY SKIPPED when there
    // are no conversations (`conversationIds.length > 0` guard in the
    // service) — this is a perf optimization, not an N+1. We assert
    // the guard fires correctly: groupBy must NOT be called.
    expect(prisma.conversation.findMany).toHaveBeenCalledOnce();
    expect(prisma.message.groupBy).not.toHaveBeenCalled();
  });

  it("handles conversations with no messages (lastMessage is null)", async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([
      { id: "prod_abc", slug: "test-course", coverUrl: null },
    ] as never);
    vi.mocked(prisma.conversation.findMany).mockResolvedValue([
      buildConversationRow({ lastMessageContent: null }),
    ] as never);
    vi.mocked(prisma.message.groupBy).mockResolvedValue([]);

    const result = await getCreatorInbox({
      id: "creator_123",
      role: "creator",
    });

    expect(result.previews).toHaveLength(1);
    expect(result.previews[0].lastMessage).toBeNull();
    expect(result.previews[0].unreadCount).toBe(0);
  });

  it("truncates long last-message content to PREVIEW_MAX (80) chars", async () => {
    const longContent = "a".repeat(120); // 120 chars, > PREVIEW_MAX

    vi.mocked(prisma.product.findMany).mockResolvedValue([
      { id: "prod_abc", slug: "test-course", coverUrl: null },
    ] as never);
    vi.mocked(prisma.conversation.findMany).mockResolvedValue([
      buildConversationRow({ lastMessageContent: longContent }),
    ] as never);
    vi.mocked(prisma.message.groupBy).mockResolvedValue([]);

    const result = await getCreatorInbox({
      id: "creator_123",
      role: "creator",
    });

    // Content is sliced to PREVIEW_MAX (80) chars + the ellipsis
    expect(result.previews[0].lastMessage?.content).toBe("a".repeat(80) + "…");
    expect(result.previews[0].lastMessage?.content.length).toBe(81);
  });

  it("computes totalUnread as the sum of all per-conversation unread counts", async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([
      { id: "prod_abc", slug: "test-course", coverUrl: null },
    ] as never);
    vi.mocked(prisma.conversation.findMany).mockResolvedValue([
      buildConversationRow({ id: "conv_1" }),
      buildConversationRow({ id: "conv_2" }),
      buildConversationRow({ id: "conv_3" }),
    ] as never);
    vi.mocked(prisma.message.groupBy).mockResolvedValue([
      { conversationId: "conv_1", _count: { id: 1 } },
      { conversationId: "conv_2", _count: { id: 3 } },
      { conversationId: "conv_3", _count: { id: 5 } },
    ] as never);

    const result = await getCreatorInbox({
      id: "creator_123",
      role: "creator",
    });

    expect(result.totalUnread).toBe(9);
    expect(result.previews.find((p) => p.id === "conv_1")?.unreadCount).toBe(1);
    expect(result.previews.find((p) => p.id === "conv_2")?.unreadCount).toBe(3);
    expect(result.previews.find((p) => p.id === "conv_3")?.unreadCount).toBe(5);
  });
});
