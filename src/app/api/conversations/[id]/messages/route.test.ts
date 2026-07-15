/**
 * Tests for GET /api/conversations/[id]/messages (Fase 2.3 del piano DMs).
 *
 * NOTA: per isolare il flow business delle route, mockiamo direttamente
 * `loadAuthorizedConversation` (helper Fase 2.3). I test del HELPER
 * stesso (mock Prisma + authorizeDmRequest reali) sono responsabilità di
 * `src/lib/messaging/load-authorized-conversation.test.ts`.
 *
 * Cobertura:
 *  - auth required (401)
 *  - conversationId mancante → 400 (validation error dall'helper)
 *  - Conversation inesistente → 404 (NotFoundError dall'helper)
 *  - Non membro → 403 (membership precheck)
 *  - Resolver deny (Order refundato retroattivamente) → 403 propagato
 *  - Happy path: GET list con cursor pagination + limit cap
 *  - Happy path: POST crea Message, emette NEW_MESSAGE con receiverId
 *  - POST: offline email fired iff lastSeenAt > 5min + unread ≤ 1
 *  - POST: auto-messaggio bloccato (se Conversation fosse malformata)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

// ─── Mocks ────────────────────────────────────────────────────
const mockPrisma = {
  conversation: { findUnique: vi.fn() },
  message: { findMany: vi.fn(), create: vi.fn(), count: vi.fn() },
  user: { findUnique: vi.fn() },
};

vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));

const mockGetServerUser = vi.fn();
vi.mock("@/lib/supabase/get-user", () => ({ getServerUser: mockGetServerUser }));

vi.mock("@/lib/utils/rate-limit", () => ({
  // AUTH tier (GET) e MESSAGES tier (POST) entrambi no-op nei test.
  withRateLimit: (fn: (...args: unknown[]) => unknown) => fn,
}));

vi.mock("@/lib/utils/sanitize", () => ({
  sanitizeHtml: (s: string) => s,
}));

// C3 cleanup: il mock di @/lib/ws/broker è stato rimosso insieme a
// server.ts + src/lib/ws/* (la route POST non chiama più
// messageBroker.emit). createMessageAndNotify è completamente mocked
// quindi non c'è alcuna emition del broker dietro le quinte.

const mockSendDmNotificationEmail = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/commerce/shared/email", () => ({
  sendDmNotificationEmail: mockSendDmNotificationEmail,
}));

// ─── Helper black-box mock (Fase 2.3 loadAuthorizedConversation) ──
// Vedi src/lib/messaging/load-authorized-conversation.test.ts per i test
// del helper stesso. Qui mockiamo il contratto: ritorna AuthorizedConversation
// o throws AppError corrispondente.
const { mockLoadAuthorizedConversation } = vi.hoisted(() => ({
  mockLoadAuthorizedConversation: vi.fn(),
}));
vi.mock("@/lib/messaging/load-authorized-conversation", () => ({
  loadAuthorizedConversation: mockLoadAuthorizedConversation,
}));

// ─── createMessageAndNotify mock — Fase 2.3 helper ────────────
// Coincide con la logica del file reale (prisma.message.create + broker.emit +
// offline email). Nei test sostituiamo con un no-op che ritorna la message
// passata, così possiamo asserire l'orchestrazione senza dover replicare
// Prisma mocking complesso nested.
const { mockCreateMessageAndNotify } = vi.hoisted(() => ({
  mockCreateMessageAndNotify: vi.fn(),
}));
vi.mock("@/lib/messaging/create-message", () => ({
  createMessageAndNotify: mockCreateMessageAndNotify,
}));

// ─── Helpers ──────────────────────────────────────────────────
const mockAuth = (dbUser: { id: string; email: string; name?: string | null }) => {
  mockGetServerUser.mockResolvedValue({ user: { email: dbUser.email }, dbUser });
};

const CONV_ID = "conv-test-1";
const PARTNER_ID = "user-partner";
const PRODUCT_ID = "prod-test-1";
const ME = { id: "user1", email: "a@test.com", name: "Mario Rossi" };

function setAuthorized({
  conversationId = CONV_ID,
  partnerId = PARTNER_ID,
  productId = PRODUCT_ID,
}: { conversationId?: string; partnerId?: string; productId?: string } = {}) {
  mockLoadAuthorizedConversation.mockReset();
  mockLoadAuthorizedConversation.mockResolvedValue({
    conversation: {
      id: conversationId,
      userOneId: ME.id,
      userTwoId: partnerId,
      productId,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    partnerId,
    productId,
  });
}

const createRequest = (url: string, init?: RequestInit): NextRequest =>
  new Request(`http://localhost${url}`, init) as unknown as NextRequest;

// ─── Tests ────────────────────────────────────────────────────

// ════════════════════════════════════════════════════════════════
// GET /api/conversations/[id]/messages
// ════════════════════════════════════════════════════════════════
describe("GET /api/conversations/[id]/messages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setAuthorized();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetServerUser.mockResolvedValue({ user: null, dbUser: null });
    const { GET } = await import("./route");
    const res = await GET(createRequest(`/api/conversations/${CONV_ID}/messages`), {
      params: Promise.resolve({ id: CONV_ID }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 when conversationId is missing in URL", async () => {
    mockAuth(ME);
    // Forziamo l'helper a lanciare ValidationError.
    const { ValidationError } = await import("@/lib/errors");
    mockLoadAuthorizedConversation.mockReset();
    mockLoadAuthorizedConversation.mockRejectedValue(
      new ValidationError("conversationId è obbligatorio"),
    );
    const { GET } = await import("./route");
    const res = await GET(createRequest("/api/conversations//messages"), {
      params: Promise.resolve({ id: "" }),
    });
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("returns 404 when conversation does not exist", async () => {
    mockAuth(ME);
    const { NotFoundError } = await import("@/lib/errors");
    mockLoadAuthorizedConversation.mockReset();
    mockLoadAuthorizedConversation.mockRejectedValue(new NotFoundError("Conversazione non trovata"));
    const { GET } = await import("./route");
    const res = await GET(createRequest(`/api/conversations/ghost/messages`), {
      params: Promise.resolve({ id: "ghost" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 403 when user is not a participant", async () => {
    mockAuth(ME);
    const { AppError } = await import("@/lib/errors");
    mockLoadAuthorizedConversation.mockReset();
    mockLoadAuthorizedConversation.mockRejectedValue(
      new AppError("Accesso negato — non sei partecipante di questa conversazione", {
        statusCode: 403,
        code: "NOT_CONVERSATION_MEMBER",
      }),
    );
    const { GET } = await import("./route");
    const res = await GET(createRequest(`/api/conversations/${CONV_ID}/messages`), {
      params: Promise.resolve({ id: CONV_ID }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 403 when resolver denies (Order refunded retroactively)", async () => {
    mockAuth(ME);
    // L'helper reale (post-fix) throws AppError typed. Lo mockiamo con
    // lo stesso type per consistenza contract-test.
    const { AppError } = await import("@/lib/errors");
    mockLoadAuthorizedConversation.mockReset();
    mockLoadAuthorizedConversation.mockRejectedValue(
      new AppError("DM non autorizzata: lo studente non ha un ordine completed per questo prodotto", {
        statusCode: 403,
        code: "no_completed_order_for_student",
      }),
    );
    const { GET } = await import("./route");
    const res = await GET(createRequest(`/api/conversations/${CONV_ID}/messages`), {
      params: Promise.resolve({ id: CONV_ID }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 200 with messages (no cursor)", async () => {
    mockAuth(ME);
    const msgs = [
      { id: "m2", conversationId: CONV_ID, senderId: PARTNER_ID, content: "Hi", read: false, createdAt: new Date(), sender: { id: PARTNER_ID, name: "U", image: null, role: "creator" } },
      { id: "m1", conversationId: CONV_ID, senderId: ME.id, content: "Ciao", read: true, createdAt: new Date(), sender: { id: ME.id, name: "M", image: null, role: "student" } },
    ];
    mockPrisma.message.findMany.mockResolvedValue(msgs);

    const { GET } = await import("./route");
    const res = await GET(createRequest(`/api/conversations/${CONV_ID}/messages`), {
      params: Promise.resolve({ id: CONV_ID }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.messages).toHaveLength(2);
    expect(body.nextCursor).toBeNull();
  });

  it("returns nextCursor when there are more messages than limit", async () => {
    mockAuth(ME);
    // 51 messaggi → haMore=true → nextCursor valorizzato.
    const msgs = Array.from({ length: 51 }, (_, i) => ({
      id: `m${i}`,
      conversationId: CONV_ID,
      senderId: i % 2 === 0 ? ME.id : PARTNER_ID,
      content: `M${i}`,
      read: false,
      createdAt: new Date(),
      sender: { id: "x", name: "x", image: null, role: "student" },
    }));
    mockPrisma.message.findMany.mockResolvedValue(msgs);

    const { GET } = await import("./route");
    const res = await GET(createRequest(`/api/conversations/${CONV_ID}/messages?limit=50`), {
      params: Promise.resolve({ id: CONV_ID }),
    });
    const body = await res.json();

    expect(body.messages).toHaveLength(50);
    expect(body.nextCursor).not.toBeNull();
  });

  it("respects cursor parameter for pagination", async () => {
    mockAuth(ME);
    mockPrisma.message.findMany.mockResolvedValue([
      { id: "old1", conversationId: CONV_ID, senderId: PARTNER_ID, content: "Old", read: true, createdAt: new Date(), sender: { id: PARTNER_ID, name: "U", image: null, role: "creator" } },
    ]);

    const { GET } = await import("./route");
    await GET(createRequest(`/api/conversations/${CONV_ID}/messages?cursor=m50&limit=10`), {
      params: Promise.resolve({ id: CONV_ID }),
    });

    expect(mockPrisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { lt: "m50" } }),
      }),
    );
  });

  it("enforces max limit of 100", async () => {
    mockAuth(ME);
    mockPrisma.message.findMany.mockResolvedValue([]);

    const { GET } = await import("./route");
    await GET(createRequest(`/api/conversations/${CONV_ID}/messages?limit=200`), {
      params: Promise.resolve({ id: CONV_ID }),
    });

    expect(mockPrisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 101 }), // +1 per hasMore
    );
  });

  it("scopes query to conversationId from validated helper", async () => {
    mockAuth(ME);
    mockPrisma.message.findMany.mockResolvedValue([]);

    const { GET } = await import("./route");
    await GET(createRequest(`/api/conversations/${CONV_ID}/messages`), {
      params: Promise.resolve({ id: CONV_ID }),
    });

    expect(mockPrisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ conversationId: CONV_ID }),
      }),
    );
  });
});

// ════════════════════════════════════════════════════════════════
// POST /api/conversations/[id]/messages
// ════════════════════════════════════════════════════════════════
describe("POST /api/conversations/[id]/messages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setAuthorized();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetServerUser.mockResolvedValue({ user: null, dbUser: null });
    const { POST } = await import("./route");
    const res = await POST(
      createRequest(`/api/conversations/${CONV_ID}/messages`, {
        method: "POST",
        body: JSON.stringify({ content: "Hi" }),
      }),
      { params: Promise.resolve({ id: CONV_ID }) },
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when content is missing", async () => {
    mockAuth(ME);
    const { POST } = await import("./route");
    const res = await POST(
      createRequest(`/api/conversations/${CONV_ID}/messages`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: CONV_ID }) },
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when content is empty / whitespace", async () => {
    mockAuth(ME);
    const { POST } = await import("./route");
    const res = await POST(
      createRequest(`/api/conversations/${CONV_ID}/messages`, {
        method: "POST",
        body: JSON.stringify({ content: "   " }),
      }),
      { params: Promise.resolve({ id: CONV_ID }) },
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when content exceeds 5000 chars", async () => {
    mockAuth(ME);
    const { POST } = await import("./route");
    const res = await POST(
      createRequest(`/api/conversations/${CONV_ID}/messages`, {
        method: "POST",
        body: JSON.stringify({ content: "x".repeat(5001) }),
      }),
      { params: Promise.resolve({ id: CONV_ID }) },
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when conversation does not exist", async () => {
    mockAuth(ME);
    const { NotFoundError } = await import("@/lib/errors");
    mockLoadAuthorizedConversation.mockReset();
    mockLoadAuthorizedConversation.mockRejectedValue(new NotFoundError("Conversazione non trovata"));
    const { POST } = await import("./route");
    const res = await POST(
      createRequest(`/api/conversations/ghost/messages`, {
        method: "POST",
        body: JSON.stringify({ content: "Hi" }),
      }),
      { params: Promise.resolve({ id: "ghost" }) },
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 when user is not a participant", async () => {
    mockAuth(ME);
    const { AppError } = await import("@/lib/errors");
    mockLoadAuthorizedConversation.mockReset();
    mockLoadAuthorizedConversation.mockRejectedValue(
      new AppError("Accesso negato — non sei partecipante di questa conversazione", {
        statusCode: 403,
        code: "NOT_CONVERSATION_MEMBER",
      }),
    );
    const { POST } = await import("./route");
    const res = await POST(
      createRequest(`/api/conversations/${CONV_ID}/messages`, {
        method: "POST",
        body: JSON.stringify({ content: "Hi" }),
      }),
      { params: Promise.resolve({ id: CONV_ID }) },
    );
    expect(res.status).toBe(403);
  });

  it("returns 403 when resolver denies (Order refunded post-creazione)", async () => {
    mockAuth(ME);
    const { AppError } = await import("@/lib/errors");
    mockLoadAuthorizedConversation.mockReset();
    mockLoadAuthorizedConversation.mockRejectedValue(
      new AppError("DM non autorizzata: lo studente non ha un ordine completed per questo prodotto", {
        statusCode: 403,
        code: "no_completed_order_for_student",
      }),
    );
    const { POST } = await import("./route");
    const res = await POST(
      createRequest(`/api/conversations/${CONV_ID}/messages`, {
        method: "POST",
        body: JSON.stringify({ content: "Hi" }),
      }),
      { params: Promise.resolve({ id: CONV_ID }) },
    );
    expect(res.status).toBe(403);
  });

  it("creates message and returns 201 with conversationId", async () => {
    mockAuth(ME);
    const newMessage = {
      id: "new-msg",
      conversationId: CONV_ID,
      senderId: ME.id,
      content: "Ciao!",
      read: false,
      createdAt: new Date().toISOString(),
      sender: { id: ME.id, name: ME.name, image: null, role: "student" },
    };
    mockCreateMessageAndNotify.mockResolvedValue(newMessage);

    const { POST } = await import("./route");
    const res = await POST(
      createRequest(`/api/conversations/${CONV_ID}/messages`, {
        method: "POST",
        body: JSON.stringify({ content: "Ciao!" }),
      }),
      { params: Promise.resolve({ id: CONV_ID }) },
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.message).toBeDefined();
    expect(body.message.id).toBe("new-msg");
    expect(body.conversationId).toBe(CONV_ID);
  });

  it("delegates create+broker+email to createMessageAndNotify helper", async () => {
    mockAuth(ME);
    mockCreateMessageAndNotify.mockResolvedValue({
      id: "m1", conversationId: CONV_ID, senderId: ME.id, content: "X", read: false,
      createdAt: new Date().toISOString(),
      sender: { id: ME.id, name: "M", image: null, role: "student" },
    });

    const { POST } = await import("./route");
    await POST(
      createRequest(`/api/conversations/${CONV_ID}/messages`, {
        method: "POST",
        body: JSON.stringify({ content: "X" }),
      }),
      { params: Promise.resolve({ id: CONV_ID }) },
    );

    // Verifica che la route passi i parametri corretti all'helper.
    expect(mockCreateMessageAndNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        conversation: expect.objectContaining({ id: CONV_ID, productId: PRODUCT_ID }),
        sender: expect.objectContaining({ id: ME.id, name: ME.name }),
        partnerId: PARTNER_ID,
        content: "X",
      }),
    );
  });

  it("returns 500 when helper throws unexpected error", async () => {
    mockAuth(ME);
    mockCreateMessageAndNotify.mockRejectedValue(new Error("DB connection lost"));

    const { POST } = await import("./route");
    const res = await POST(
      createRequest(`/api/conversations/${CONV_ID}/messages`, {
        method: "POST",
        body: JSON.stringify({ content: "X" }),
      }),
      { params: Promise.resolve({ id: CONV_ID }) },
    );

    expect(res.status).toBe(500);
  });

  it("handles special characters in content safely (XSS)", async () => {
    mockAuth(ME);
    mockCreateMessageAndNotify.mockResolvedValue({
      id: "m1", conversationId: CONV_ID, senderId: ME.id, content: "<script>x</script>",
      read: false, createdAt: new Date().toISOString(),
      sender: { id: ME.id, name: "M", image: null, role: "student" },
    });

    const { POST } = await import("./route");
    const res = await POST(
      createRequest(`/api/conversations/${CONV_ID}/messages`, {
        method: "POST",
        body: JSON.stringify({ content: "<script>alert(1)</script>" }),
      }),
      { params: Promise.resolve({ id: CONV_ID }) },
    );

    // Il mock di sanitize è identity in test; verifichiamo che la chiamata
    // a createMessageAndNotify includa il content (sarà il vero sanitizeHtml
    // in produzione a fare il lavoro).
    expect(mockCreateMessageAndNotify).toHaveBeenCalledWith(
      expect.objectContaining({ content: "<script>alert(1)</script>" }),
    );
    expect(res.status).toBe(201);
  });
});
