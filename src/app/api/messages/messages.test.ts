/**
 * Tests for GET /api/messages, POST /api/messages, and PATCH /api/messages/read.
 *
 * Covers:
 *   GET   - auth required, missing param, self-chat blocked, 403 no conversation,
 *           cursor pagination, limit enforcement
 *   POST  - auth required, validation, auto-invio blocked,
 *           conversation creation, message creation with sanitization,
 *           offline email notification logic
 *   PATCH - auth required, missing conversationId, 403 access denied,
 *           successful mark-as-read, only marks others' messages
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

// ─── Mocks ────────────────────────────────────────────────────
const mockPrisma = {
  conversation: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
  },
  message: {
    findMany: vi.fn(),
    create: vi.fn(),
    count: vi.fn(),
    updateMany: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
  },
};

vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));

const mockGetServerUser = vi.fn();
vi.mock("@/lib/supabase/get-user", () => ({ getServerUser: mockGetServerUser }));

vi.mock("@/lib/utils/rate-limit", () => ({
  withRateLimit: (fn: Function) => fn,
}));

vi.mock("@/lib/utils/sanitize", () => ({
  sanitizeHtml: (s: string) => s,
}));

vi.mock("@/lib/ws/broker", () => ({
  messageBroker: { emit: vi.fn() },
  NEW_MESSAGE: "newMessage",
}));

const mockSendDmNotificationEmail = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/services/email", () => ({
  sendDmNotificationEmail: mockSendDmNotificationEmail,
}));

// ─── Helpers ──────────────────────────────────────────────────
const mockAuth = (dbUser: { id: string; email: string }) => {
  mockGetServerUser.mockResolvedValue({
    user: { email: dbUser.email },
    dbUser,
  });
};

const createRequest = (url: string, init?: RequestInit): NextRequest =>
  new Request(`http://localhost${url}`, init) as unknown as NextRequest;

// ─── Tests ────────────────────────────────────────────────────
describe("GET /api/messages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetServerUser.mockResolvedValue({ user: null, dbUser: null });
    const { GET } = await import("./route");
    const res = await GET(createRequest("/api/messages?with=user2"));
    expect(res.status).toBe(401);
  });

  it("returns 400 when 'with' parameter is missing", async () => {
    mockAuth({ id: "user1", email: "a@test.com" });
    const { GET } = await import("./route");
    const res = await GET(createRequest("/api/messages"));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toBe("Parametro 'with' obbligatorio");
  });

  it("returns 400 when trying to chat with self", async () => {
    mockAuth({ id: "user1", email: "a@test.com" });
    const { GET } = await import("./route");
    const res = await GET(createRequest("/api/messages?with=user1"));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toContain("te stesso");
  });

  it("returns 404 when other user does not exist", async () => {
    mockAuth({ id: "user1", email: "a@test.com" });
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(createRequest("/api/messages?with=nonexistent"));
    expect(res.status).toBe(404);
  });

  it("returns 403 when no conversation exists between users", async () => {
    mockAuth({ id: "user1", email: "a@test.com" });
    mockPrisma.user.findUnique.mockResolvedValue({ id: "user2" });
    mockPrisma.conversation.findFirst.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(createRequest("/api/messages?with=user2"));
    expect(res.status).toBe(403);
  });

  it("returns messages with cursor pagination", async () => {
    mockAuth({ id: "user1", email: "a@test.com" });
    mockPrisma.user.findUnique.mockResolvedValue({ id: "user2" });
    mockPrisma.conversation.findFirst.mockResolvedValue({ id: "conv1" });

    const msgs = Array.from({ length: 10 }, (_, i) => ({
      id: `msg${i}`,
      conversationId: "conv1",
      senderId: i % 2 === 0 ? "user1" : "user2",
      content: `Message ${i}`,
      read: false,
      createdAt: new Date(),
      sender: { id: `sender${i}`, name: `User ${i}`, image: null, role: "student" },
    }));
    mockPrisma.message.findMany.mockResolvedValue(msgs);

    const { GET } = await import("./route");
    const res = await GET(createRequest("/api/messages?with=user2"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.messages).toBeDefined();
    expect(body.nextCursor).toBeNull(); // only 10 messages, limit is 50+1
  });

  it("returns nextCursor when there are more messages", async () => {
    mockAuth({ id: "user1", email: "a@test.com" });
    mockPrisma.user.findUnique.mockResolvedValue({ id: "user2" });
    mockPrisma.conversation.findFirst.mockResolvedValue({ id: "conv1" });

    const msgs = Array.from({ length: 51 }, (_, i) => ({
      id: `msg${i}`,
      conversationId: "conv1",
      senderId: "user2",
      content: `Message ${i}`,
      read: false,
      createdAt: new Date(),
      sender: { id: "user2", name: "User 2", image: null, role: "student" },
    }));
    mockPrisma.message.findMany.mockResolvedValue(msgs);

    const { GET } = await import("./route");
    const res = await GET(createRequest("/api/messages?with=user2"));
    const body = await res.json();

    expect(body.nextCursor).not.toBeNull();
    expect(body.messages.length).toBe(50);
  });

  it("respects cursor parameter for pagination", async () => {
    mockAuth({ id: "user1", email: "a@test.com" });
    mockPrisma.user.findUnique.mockResolvedValue({ id: "user2" });
    mockPrisma.conversation.findFirst.mockResolvedValue({ id: "conv1" });

    mockPrisma.message.findMany.mockResolvedValue([
      {
        id: "old1",
        conversationId: "conv1",
        senderId: "user2",
        content: "Old message",
        read: true,
        createdAt: new Date(),
        sender: { id: "user2", name: "User 2", image: null, role: "student" },
      },
    ]);

    const { GET } = await import("./route");
    const res = await GET(createRequest("/api/messages?with=user2&cursor=msg50"));
    expect(res.status).toBe(200);

    // Verify cursor was passed to prisma
    expect(mockPrisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { lt: "msg50" } }),
      })
    );
  });

  it("enforces max limit of 100", async () => {
    mockAuth({ id: "user1", email: "a@test.com" });
    mockPrisma.user.findUnique.mockResolvedValue({ id: "user2" });
    mockPrisma.conversation.findFirst.mockResolvedValue({ id: "conv1" });
    mockPrisma.message.findMany.mockResolvedValue([]);

    const { GET } = await import("./route");
    await GET(createRequest("/api/messages?with=user2&limit=200"));

    // Should fetch limit+1 = 101 (max limit is 100)
    expect(mockPrisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 101 })
    );
  });
});

describe("POST /api/messages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetServerUser.mockResolvedValue({ user: null, dbUser: null });
    const { POST } = await import("./route");
    const res = await POST(
      createRequest("/api/messages", {
        method: "POST",
        body: JSON.stringify({ receiverId: "user2", content: "Hello" }),
      })
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when content is missing", async () => {
    mockAuth({ id: "user1", email: "a@test.com" });
    const { POST } = await import("./route");
    const res = await POST(
      createRequest("/api/messages", {
        method: "POST",
        body: JSON.stringify({ receiverId: "user2" }),
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when content is empty", async () => {
    mockAuth({ id: "user1", email: "a@test.com" });
    const { POST } = await import("./route");
    const res = await POST(
      createRequest("/api/messages", {
        method: "POST",
        body: JSON.stringify({ receiverId: "user2", content: "   " }),
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when content exceeds 5000 chars", async () => {
    mockAuth({ id: "user1", email: "a@test.com" });
    const { POST } = await import("./route");
    const res = await POST(
      createRequest("/api/messages", {
        method: "POST",
        body: JSON.stringify({ receiverId: "user2", content: "x".repeat(5001) }),
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when trying to message self", async () => {
    mockAuth({ id: "user1", email: "a@test.com" });
    const { POST } = await import("./route");
    const res = await POST(
      createRequest("/api/messages", {
        method: "POST",
        body: JSON.stringify({ receiverId: "user1", content: "Hello" }),
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when receiver does not exist", async () => {
    mockAuth({ id: "user1", email: "a@test.com" });
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(
      createRequest("/api/messages", {
        method: "POST",
        body: JSON.stringify({ receiverId: "ghost", content: "Hello" }),
      })
    );
    expect(res.status).toBe(404);
  });

  it("creates a new conversation if none exists", async () => {
    mockAuth({ id: "user1", email: "a@test.com" });
    mockPrisma.user.findUnique.mockResolvedValue({ id: "user2", email: "b@test.com", lastSeenAt: new Date() });
    // No existing conversation
    mockPrisma.conversation.findUnique.mockResolvedValue(null);
    mockPrisma.conversation.create.mockResolvedValue({ id: "newConv" });
    mockPrisma.message.create.mockResolvedValue({
      id: "msg1",
      conversationId: "newConv",
      senderId: "user1",
      content: "Hello!",
      read: false,
      createdAt: new Date(),
      sender: { id: "user1", name: "User 1", image: null, role: "student" },
    });
    mockPrisma.message.count.mockResolvedValue(1);

    const { POST } = await import("./route");
    const res = await POST(
      createRequest("/api/messages", {
        method: "POST",
        body: JSON.stringify({ receiverId: "user2", content: "Hello!" }),
      })
    );

    expect(res.status).toBe(201);
    expect(mockPrisma.conversation.create).toHaveBeenCalled();
  });

  it("creates message and returns it with sender info", async () => {
    mockAuth({ id: "user1", email: "a@test.com" });
    mockPrisma.user.findUnique.mockResolvedValue({ id: "user2", email: "b@test.com", lastSeenAt: new Date() });
    mockPrisma.conversation.findUnique.mockResolvedValue({ id: "conv1" });

    const createdMsg = {
      id: "msg1",
      conversationId: "conv1",
      senderId: "user1",
      content: "Ciao!",
      read: false,
      createdAt: new Date(),
      sender: { id: "user1", name: "Mario", image: null, role: "student" },
    };
    mockPrisma.message.create.mockResolvedValue(createdMsg);
    mockPrisma.message.count.mockResolvedValue(1);

    const { POST } = await import("./route");
    const res = await POST(
      createRequest("/api/messages", {
        method: "POST",
        body: JSON.stringify({ receiverId: "user2", content: "Ciao!" }),
      })
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.message).toBeDefined();
    expect(body.message.content).toBe("Ciao!");
    expect(body.message.sender.id).toBe("user1");
  });

  it("does not send email when receiver is online (lastSeenAt < 5 min)", async () => {
    mockAuth({ id: "user1", email: "a@test.com" });
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "user2",
      email: "b@test.com",
      lastSeenAt: new Date(), // just now → online
    });
    mockPrisma.conversation.findUnique.mockResolvedValue({ id: "conv1" });
    mockPrisma.message.create.mockResolvedValue({
      id: "msg1",
      conversationId: "conv1",
      senderId: "user1",
      content: "Hey",
      read: false,
      createdAt: new Date(),
      sender: { id: "user1", name: "User 1", image: null, role: "student" },
    });

    const { POST } = await import("./route");
    const res = await POST(
      createRequest("/api/messages", {
        method: "POST",
        body: JSON.stringify({ receiverId: "user2", content: "Hey" }),
      })
    );
    expect(res.status).toBe(201);
    // When online, the offline-email branch is never entered
    expect(mockSendDmNotificationEmail).not.toHaveBeenCalled();
  });

  it("sends email when receiver is offline and has ≤ 1 unread", async () => {
    mockAuth({ id: "user1", email: "a@test.com" });
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "user2",
      email: "b@test.com",
      lastSeenAt: new Date(Date.now() - 10 * 60 * 1000), // 10 min ago → offline
    });
    mockPrisma.conversation.findUnique.mockResolvedValue({ id: "conv1" });
    mockPrisma.message.create.mockResolvedValue({
      id: "msg1",
      conversationId: "conv1",
      senderId: "user1",
      content: "Hello offline!",
      read: false,
      createdAt: new Date(),
      sender: { id: "user1", name: "User 1", image: null, role: "student" },
    });
    mockPrisma.message.count.mockResolvedValue(1); // ≤ 1 → should send

    const { POST } = await import("./route");
    const res = await POST(
      createRequest("/api/messages", {
        method: "POST",
        body: JSON.stringify({ receiverId: "user2", content: "Hello offline!" }),
      })
    );
    expect(res.status).toBe(201);
    // Cooldown check and email should both have been triggered
    expect(mockPrisma.message.count).toHaveBeenCalled();
    expect(mockSendDmNotificationEmail).toHaveBeenCalled();
  });

  it("skips email when receiver is offline but has > 1 unread (cooldown)", async () => {
    mockAuth({ id: "user1", email: "a@test.com" });
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "user2",
      email: "b@test.com",
      lastSeenAt: new Date(Date.now() - 10 * 60 * 1000), // offline
    });
    mockPrisma.conversation.findUnique.mockResolvedValue({ id: "conv1" });
    mockPrisma.message.create.mockResolvedValue({
      id: "msg1",
      conversationId: "conv1",
      senderId: "user1",
      content: "Spam!",
      read: false,
      createdAt: new Date(),
      sender: { id: "user1", name: "User 1", image: null, role: "student" },
    });
    mockPrisma.message.count.mockResolvedValue(5); // > 1 → cooldown active, skip email

    const { POST } = await import("./route");
    const res = await POST(
      createRequest("/api/messages", {
        method: "POST",
        body: JSON.stringify({ receiverId: "user2", content: "Spam!" }),
      })
    );
    expect(res.status).toBe(201);
    // Count was checked but email was NOT sent (cooldown)
    expect(mockPrisma.message.count).toHaveBeenCalled();
    expect(mockSendDmNotificationEmail).not.toHaveBeenCalled();
  });

  it("skips email when receiver has no email address", async () => {
    mockAuth({ id: "user1", email: "a@test.com" });
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "user2",
      email: null,
      lastSeenAt: new Date(Date.now() - 10 * 60 * 1000),
    });
    mockPrisma.conversation.findUnique.mockResolvedValue({ id: "conv1" });
    mockPrisma.message.create.mockResolvedValue({
      id: "msg1",
      conversationId: "conv1",
      senderId: "user1",
      content: "Hey",
      read: false,
      createdAt: new Date(),
      sender: { id: "user1", name: "User 1", image: null, role: "student" },
    });
    mockPrisma.message.count.mockResolvedValue(1);

    const { POST } = await import("./route");
    const res = await POST(
      createRequest("/api/messages", {
        method: "POST",
        body: JSON.stringify({ receiverId: "user2", content: "Hey" }),
      })
    );
    expect(res.status).toBe(201);
    // No email should be sent when receiver has no email address
    expect(mockSendDmNotificationEmail).not.toHaveBeenCalled();
  });
});

// ── PATCH /api/messages/read tests ───────────────────────────
describe("PATCH /api/messages/read", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetServerUser.mockResolvedValue({ user: null, dbUser: null });
    const { PATCH } = await import("./read/route");
    const res = await PATCH(
      createRequest("/api/messages/read", {
        method: "PATCH",
        body: JSON.stringify({ conversationId: "conv1" }),
      })
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when conversationId is missing", async () => {
    mockAuth({ id: "user1", email: "a@test.com" });
    const { PATCH } = await import("./read/route");
    const res = await PATCH(
      createRequest("/api/messages/read", {
        method: "PATCH",
        body: JSON.stringify({}),
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 403 when conversation does not belong to user", async () => {
    mockAuth({ id: "user1", email: "a@test.com" });
    mockPrisma.conversation.findFirst.mockResolvedValue(null);
    const { PATCH } = await import("./read/route");
    const res = await PATCH(
      createRequest("/api/messages/read", {
        method: "PATCH",
        body: JSON.stringify({ conversationId: "conv1" }),
      })
    );
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.error).toContain("accesso negato");
  });

  it("marks messages as read and returns count", async () => {
    mockAuth({ id: "user1", email: "a@test.com" });
    mockPrisma.conversation.findFirst.mockResolvedValue({ id: "conv1" });
    mockPrisma.message.updateMany.mockResolvedValue({ count: 5 });

    const { PATCH } = await import("./read/route");
    const res = await PATCH(
      createRequest("/api/messages/read", {
        method: "PATCH",
        body: JSON.stringify({ conversationId: "conv1" }),
      })
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.count).toBe(5);
  });

  it("only marks others' messages as read, not own", async () => {
    mockAuth({ id: "user1", email: "a@test.com" });
    mockPrisma.conversation.findFirst.mockResolvedValue({ id: "conv1" });
    mockPrisma.message.updateMany.mockResolvedValue({ count: 3 });

    const { PATCH } = await import("./read/route");
    await PATCH(
      createRequest("/api/messages/read", {
        method: "PATCH",
        body: JSON.stringify({ conversationId: "conv1" }),
      })
    );

    // Verify the updateMany call excludes user's own messages
    expect(mockPrisma.message.updateMany).toHaveBeenCalledWith({
      where: {
        conversationId: "conv1",
        senderId: { not: "user1" },
        read: false,
      },
      data: { read: true },
    });
  });

  it("returns 200 even when no messages to mark", async () => {
    mockAuth({ id: "user1", email: "a@test.com" });
    mockPrisma.conversation.findFirst.mockResolvedValue({ id: "conv1" });
    mockPrisma.message.updateMany.mockResolvedValue({ count: 0 });

    const { PATCH } = await import("./read/route");
    const res = await PATCH(
      createRequest("/api/messages/read", {
        method: "PATCH",
        body: JSON.stringify({ conversationId: "conv1" }),
      })
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.count).toBe(0);
  });
});
