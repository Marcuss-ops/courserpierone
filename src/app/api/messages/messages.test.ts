/**
 * Tests for GET /api/messages, POST /api/messages, and PATCH /api/messages/read.
 *
 * Phase 1.3 update: ogni DM è ora scoped a un prodotto. Tutti i test
 * passano productId nei body POST e nei query params GET.
 *
 * Phase 1.6 update: tutte le route passano per authorizeDmRequest(...)
 * → resolveMessagingPermission(...). Il mock di api-authorize qui sotto
 * controlla l'esito autorizzativo per ogni test (default: allowed=true).
 * I test che esercitano il deny usano mockAuthorizeDmRequest.mockResolvedValueOnce(...).
 *
 * Covers:
 *   GET   - auth required, missing param, self-chat blocked, 403 no conversation,
 *           cursor pagination, limit enforcement, productId obbligatorio,
 *           wiring del resolver (deny → 403 con reason)
 *   POST  - auth required, validation, auto-invio blocked,
 *           conversation creation with productId, message creation with sanitization,
 *           offline email notification logic,
 *           wiring del resolver
 *   PATCH - auth required, missing conversationId, 403 access denied,
 *           successful mark-as-read, only marks others' messages,
 *           wiring del resolver (lookup Conversation → derive productId → resolver)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

// ─── Mocks ────────────────────────────────────────────────────
// Fase 2.2: /api/messages/route.ts usa `findOrCreateConversation` da
// `@/lib/messaging/find-or-create-conversation`, che internamente usa
// `prisma.conversation.upsert(...)` invece di findUnique + create.
// I mock sotto riflettono la nuova path: upsert al posto di findUnique/create.
const mockPrisma = {
  conversation: {
    // GET route: findConversation usa findFirst (la query OR per coppia-prodotto)
    findFirst: vi.fn(),
    // POST route: findOrCreateConversation usa upsert (race-safe)
    upsert: vi.fn(),
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
  product: {
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

const PRODUCT_ID = "prod-test-1";
const OTHER_USER_ID = "user2";

const createRequest = (url: string, init?: RequestInit): NextRequest =>
  new Request(`http://localhost${url}`, init) as unknown as NextRequest;

// ─── Phase 1.6: mock authorizeDmRequest ────────────────────────
// Le route messages chiamano authorizeDmRequest(...) che internamente
// usa resolveMessagingPermission. Per evitare di propagare tutti i
// mock prisma nei test, mockiamo direttamente authorizeDmRequest.
// Default: allowed=true (i test storici continuano a funzionare con
// le asserzioni pre-fase-1.6). I test specifici del deny usano
// mockAuthorizeDmRequest.mockResolvedValueOnce(...).
const { mockAuthorizeDmRequest } = vi.hoisted(() => ({
  mockAuthorizeDmRequest: vi.fn(),
}));
vi.mock("@/lib/messaging/api-authorize", () => ({
  authorizeDmRequest: mockAuthorizeDmRequest,
}));
// Default: allowed=true con productId valorizzato (idempotente nei test)
function setDefaultAuthorizeAllowed() {
  mockAuthorizeDmRequest.mockReset();
  mockAuthorizeDmRequest.mockResolvedValue({
    allowed: true,
    permission: {
      allowed: true,
      creatorId: "creator-1",
      studentId: "user1",
      productId: PRODUCT_ID,
    },
  });
}
setDefaultAuthorizeAllowed();

// ─── Tests ────────────────────────────────────────────────────
describe("GET /api/messages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Phase 1.3: mock esistenza del prodotto di default
    mockPrisma.product.findUnique.mockResolvedValue({ id: PRODUCT_ID });
  });

  it("returns 401 when not authenticated", async () => {
    mockGetServerUser.mockResolvedValue({ user: null, dbUser: null });
    const { GET } = await import("./route");
    const res = await GET(createRequest(`/api/messages?with=${OTHER_USER_ID}&productId=${PRODUCT_ID}`));
    expect(res.status).toBe(401);
  });

  it("returns 400 when 'with' parameter is missing", async () => {
    mockAuth({ id: "user1", email: "a@test.com" });
    const { GET } = await import("./route");
    const res = await GET(createRequest(`/api/messages?productId=${PRODUCT_ID}`));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toBe("Parametro 'with' obbligatorio");
  });

  it("returns 400 when 'productId' parameter is missing", async () => {
    mockAuth({ id: "user1", email: "a@test.com" });
    const { GET } = await import("./route");
    const res = await GET(createRequest(`/api/messages?with=${OTHER_USER_ID}`));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toContain("productId");
  });

  it("returns 400 when trying to chat with self", async () => {
    mockAuth({ id: "user1", email: "a@test.com" });
    const { GET } = await import("./route");
    const res = await GET(createRequest(`/api/messages?with=user1&productId=${PRODUCT_ID}`));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toContain("te stesso");
  });

  it("returns 404 when other user does not exist", async () => {
    mockAuth({ id: "user1", email: "a@test.com" });
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(createRequest(`/api/messages?with=nonexistent&productId=${PRODUCT_ID}`));
    expect(res.status).toBe(404);
  });

  it("returns 403 when no conversation exists between users for product", async () => {
    mockAuth({ id: "user1", email: "a@test.com" });
    mockPrisma.user.findUnique.mockResolvedValue({ id: OTHER_USER_ID });
    mockPrisma.conversation.findFirst.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(createRequest(`/api/messages?with=${OTHER_USER_ID}&productId=${PRODUCT_ID}`));
    expect(res.status).toBe(403);
  });

  it("returns messages with cursor pagination", async () => {
    mockAuth({ id: "user1", email: "a@test.com" });
    mockPrisma.user.findUnique.mockResolvedValue({ id: OTHER_USER_ID });
    mockPrisma.conversation.findFirst.mockResolvedValue({ id: "conv1" });

    const msgs = Array.from({ length: 10 }, (_, i) => ({
      id: `msg${i}`,
      conversationId: "conv1",
      senderId: i % 2 === 0 ? "user1" : OTHER_USER_ID,
      content: `Message ${i}`,
      read: false,
      createdAt: new Date(),
      sender: { id: `sender${i}`, name: `User ${i}`, image: null, role: "student" },
    }));
    mockPrisma.message.findMany.mockResolvedValue(msgs);

    const { GET } = await import("./route");
    const res = await GET(createRequest(`/api/messages?with=${OTHER_USER_ID}&productId=${PRODUCT_ID}`));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.messages).toBeDefined();
    expect(body.nextCursor).toBeNull(); // only 10 messages, limit is 50+1
  });

  it("returns nextCursor when there are more messages", async () => {
    mockAuth({ id: "user1", email: "a@test.com" });
    mockPrisma.user.findUnique.mockResolvedValue({ id: OTHER_USER_ID });
    mockPrisma.conversation.findFirst.mockResolvedValue({ id: "conv1" });

    const msgs = Array.from({ length: 51 }, (_, i) => ({
      id: `msg${i}`,
      conversationId: "conv1",
      senderId: OTHER_USER_ID,
      content: `Message ${i}`,
      read: false,
      createdAt: new Date(),
      sender: { id: OTHER_USER_ID, name: "User 2", image: null, role: "student" },
    }));
    mockPrisma.message.findMany.mockResolvedValue(msgs);

    const { GET } = await import("./route");
    const res = await GET(createRequest(`/api/messages?with=${OTHER_USER_ID}&productId=${PRODUCT_ID}`));
    const body = await res.json();

    expect(body.nextCursor).not.toBeNull();
    expect(body.messages.length).toBe(50);
  });

  it("respects cursor parameter for pagination", async () => {
    mockAuth({ id: "user1", email: "a@test.com" });
    mockPrisma.user.findUnique.mockResolvedValue({ id: OTHER_USER_ID });
    mockPrisma.conversation.findFirst.mockResolvedValue({ id: "conv1" });

    mockPrisma.message.findMany.mockResolvedValue([
      {
        id: "old1",
        conversationId: "conv1",
        senderId: OTHER_USER_ID,
        content: "Old message",
        read: true,
        createdAt: new Date(),
        sender: { id: OTHER_USER_ID, name: "User 2", image: null, role: "student" },
      },
    ]);

    const { GET } = await import("./route");
    const res = await GET(createRequest(`/api/messages?with=${OTHER_USER_ID}&productId=${PRODUCT_ID}&cursor=msg50`));
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
    mockPrisma.user.findUnique.mockResolvedValue({ id: OTHER_USER_ID });
    mockPrisma.conversation.findFirst.mockResolvedValue({ id: "conv1" });
    mockPrisma.message.findMany.mockResolvedValue([]);

    const { GET } = await import("./route");
    await GET(createRequest(`/api/messages?with=${OTHER_USER_ID}&productId=${PRODUCT_ID}&limit=200`));

    // Should fetch limit+1 = 101 (max limit is 100)
    expect(mockPrisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 101 })
    );
  });

  it("passes productId to findConversation where clause", async () => {
    mockAuth({ id: "user1", email: "a@test.com" });
    mockPrisma.user.findUnique.mockResolvedValue({ id: OTHER_USER_ID });
    mockPrisma.conversation.findFirst.mockResolvedValue({ id: "conv1" });
    mockPrisma.message.findMany.mockResolvedValue([]);

    const { GET } = await import("./route");
    await GET(createRequest(`/api/messages?with=${OTHER_USER_ID}&productId=${PRODUCT_ID}`));

    // Verify productId filter applied (Phase 1.3)
    expect(mockPrisma.conversation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          productId: PRODUCT_ID,
          OR: expect.any(Array),
        }),
      })
    );
  });

  // ─── Phase 1.6: wiring del resolver su GET ──────────────────
  it("returns 403 when resolver denies (no_completed_order_for_student)", async () => {
    mockAuth({ id: "user1", email: "a@test.com" });
    const { NextResponse } = await import("next/server");
    mockAuthorizeDmRequest.mockResolvedValueOnce({
      allowed: false,
      permission: {
        allowed: false,
        productId: PRODUCT_ID,
        reason: "no_completed_order_for_student",
      },
      response: NextResponse.json(
        { error: "DM non autorizzata: ordine non completed", reason: "no_completed_order_for_student" },
        { status: 403 },
      ),
    });

    const { GET } = await import("./route");
    const res = await GET(createRequest(`/api/messages?with=${OTHER_USER_ID}&productId=${PRODUCT_ID}`));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.reason).toBe("no_completed_order_for_student");
    // La route NON deve aver proseguito verso la Conversation.findFirst
    // perché il wiring blocca a monte.
    expect(mockPrisma.conversation.findFirst).not.toHaveBeenCalled();
  });

  it("returns 403 when resolver denies (not_creator_student_pair)", async () => {
    mockAuth({ id: "user1", email: "a@test.com" });
    const { NextResponse } = await import("next/server");
    mockAuthorizeDmRequest.mockResolvedValueOnce({
      allowed: false,
      permission: {
        allowed: false,
        productId: PRODUCT_ID,
        reason: "not_creator_student_pair",
      },
      response: NextResponse.json(
        { error: "DM non autorizzata", reason: "not_creator_student_pair" },
        { status: 403 },
      ),
    });

    const { GET } = await import("./route");
    const res = await GET(createRequest(`/api/messages?with=${OTHER_USER_ID}&productId=${PRODUCT_ID}`));
    expect(res.status).toBe(403);
    expect(mockPrisma.conversation.findFirst).not.toHaveBeenCalled();
  });
});

describe("POST /api/messages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.product.findUnique.mockResolvedValue({ id: PRODUCT_ID });
  });

  it("returns 401 when not authenticated", async () => {
    mockGetServerUser.mockResolvedValue({ user: null, dbUser: null });
    const { POST } = await import("./route");
    const res = await POST(
      createRequest("/api/messages", {
        method: "POST",
        body: JSON.stringify({ receiverId: OTHER_USER_ID, content: "Hello", productId: PRODUCT_ID }),
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
        body: JSON.stringify({ receiverId: OTHER_USER_ID, productId: PRODUCT_ID }),
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
        body: JSON.stringify({ receiverId: OTHER_USER_ID, content: "   ", productId: PRODUCT_ID }),
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when productId is missing", async () => {
    mockAuth({ id: "user1", email: "a@test.com" });
    mockPrisma.user.findUnique.mockResolvedValue({ id: OTHER_USER_ID, email: "b@test.com", lastSeenAt: new Date() });
    const { POST } = await import("./route");
    const res = await POST(
      createRequest("/api/messages", {
        method: "POST",
        body: JSON.stringify({ receiverId: OTHER_USER_ID, content: "Hello" }),
      })
    );
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toContain("productId");
  });

  it("returns 400 when content exceeds 5000 chars", async () => {
    mockAuth({ id: "user1", email: "a@test.com" });
    const { POST } = await import("./route");
    const res = await POST(
      createRequest("/api/messages", {
        method: "POST",
        body: JSON.stringify({ receiverId: OTHER_USER_ID, content: "x".repeat(5001), productId: PRODUCT_ID }),
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
        body: JSON.stringify({ receiverId: "user1", content: "Hello", productId: PRODUCT_ID }),
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
        body: JSON.stringify({ receiverId: "ghost", content: "Hello", productId: PRODUCT_ID }),
      })
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when product does not exist (via resolver)", async () => {
    mockAuth({ id: "user1", email: "a@test.com" });
    mockPrisma.user.findUnique.mockResolvedValue({ id: OTHER_USER_ID, email: "b@test.com", lastSeenAt: null });
    mockPrisma.product.findUnique.mockResolvedValue(null);

    // Phase 1.6: il check "product esiste?" passa dal resolver.
    // Aggiornato il test per riflettere che api-authorize → resolveMessagingPermission
    // → ProductNotFound → 404 è il path canonico (nessun inline product.findUnique).
    const { NextResponse } = await import("next/server");
    mockAuthorizeDmRequest.mockResolvedValueOnce({
      allowed: false,
      permission: {
        allowed: false,
        productId: "ghost-prod",
        reason: "product_not_found",
      },
      response: NextResponse.json(
        { error: "Prodotto non trovato", reason: "product_not_found" },
        { status: 404 },
      ),
    });

    const { POST } = await import("./route");
    const res = await POST(
      createRequest("/api/messages", {
        method: "POST",
        body: JSON.stringify({ receiverId: OTHER_USER_ID, content: "Hello", productId: "ghost-prod" }),
      })
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.reason).toBe("product_not_found");
  });

  it("creates a new conversation if none exists (with productId, upsert path)", async () => {
    mockAuth({ id: "user1", email: "a@test.com" });
    mockPrisma.user.findUnique.mockResolvedValue({ id: OTHER_USER_ID, email: "b@test.com", lastSeenAt: new Date() });
    // Fase 2.2: upsert restituisce il Conversation (create o no-op update).
    mockPrisma.conversation.upsert.mockResolvedValue({ id: "newConv", productId: PRODUCT_ID });
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
        body: JSON.stringify({ receiverId: OTHER_USER_ID, content: "Hello!", productId: PRODUCT_ID }),
      })
    );

    expect(res.status).toBe(201);
    // Fase 2.2: l'helper usa upsert con chiave composita canonica.
    expect(mockPrisma.conversation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userOneId_userTwoId_productId: {
            userOneId: "user1",
            userTwoId: OTHER_USER_ID,
            productId: PRODUCT_ID,
          },
        },
        create: expect.objectContaining({ productId: PRODUCT_ID }),
      })
    );
    // Sanity: i vecchi metodi findUnique + create NON devono più essere chiamati.
    expect(mockPrisma.conversation.upsert).toHaveBeenCalledTimes(1);
  });

  it("uses composite key [userOneId, userTwoId, productId] for upsert", async () => {
    mockAuth({ id: "user1", email: "a@test.com" });
    mockPrisma.user.findUnique.mockResolvedValue({ id: OTHER_USER_ID, email: "b@test.com", lastSeenAt: new Date() });
    mockPrisma.conversation.upsert.mockResolvedValue({ id: "conv1" });
    mockPrisma.message.create.mockResolvedValue({
      id: "msg1",
      conversationId: "conv1",
      senderId: "user1",
      content: "Ciao!",
      read: false,
      createdAt: new Date(),
      sender: { id: "user1", name: "Mario", image: null, role: "student" },
    });
    mockPrisma.message.count.mockResolvedValue(1);

    const { POST } = await import("./route");
    await POST(
      createRequest("/api/messages", {
        method: "POST",
        body: JSON.stringify({ receiverId: OTHER_USER_ID, content: "Ciao!", productId: PRODUCT_ID }),
      })
    );

    expect(mockPrisma.conversation.upsert).toHaveBeenCalledWith({
      where: {
        userOneId_userTwoId_productId: {
          userOneId: "user1",
          userTwoId: OTHER_USER_ID,
          productId: PRODUCT_ID,
        },
      },
      create: expect.objectContaining({
        userOneId: "user1",
        userTwoId: OTHER_USER_ID,
        productId: PRODUCT_ID,
      }),
      update: {},
    });
  });

  it("upserts conversation regardless of which user is userOneId vs userTwoId (deterministic sort)", async () => {
    // Phase 1.3: ID ordinamento lessicografico (minId, maxId) per garantire
    // che la chiave composita funzioni indipendentemente dall'ordine di
    // passaggio dei due userId.
    //
    // I due userId usati nel confronto sono "z_high_id" e OTHER_USER_ID:
    // entrambi stringhe CUID sono time-prefixed, quindi il confronto
    // lessicografico byte-per-byte è deterministico e predicibile
    // (cuid monotonic prefix). Il test fallirebbe se in futuro Prisma
    // o User cambia ID gen a UUID v4 random, perché l'ordinamento
    // lessicografico non sarebbe più un proxy dell'ordine cronologico.
    // Mantenere CUID è quindi parte del contratto di Fase 1.3.
    //
    // Fase 2.2: la verifica passa da `findUnique` a `upsert` (helper
    // condiviso in lib/messaging). Il sort è lo stesso, ma il path è
    // `INSERT ... ON CONFLICT DO UPDATE` invece di findUnique + create.
    mockAuth({ id: "user1", email: "a@test.com" });
    mockPrisma.user.findUnique.mockResolvedValue({ id: OTHER_USER_ID, email: "b@test.com", lastSeenAt: new Date() });
    mockPrisma.conversation.upsert.mockResolvedValue({ id: "conv1" });
    mockPrisma.message.create.mockResolvedValue({
      id: "msg1",
      conversationId: "conv1",
      senderId: "user1",
      content: "Hello",
      read: false,
      createdAt: new Date(),
      sender: { id: "user1", name: "U", image: null, role: "student" },
    });
    mockPrisma.message.count.mockResolvedValue(1);

    const { POST } = await import("./route");
    // user1 < user2 → sort naturale come (user1, user2)
    await POST(
      createRequest("/api/messages", {
        method: "POST",
        body: JSON.stringify({ receiverId: OTHER_USER_ID, content: "Hello", productId: PRODUCT_ID }),
      })
    );

    expect(mockPrisma.conversation.upsert).toHaveBeenCalledWith({
      where: {
        userOneId_userTwoId_productId: {
          userOneId: "user1",
          userTwoId: OTHER_USER_ID,
          productId: PRODUCT_ID,
        },
      },
      create: expect.any(Object),
      update: {},
    });

    vi.clearAllMocks();
    mockAuth({ id: "z_high_id", email: "z@test.com" }); // z* > user2 → sort inverte
    mockPrisma.user.findUnique.mockResolvedValue({ id: OTHER_USER_ID, email: "b@test.com", lastSeenAt: new Date() });
    mockPrisma.conversation.upsert.mockResolvedValue({ id: "conv1" });
    mockPrisma.message.create.mockResolvedValue({
      id: "msg2",
      conversationId: "conv1",
      senderId: "z_high_id",
      content: "Hello",
      read: false,
      createdAt: new Date(),
      sender: { id: "z_high_id", name: "Z", image: null, role: "student" },
    });
    mockPrisma.message.count.mockResolvedValue(1);
    mockPrisma.product.findUnique.mockResolvedValue({ id: PRODUCT_ID });

    const { POST: POST2 } = await import("./route");
    await POST2(
      createRequest("/api/messages", {
        method: "POST",
        body: JSON.stringify({ receiverId: OTHER_USER_ID, content: "Hello", productId: PRODUCT_ID }),
      })
    );

    expect(mockPrisma.conversation.upsert).toHaveBeenCalledWith({
      where: {
        userOneId_userTwoId_productId: {
          userOneId: OTHER_USER_ID, // min(user2, z*)
          userTwoId: "z_high_id",    // max
          productId: PRODUCT_ID,
        },
      },
      create: expect.any(Object),
      update: {},
    });
  });

  it("creates message and returns it with sender info", async () => {
    mockAuth({ id: "user1", email: "a@test.com" });
    mockPrisma.user.findUnique.mockResolvedValue({ id: OTHER_USER_ID, email: "b@test.com", lastSeenAt: new Date() });
    mockPrisma.conversation.upsert.mockResolvedValue({ id: "conv1", productId: PRODUCT_ID });

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
        body: JSON.stringify({ receiverId: OTHER_USER_ID, content: "Ciao!", productId: PRODUCT_ID }),
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
      id: OTHER_USER_ID,
      email: "b@test.com",
      lastSeenAt: new Date(), // just now → online
    });
    mockPrisma.conversation.upsert.mockResolvedValue({ id: "conv1" });
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
        body: JSON.stringify({ receiverId: OTHER_USER_ID, content: "Hey", productId: PRODUCT_ID }),
      })
    );
    expect(res.status).toBe(201);
    // When online, the offline-email branch is never entered
    expect(mockSendDmNotificationEmail).not.toHaveBeenCalled();
  });

  it("sends email when receiver is offline and has ≤ 1 unread", async () => {
    mockAuth({ id: "user1", email: "a@test.com" });
    mockPrisma.user.findUnique.mockResolvedValue({
      id: OTHER_USER_ID,
      email: "b@test.com",
      lastSeenAt: new Date(Date.now() - 10 * 60 * 1000), // 10 min ago → offline
    });
    mockPrisma.conversation.upsert.mockResolvedValue({ id: "conv1" });
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
        body: JSON.stringify({ receiverId: OTHER_USER_ID, content: "Hello offline!", productId: PRODUCT_ID }),
      })
    );
    expect(res.status).toBe(201);
    // Cooldown check and email should both have been triggered
    expect(mockPrisma.message.count).toHaveBeenCalled();
    expect(mockSendDmNotificationEmail).toHaveBeenCalled();
  });

  // ─── Fase 5: lingua email — verifica che la chiamata includa
  // argomenti consistenti (email del receiver, displayName del sender,
  // e una lingua non hardcoded-così-com'è-rotto in futuro).
  // ─── Fase 5: lingua email — verifica che la chiamata includa
  // argomenti consistenti (email del receiver, displayName del sender,
  // e una lingua plausibile). NOTA: la route attualmente hardcoda "en"
  // come terzo argomento (TODO: derivare da dbUser.language / cookie).
  // Questo test è un contract-check: asserisce gli argomenti giusti
  // (sender/email + locale string), non la correttezza della selezione.
  // Per verificare la selezione dinamica sarebbe necessario prima fixare
  // la route a leggere la lingua dell'utente, poi aggiornare l'asserzione.
  it("calls sendDmNotificationEmail with email + senderName + locale", async () => {
    mockAuth({ id: "user1", email: "a@test.com", name: "Mario Rossi" });
    mockPrisma.user.findUnique.mockResolvedValue({
      id: OTHER_USER_ID,
      email: "b-receiver@test.com",
      lastSeenAt: new Date(Date.now() - 10 * 60 * 1000), // offline
    });
    mockPrisma.conversation.upsert.mockResolvedValue({ id: "conv1" });
    mockPrisma.message.create.mockResolvedValue({
      id: "msg1",
      conversationId: "conv1",
      senderId: "user1",
      content: "Ciao!",
      read: false,
      createdAt: new Date(),
      sender: { id: "user1", name: "Mario Rossi", image: null, role: "student" },
    });
    mockPrisma.message.count.mockResolvedValue(1);

    const { POST } = await import("./route");
    await POST(
      createRequest("/api/messages", {
        method: "POST",
        body: JSON.stringify({ receiverId: OTHER_USER_ID, content: "Ciao!", productId: PRODUCT_ID }),
      })
    );

    expect(mockSendDmNotificationEmail).toHaveBeenCalledTimes(1);
    const callArgs = mockSendDmNotificationEmail.mock.calls[0];
    // [0] = receiver email, [1] = senderName, [2] = locale
    expect(callArgs[0]).toBe("b-receiver@test.com");
    expect(callArgs[1]).toBe("Mario Rossi"); // dbUser.name
    expect(typeof callArgs[2]).toBe("string"); // locale — non hardcoded rotto
    expect(["en", "it", "es", "fr", "de", "pt"]).toContain(callArgs[2]);
  });

  it("falls back to email-local-part when sender has no displayName (offline branch)", async () => {
    // dbUser.name = null → fallback a email.split('@')[0] = "anonymous"
    mockAuth({ id: "user1", email: "anonymous@test.com" });
    mockPrisma.user.findUnique.mockResolvedValue({
      id: OTHER_USER_ID,
      email: "b@test.com",
      lastSeenAt: new Date(Date.now() - 10 * 60 * 1000),
    });
    mockPrisma.conversation.upsert.mockResolvedValue({ id: "conv1" });
    mockPrisma.message.create.mockResolvedValue({
      id: "msg1",
      conversationId: "conv1",
      senderId: "user1",
      content: "X",
      read: false,
      createdAt: new Date(),
      sender: { id: "user1", name: null, image: null, role: "student" },
    });
    mockPrisma.message.count.mockResolvedValue(1);

    const { POST } = await import("./route");
    await POST(
      createRequest("/api/messages", {
        method: "POST",
        body: JSON.stringify({ receiverId: OTHER_USER_ID, content: "X", productId: PRODUCT_ID }),
      })
    );

    expect(mockSendDmNotificationEmail.mock.calls[0][1]).toBe("anonymous");
  });

  it("skips email when receiver is offline but has > 1 unread (cooldown)", async () => {
    mockAuth({ id: "user1", email: "a@test.com" });
    mockPrisma.user.findUnique.mockResolvedValue({
      id: OTHER_USER_ID,
      email: "b@test.com",
      lastSeenAt: new Date(Date.now() - 10 * 60 * 1000), // offline
    });
    mockPrisma.conversation.upsert.mockResolvedValue({ id: "conv1" });
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
        body: JSON.stringify({ receiverId: OTHER_USER_ID, content: "Spam!", productId: PRODUCT_ID }),
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
      id: OTHER_USER_ID,
      email: null,
      lastSeenAt: new Date(Date.now() - 10 * 60 * 1000),
    });
    mockPrisma.conversation.upsert.mockResolvedValue({ id: "conv1" });
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
        body: JSON.stringify({ receiverId: OTHER_USER_ID, content: "Hey", productId: PRODUCT_ID }),
      })
    );
    expect(res.status).toBe(201);
    // No email should be sent when receiver has no email address
    expect(mockSendDmNotificationEmail).not.toHaveBeenCalled();
  });

  // ─── Phase 1.6: wiring del resolver su POST ──────────────────
  it("returns 403 when resolver denies POST (no_completed_order_for_student)", async () => {
    mockAuth({ id: "user1", email: "a@test.com" });
    const { NextResponse } = await import("next/server");
    mockAuthorizeDmRequest.mockResolvedValueOnce({
      allowed: false,
      permission: {
        allowed: false,
        productId: PRODUCT_ID,
        reason: "no_completed_order_for_student",
      },
      response: NextResponse.json(
        { error: "DM non autorizzata", reason: "no_completed_order_for_student" },
        { status: 403 },
      ),
    });

    const { POST } = await import("./route");
    const res = await POST(
      createRequest("/api/messages", {
        method: "POST",
        body: JSON.stringify({ receiverId: OTHER_USER_ID, content: "Hi", productId: PRODUCT_ID }),
      })
    );
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.reason).toBe("no_completed_order_for_student");
    // Verifica che la route NON abbia proseguito con user.findUnique,
    // conversation.findUnique, message.create, né emesso NEW_MESSAGE.
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.conversation.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.message.create).not.toHaveBeenCalled();
  });

  it("returns 403 when resolver denies POST (self_message_blocked)", async () => {
    mockAuth({ id: "user1", email: "a@test.com" });
    const { NextResponse } = await import("next/server");
    mockAuthorizeDmRequest.mockResolvedValueOnce({
      allowed: false,
      permission: {
        allowed: false,
        productId: PRODUCT_ID,
        reason: "self_message_blocked",
      },
      response: NextResponse.json(
        { error: "Non puoi inviare un messaggio a te stesso", reason: "self_message_blocked" },
        { status: 400 },
      ),
    });

    const { POST } = await import("./route");
    const res = await POST(
      createRequest("/api/messages", {
        method: "POST",
        body: JSON.stringify({ receiverId: OTHER_USER_ID, content: "Hi", productId: PRODUCT_ID }),
      })
    );
    // Importante: la status viene dal wrapper di api-authorize (400 per self),
    // non 403/200 hardcoded.
    expect(res.status).toBe(400);
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

  // ─── Phase 1.6: wiring del resolver su /api/messages/read ─────
  it("derives productId + partner from Conversation and consults resolver", async () => {
    mockAuth({ id: "user1", email: "a@test.com" });
    mockPrisma.conversation.findFirst.mockResolvedValue({
      id: "conv1",
      userOneId: "user1",
      userTwoId: OTHER_USER_ID,
      productId: PRODUCT_ID,
    });
    mockPrisma.message.updateMany.mockResolvedValue({ count: 5 });

    const { PATCH } = await import("./read/route");
    await PATCH(
      createRequest("/api/messages/read", {
        method: "PATCH",
        body: JSON.stringify({ conversationId: "conv1" }),
      })
    );

    // Quando user1 == conversation.userOneId, il partner è userTwoId.
    expect(mockAuthorizeDmRequest).toHaveBeenCalledWith({
      actorId: "user1",
      targetId: OTHER_USER_ID,
      productId: PRODUCT_ID,
    });
    expect(mockPrisma.message.updateMany).toHaveBeenCalled();
  });

  it("returns 403 when resolver denies /api/messages/read (no_completed_order_for_student)", async () => {
    mockAuth({ id: "user1", email: "a@test.com" });
    mockPrisma.conversation.findFirst.mockResolvedValue({
      id: "conv1",
      userOneId: OTHER_USER_ID, // user1 è userTwo (partner è userOne)
      userTwoId: "user1",
      productId: PRODUCT_ID,
    });
    const { NextResponse } = await import("next/server");
    mockAuthorizeDmRequest.mockResolvedValueOnce({
      allowed: false,
      permission: {
        allowed: false,
        productId: PRODUCT_ID,
        reason: "no_completed_order_for_student",
        creatorId: "creator-1",
        studentId: "user1",
      },
      response: NextResponse.json(
        { error: "DM non autorizzata", reason: "no_completed_order_for_student" },
        { status: 403 },
      ),
    });

    const { PATCH } = await import("./read/route");
    const res = await PATCH(
      createRequest("/api/messages/read", {
        method: "PATCH",
        body: JSON.stringify({ conversationId: "conv1" }),
      })
    );

    expect(res.status).toBe(403);
    // Partner correttamente derivato (user1=userTwoId, partner=userOneId=OTHER_USER_ID).
    expect(mockAuthorizeDmRequest).toHaveBeenCalledWith({
      actorId: "user1",
      targetId: OTHER_USER_ID,
      productId: PRODUCT_ID,
    });
    // updateMany NON deve essere chiamato se il resolver blocca.
    expect(mockPrisma.message.updateMany).not.toHaveBeenCalled();
  });
});
