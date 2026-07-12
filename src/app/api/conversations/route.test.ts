/**
 * Tests for GET /api/conversations (Phase 2.1 del piano DMs).
 *
 * Covers:
 *   - 401 if not authenticated
 *   - 200 with empty list if no conversations
 *   - 200 with single conversation (otherUser resolved correctly)
 *   - 200 with multiple conversations (different products)
 *   - unreadCount via groupBy
 *   - lastMessage preview truncation
 *   - ordering by updatedAt desc
 *   - product shape {id, slug}
 *   - otherUser = the participant that is NOT me
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

// ─── Mocks ────────────────────────────────────────────────────
const mockPrisma = {
  conversation: {
    findMany: vi.fn(),
  },
  message: {
    groupBy: vi.fn(),
  },
  user: {},
  product: {},
};

vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));

const mockGetServerUser = vi.fn();
vi.mock("@/lib/supabase/get-user", () => ({ getServerUser: mockGetServerUser }));

vi.mock("@/lib/utils/rate-limit", () => ({
  withRateLimit: (fn: Function) => fn,
}));

// ─── Helpers ──────────────────────────────────────────────────
const mockAuth = (dbUser: { id: string; email: string; name?: string | null }) => {
  mockGetServerUser.mockResolvedValue({
    user: { email: dbUser.email },
    dbUser,
  });
};

const SELF = "self-1";
const OTHER_A = "other-a";
const OTHER_B = "other-b";
const PRODUCT_A = "prod-A";
const PRODUCT_B = "prod-B";

const createRequest = (url: string): NextRequest =>
  new Request(`http://localhost${url}`) as unknown as NextRequest;

// ─── Tests ────────────────────────────────────────────────────
describe("GET /api/conversations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // default: nessuna conversazione, mock groupBy che NON è mai chiamato
    mockPrisma.conversation.findMany.mockResolvedValue([]);
    mockPrisma.message.groupBy.mockResolvedValue([]);
  });

  it("returns 401 when not authenticated", async () => {
    mockGetServerUser.mockResolvedValue({ user: null, dbUser: null });
    const { GET } = await import("./route");
    const res = await GET(createRequest("/api/conversations"));
    expect(res.status).toBe(401);
  });

  it("returns empty list when user has no conversations", async () => {
    mockAuth({ id: SELF, email: "self@test.com" });
    const { GET } = await import("./route");
    const res = await GET(createRequest("/api/conversations"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.conversations).toEqual([]);
  });

  it("returns the conversation where SELF is userOne with OTHER as userTwo", async () => {
    mockAuth({ id: SELF, email: "self@test.com" });
    mockPrisma.conversation.findMany.mockResolvedValue([
      {
        id: "conv1",
        userOneId: SELF,
        userTwoId: OTHER_A,
        productId: PRODUCT_A,
        createdAt: new Date("2025-01-01T10:00:00Z"),
        updatedAt: new Date("2025-01-02T10:00:00Z"),
        userOne: { id: SELF, name: "Self", image: null, role: "admin" },
        userTwo: { id: OTHER_A, name: "Alice", image: "/alice.png", role: "student" },
        product: { id: PRODUCT_A, slug: "corso-a" },
        messages: [
          {
            id: "m-1",
            content: "Ciao Alice",
            createdAt: new Date("2025-01-02T09:00:00Z"),
            senderId: SELF,
            read: true,
          },
        ],
      },
    ]);
    mockPrisma.message.groupBy.mockResolvedValue([]);

    const { GET } = await import("./route");
    const res = await GET(createRequest("/api/conversations"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.conversations).toHaveLength(1);
    const item = body.conversations[0];

    expect(item.id).toBe("conv1");
    expect(item.product).toEqual({ id: PRODUCT_A, slug: "corso-a" });
    // otherUser = the participant that is NOT me
    expect(item.otherUser.id).toBe(OTHER_A);
    expect(item.otherUser.name).toBe("Alice");
    expect(item.otherUser.image).toBe("/alice.png");
    expect(item.otherUser.role).toBe("student");
    // lastMessage exists
    expect(item.lastMessage).toBeTruthy();
    expect(item.lastMessage.content).toBe("Ciao Alice");
    expect(item.lastMessage.senderId).toBe(SELF);
    expect(item.lastMessage.read).toBe(true);
    // ISO createdAt
    expect(typeof item.lastMessage.createdAt).toBe("string");
    // No unread
    expect(item.unreadCount).toBe(0);
  });

  it("resolves otherUser when SELF is userTwo (flip the conditional)", async () => {
    mockAuth({ id: SELF, email: "self@test.com" });
    mockPrisma.conversation.findMany.mockResolvedValue([
      {
        id: "conv1",
        userOneId: OTHER_B, // OTHER è userOne
        userTwoId: SELF,    // SELF è userTwo
        productId: PRODUCT_B,
        createdAt: new Date(),
        updatedAt: new Date(),
        userOne: { id: OTHER_B, name: "Bob", image: null, role: "creator" },
        userTwo: { id: SELF, name: "Self", image: null, role: "admin" },
        product: { id: PRODUCT_B, slug: "corso-b" },
        messages: [],
      },
    ]);
    mockPrisma.message.groupBy.mockResolvedValue([]);

    const { GET } = await import("./route");
    const res = await GET(createRequest("/api/conversations"));
    const body = await res.json();

    // otherUser deve essere OTHER_B (non SELF)
    expect(body.conversations[0].otherUser.id).toBe(OTHER_B);
    expect(body.conversations[0].otherUser.name).toBe("Bob");
    expect(body.conversations[0].lastMessage).toBeNull();
  });

  it("returns multiple conversations for different products", async () => {
    mockAuth({ id: SELF, email: "self@test.com" });
    mockPrisma.conversation.findMany.mockResolvedValue([
      {
        id: "conv-A",
        userOneId: SELF,
        userTwoId: OTHER_A,
        productId: PRODUCT_A,
        userOne: { id: SELF, name: null, image: null, role: "admin" },
        userTwo: { id: OTHER_A, name: "A", image: null, role: "student" },
        product: { id: PRODUCT_A, slug: "corso-a" },
        messages: [
          { id: "m-1", content: "Hello", createdAt: new Date(), senderId: SELF, read: true },
        ],
      },
      {
        id: "conv-B",
        userOneId: OTHER_B,
        userTwoId: SELF,
        productId: PRODUCT_B,
        userOne: { id: OTHER_B, name: "B", image: null, role: "creator" },
        userTwo: { id: SELF, name: null, image: null, role: "admin" },
        product: { id: PRODUCT_B, slug: "corso-b" },
        messages: [
          { id: "m-2", content: "Question", createdAt: new Date(), senderId: OTHER_B, read: false },
        ],
      },
    ]);
    mockPrisma.message.groupBy.mockResolvedValue([
      { conversationId: "conv-A", _count: { id: 0 } },
      { conversationId: "conv-B", _count: { id: 3 } },
    ]);

    const { GET } = await import("./route");
    const res = await GET(createRequest("/api/conversations"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.conversations).toHaveLength(2);
    const byId = Object.fromEntries(body.conversations.map((c: any) => [c.id, c]));
    expect(byId["conv-A"].otherUser.id).toBe(OTHER_A);
    expect(byId["conv-A"].unreadCount).toBe(0);
    expect(byId["conv-B"].otherUser.id).toBe(OTHER_B);
    expect(byId["conv-B"].unreadCount).toBe(3);
  });

  it("filters conversations only where SELF is a participant", async () => {
    mockAuth({ id: SELF, email: "self@test.com" });
    mockPrisma.conversation.findMany.mockResolvedValue([]);

    const { GET } = await import("./route");
    await GET(createRequest("/api/conversations"));

    expect(mockPrisma.conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({ userOneId: SELF }),
            expect.objectContaining({ userTwoId: SELF }),
          ]),
        }),
        orderBy: { updatedAt: "desc" },
      })
    );
  });

  it("truncates long lastMessage content to PREVIEW_MAX", async () => {
    mockAuth({ id: SELF, email: "self@test.com" });
    const longContent = "a".repeat(200); // >> 80
    mockPrisma.conversation.findMany.mockResolvedValue([
      {
        id: "conv1",
        userOneId: SELF,
        userTwoId: OTHER_A,
        productId: PRODUCT_A,
        userOne: { id: SELF, name: null, image: null, role: "admin" },
        userTwo: { id: OTHER_A, name: "A", image: null, role: "student" },
        product: { id: PRODUCT_A, slug: "corso-a" },
        messages: [
          { id: "m-1", content: longContent, createdAt: new Date(), senderId: SELF, read: false },
        ],
      },
    ]);
    mockPrisma.message.groupBy.mockResolvedValue([{ conversationId: "conv1", _count: { id: 1 } }]);

    const { GET } = await import("./route");
    const res = await GET(createRequest("/api/conversations"));
    const body = await res.json();

    // 80 char preview + ellipsis
    expect(body.conversations[0].lastMessage.content.length).toBe(81); // 80 chars + '…'
    expect(body.conversations[0].lastMessage.content.endsWith("…")).toBe(true);
    expect(body.conversations[0].unreadCount).toBe(1);
  });

  it("does not query groupBy when there are zero conversations", async () => {
    mockAuth({ id: SELF, email: "self@test.com" });
    mockPrisma.conversation.findMany.mockResolvedValue([]);

    const { GET } = await import("./route");
    await GET(createRequest("/api/conversations"));

    expect(mockPrisma.message.groupBy).not.toHaveBeenCalled();
  });

  it("returns lastMessage=null and unreadCount=0 when conversation has no messages yet (null-path branch)", async () => {
    // Casi reali in cui si attiva: conversation appena creata da POST
    // (prima che il client scriva il primo messaggio). Path fail-mode
    // più probabile in produzione → coperto da test esplicito.
    mockAuth({ id: SELF, email: "self@test.com" });
    mockPrisma.conversation.findMany.mockResolvedValue([
      {
        id: "conv-empty",
        userOneId: SELF,
        userTwoId: OTHER_A,
        productId: PRODUCT_A,
        createdAt: new Date(),
        updatedAt: new Date(),
        userOne: { id: SELF, name: null, image: null, role: "admin" },
        userTwo: { id: OTHER_A, name: "A", image: null, role: "student" },
        product: { id: PRODUCT_A, slug: "corso-a" },
        messages: [], // nessun messaggio ancora
      },
    ]);
    mockPrisma.message.groupBy.mockResolvedValue([]);

    const { GET } = await import("./route");
    const res = await GET(createRequest("/api/conversations"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.conversations).toHaveLength(1);
    expect(body.conversations[0].lastMessage).toBeNull();
    expect(body.conversations[0].unreadCount).toBe(0);
  });
});
