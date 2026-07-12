/**
 * Tests for PATCH /api/conversations/[id]/read (Fase 2.3 del piano DMs).
 *
 * NOTA: dopo l'errata Fase 2.3 prima review, `loadAuthorizedConversation`
 * throws AppError typed (NON più NextResponse raw). Le route caller
 * gestiscono l'errore via `apiErrorResponse` che ispeziona
 * `error.statusCode` per restituire il corretto status HTTP (400/403/404).
 * Di conseguenza i test mockano `mockRejectedValue(new AppError(...))`
 * invece di `mockRejectedValue(NextResponse.json(...))`.
 *
 * Cobertura:
 *  - auth required (401)
 *  - conversationId mancante → 400 (ValidationError dall'helper)
 *  - Conversation inesistente → 404 (NotFoundError dall'helper)
 *  - User non membro → 403 (AppError membership precheck)
 *  - Resolver deny (Order refund post-creazione) → 403/404 propagato (AppError)
 *  - Happy path: updateMany con `senderId: { not: me }` filter, ritorna
 *    `{ success: true, count }`.
 *  - Idempotente: chiamate ripetute ritornano 200 con count aggiornato.
 *  - updateMany NON chiamato quando l'helper blocca a monte.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

// ─── Mocks ────────────────────────────────────────────────────
const mockPrisma = {
  conversation: { findUnique: vi.fn() },
  message: { updateMany: vi.fn() },
};

vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));

const mockGetServerUser = vi.fn();
vi.mock("@/lib/supabase/get-user", () => ({ getServerUser: mockGetServerUser }));

// ─── loadAuthorizedConversation mock (Fase 2.3 black-box) ────
// Tutti i deny tests mockano `mockRejectedValue(new AppError(...))` per
// matchare il contract del helper reale (throws typed AppError).
const { mockLoadAuthorizedConversation } = vi.hoisted(() => ({
  mockLoadAuthorizedConversation: vi.fn(),
}));
vi.mock("@/lib/messaging/load-authorized-conversation", () => ({
  loadAuthorizedConversation: mockLoadAuthorizedConversation,
}));

// ─── Helpers ──────────────────────────────────────────────────
const mockAuth = (dbUser: { id: string; email: string }) => {
  mockGetServerUser.mockResolvedValue({ user: { email: dbUser.email }, dbUser });
};

const CONV_ID = "conv-test-1";
const PARTNER_ID = "user-partner";
const PRODUCT_ID = "prod-test-1";
const ME = { id: "user1", email: "a@test.com" };

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

const PATCH_PARAMS = (id: string) => ({ params: Promise.resolve({ id }) });

// ─── Tests ────────────────────────────────────────────────────
describe("PATCH /api/conversations/[id]/read", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setAuthorized();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetServerUser.mockResolvedValue({ user: null, dbUser: null });
    const { PATCH } = await import("./route");
    const res = await PATCH(
      createRequest(`/api/conversations/${CONV_ID}/read`, { method: "PATCH" }),
      PATCH_PARAMS(CONV_ID),
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when conversationId is missing in URL", async () => {
    mockAuth(ME);
    const { ValidationError } = await import("@/lib/errors");
    mockLoadAuthorizedConversation.mockReset();
    mockLoadAuthorizedConversation.mockRejectedValue(
      new ValidationError("conversationId è obbligatorio"),
    );
    const { PATCH } = await import("./route");
    const res = await PATCH(
      createRequest("/api/conversations//read", { method: "PATCH" }),
      PATCH_PARAMS(""),
    );
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("returns 404 when conversation does not exist", async () => {
    mockAuth(ME);
    const { NotFoundError } = await import("@/lib/errors");
    mockLoadAuthorizedConversation.mockReset();
    mockLoadAuthorizedConversation.mockRejectedValue(
      new NotFoundError("Conversazione non trovata"),
    );
    const { PATCH } = await import("./route");
    const res = await PATCH(
      createRequest("/api/conversations/ghost/read", { method: "PATCH" }),
      PATCH_PARAMS("ghost"),
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
    const { PATCH } = await import("./route");
    const res = await PATCH(
      createRequest(`/api/conversations/${CONV_ID}/read`, { method: "PATCH" }),
      PATCH_PARAMS(CONV_ID),
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
    const { PATCH } = await import("./route");
    const res = await PATCH(
      createRequest(`/api/conversations/${CONV_ID}/read`, { method: "PATCH" }),
      PATCH_PARAMS(CONV_ID),
    );
    expect(res.status).toBe(403);
    // Verifica che updateMany NON sia chiamato se l'helper blocca a monte.
    expect(mockPrisma.message.updateMany).not.toHaveBeenCalled();
  });

  it("returns 404 when product not found (via resolver)", async () => {
    mockAuth(ME);
    const { AppError } = await import("@/lib/errors");
    mockLoadAuthorizedConversation.mockReset();
    mockLoadAuthorizedConversation.mockRejectedValue(
      new AppError("Prodotto non trovato", {
        statusCode: 404,
        code: "product_not_found",
      }),
    );
    const { PATCH } = await import("./route");
    const res = await PATCH(
      createRequest(`/api/conversations/${CONV_ID}/read`, { method: "PATCH" }),
      PATCH_PARAMS(CONV_ID),
    );
    expect(res.status).toBe(404);
  });

  it("returns 200 and calls updateMany with sender != me filter", async () => {
    mockAuth(ME);
    mockPrisma.message.updateMany.mockResolvedValue({ count: 5 });

    const { PATCH } = await import("./route");
    const res = await PATCH(
      createRequest(`/api/conversations/${CONV_ID}/read`, { method: "PATCH" }),
      PATCH_PARAMS(CONV_ID),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.count).toBe(5);

    expect(mockPrisma.message.updateMany).toHaveBeenCalledWith({
      where: {
        conversationId: CONV_ID,
        senderId: { not: ME.id },
        read: false,
      },
      data: { read: true },
    });
  });

  it("returns 200 even when there are no messages to mark", async () => {
    mockAuth(ME);
    mockPrisma.message.updateMany.mockResolvedValue({ count: 0 });

    const { PATCH } = await import("./route");
    const res = await PATCH(
      createRequest(`/api/conversations/${CONV_ID}/read`, { method: "PATCH" }),
      PATCH_PARAMS(CONV_ID),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.count).toBe(0);
  });

  it("is idempotent: multiple calls return 200 with cumulative counts", async () => {
    mockAuth(ME);
    // 1ª call: 5 unread → 5 marcati. 2ª call: 0 unread → 0 marcati.
    mockPrisma.message.updateMany
      .mockResolvedValueOnce({ count: 5 })
      .mockResolvedValueOnce({ count: 0 });

    const { PATCH } = await import("./route");

    const r1 = await PATCH(
      createRequest(`/api/conversations/${CONV_ID}/read`, { method: "PATCH" }),
      PATCH_PARAMS(CONV_ID),
    );
    const r2 = await PATCH(
      createRequest(`/api/conversations/${CONV_ID}/read`, { method: "PATCH" }),
      PATCH_PARAMS(CONV_ID),
    );

    expect((await r1.json()).count).toBe(5);
    expect((await r2.json()).count).toBe(0);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
  });

  it("does not mark own messages as read (senderId filter)", async () => {
    mockAuth(ME);
    mockPrisma.message.updateMany.mockResolvedValue({ count: 3 });

    const { PATCH } = await import("./route");
    await PATCH(
      createRequest(`/api/conversations/${CONV_ID}/read`, { method: "PATCH" }),
      PATCH_PARAMS(CONV_ID),
    );

    // Critical: il senderId filter DEVE escludere user1.
    expect(mockPrisma.message.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        senderId: { not: ME.id },
      }),
      data: expect.objectContaining({ read: true }),
    });
  });

  it("returns 500 when updateMany throws unexpected error", async () => {
    mockAuth(ME);
    mockPrisma.message.updateMany.mockRejectedValue(new Error("DB connection lost"));

    const { PATCH } = await import("./route");
    const res = await PATCH(
      createRequest(`/api/conversations/${CONV_ID}/read`, { method: "PATCH" }),
      PATCH_PARAMS(CONV_ID),
    );

    expect(res.status).toBe(500);
  });
});
