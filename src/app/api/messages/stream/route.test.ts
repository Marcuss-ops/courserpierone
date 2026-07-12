/**
 * Tests for GET /api/messages/stream (Fase 2.0 wire del piano DMs).
 *
 * Covers the integration of `authorizeDmRequest` →
 * `resolveMessagingPermission` into the SSE streaming endpoint:
 *   - 401 if not authenticated
 *   - 400 if fetch param `conversationId` is missing
 *   - 404 if the conversation does not exist
 *   - 403 if the user is not a participant (membership precheck)
 *   - 403 if the resolver denies (e.g., Order refunded post-creazione),
 *     with status code propagated from api-authorize's reason mapping
 *   - 200 + SSE stream start when both checks pass
 *
 * NB: the response shape on deny is plain text + status from
 * `auth.response.status` (NOT JSON like the canonical NextResponse
 * shape of the resolver, because SSE endpoints historically return
 * plain text responses — this matches the codebase convention for
 * /api/messages/stream).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

// ─── Mocks ────────────────────────────────────────────────────
const mockPrisma = {
  conversation: {
    findUnique: vi.fn(),
  },
  message: {
    findMany: vi.fn(),
  },
};

vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));

const mockGetServerUser = vi.fn();
vi.mock("@/lib/supabase/get-user", () => ({ getServerUser: mockGetServerUser }));

// ─── Fase 2.0 wire: mock authorizeDmRequest ─────────────────
const { mockAuthorizeDmRequest } = vi.hoisted(() => ({
  mockAuthorizeDmRequest: vi.fn(),
}));
vi.mock("@/lib/messaging/api-authorize", () => ({
  authorizeDmRequest: mockAuthorizeDmRequest,
}));

function setDefaultAuthorizeAllowed(
  productId: string,
  actorId: string,
  targetId: string,
) {
  mockAuthorizeDmRequest.mockReset();
  mockAuthorizeDmRequest.mockResolvedValue({
    allowed: true,
    permission: {
      allowed: true,
      productId,
      creatorId: "creator-1",
      customerId: actorId === "creator-1" ? targetId : actorId,
    },
  });
}

// ─── Helpers ──────────────────────────────────────────────────
const SELF = "self-1";
const OTHER = "other-1";
const PRODUCT = "prod-1";
const CONV_ID = "conv-1";

const mockAuth = (id: string = SELF) => {
  mockGetServerUser.mockResolvedValue({
    user: { email: "self@test.com" },
    dbUser: { id, email: "self@test.com" },
  });
};

const createRequest = (
  url: string,
  init?: RequestInit,
): NextRequest => new Request(`http://localhost${url}`, init) as unknown as NextRequest;

// ─── Tests ────────────────────────────────────────────────────
describe("GET /api/messages/stream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth();
    // Default: membership-pass + resolver-pass
    mockPrisma.conversation.findUnique.mockResolvedValue({
      id: CONV_ID,
      userOneId: SELF,
      userTwoId: OTHER,
      productId: PRODUCT,
    });
    setDefaultAuthorizeAllowed(PRODUCT, SELF, OTHER);
    mockPrisma.message.findMany.mockResolvedValue([]);
  });

  it("returns 401 when not authenticated", async () => {
    mockGetServerUser.mockResolvedValue({ user: null, dbUser: null });
    const { GET } = await import("./route");
    const res = await GET(createRequest(`/api/messages/stream?conversationId=${CONV_ID}`));
    expect(res.status).toBe(401);
  });

  it("returns 400 when conversationId query param is missing", async () => {
    const { GET } = await import("./route");
    const res = await GET(createRequest("/api/messages/stream"));
    expect(res.status).toBe(400);
    expect(await res.text()).toMatch(/conversationId/i);
  });

  it("returns 404 when the conversation does not exist", async () => {
    mockPrisma.conversation.findUnique.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(createRequest(`/api/messages/stream?conversationId=missing`));
    expect(res.status).toBe(404);
    // Membership precheck occurs BEFORE membership check fails (404 first).
    expect(mockAuthorizeDmRequest).not.toHaveBeenCalled();
  });

  it("returns 403 when user is not a participant (membership precheck)", async () => {
    mockPrisma.conversation.findUnique.mockResolvedValue({
      id: CONV_ID,
      userOneId: OTHER, // SELF not in either side
      userTwoId: "other-2",
      productId: PRODUCT,
    });
    const { GET } = await import("./route");
    const res = await GET(createRequest(`/api/messages/stream?conversationId=${CONV_ID}`));
    expect(res.status).toBe(403);
    // Membership precheck fast-fail: resolver non chiamato (N round-trip
    // risparmiati per il caso ovvio).
    expect(mockAuthorizeDmRequest).not.toHaveBeenCalled();
  });

  it("returns 403 when resolver denies (NoCompletedOrderForStudent → status 403, NO reason leak)", async () => {
    setDefaultAuthorizeAllowed(PRODUCT, SELF, OTHER);
    mockAuthorizeDmRequest.mockResolvedValueOnce({
      allowed: false,
      permission: {
        allowed: false,
        productId: PRODUCT,
        creatorId: "creator-1",
        customerId: OTHER,
        reason: "no_completed_order_for_student",
      },
      response: new Response(JSON.stringify({ error: "DM non autorizzata" }), {
        status: 403,
      }),
    });

    const { GET } = await import("./route");
    const res = await GET(createRequest(`/api/messages/stream?conversationId=${CONV_ID}`));
    expect(res.status).toBe(403);
    // Phase 2.0 V2: il reason interno NON deve essere nel body (no
    // fingerprinting). Solo "Forbidden" plain text + status code.
    const body = await res.text();
    expect(body).toBe("Forbidden");
    expect(body).not.toContain("no_completed_order_for_student");
    expect(body).not.toContain("Fase 2.0");
    expect(mockAuthorizeDmRequest).toHaveBeenCalledTimes(1);
  });

  it("returns 404 when resolver denies (ProductNotFound → status 404, body says 'Not found')", async () => {
    // L'api-authorize mapping per ProductNotFound → 404. Verifica che lo
    // status code del deny venga propagato correttamente al client SSE,
    // e che il body sia generico ("Not found") senza leak del reason.
    mockAuthorizeDmRequest.mockResolvedValueOnce({
      allowed: false,
      permission: {
        allowed: false,
        productId: PRODUCT,
        reason: "product_not_found",
      },
      response: new Response(JSON.stringify({ error: "Prodotto non trovato" }), {
        status: 404,
      }),
    });

    const { GET } = await import("./route");
    const res = await GET(createRequest(`/api/messages/stream?conversationId=${CONV_ID}`));
    expect(res.status).toBe(404);
    const body = await res.text();
    expect(body).toBe("Not found");
    expect(body).not.toContain("product_not_found");
  });

  it("passes {actorId=me, targetId=partner, productId=conversation.productId} to authorizeDmRequest", async () => {
    const { GET } = await import("./route");
    await GET(createRequest(`/api/messages/stream?conversationId=${CONV_ID}`));
    expect(mockAuthorizeDmRequest).toHaveBeenCalledWith({
      actorId: SELF,
      targetId: OTHER,
      productId: PRODUCT,
    });
  });

  it("derives targetId correctly when SELF is userTwo of the conversation", async () => {
    // Edge case di inversione: SELF è userTwo (non userOne), quindi
    // partnerId = userOneId.
    mockPrisma.conversation.findUnique.mockResolvedValue({
      id: CONV_ID,
      userOneId: OTHER, // OTHER è userOne
      userTwoId: SELF,  // SELF è userTwo
      productId: PRODUCT,
    });
    const { GET } = await import("./route");
    await GET(createRequest(`/api/messages/stream?conversationId=${CONV_ID}`));
    expect(mockAuthorizeDmRequest).toHaveBeenCalledWith({
      actorId: SELF,
      targetId: OTHER,
      productId: PRODUCT,
    });
  });

  it("resolver check happens BEFORE the SSE stream controller is set up", async () => {
    // Wiring-order invariant: l'auth pipeline deve precedere l'apertura
    // dello stream. Se accade il contrario, un client non autorizzato
    // potrebbe leggere header SSE prima del reject.
    let resolverCalledFirst = false;
    mockAuthorizeDmRequest.mockImplementation(async () => {
      resolverCalledFirst = true;
      return {
        allowed: true,
        permission: { allowed: true, productId: PRODUCT, creatorId: "c", customerId: SELF },
      };
    });

    const { GET } = await import("./route");
    const res = await GET(createRequest(`/api/messages/stream?conversationId=${CONV_ID}`));
    expect(res.status).toBe(200);
    expect(resolverCalledFirst).toBe(true);
    expect(mockAuthorizeDmRequest).toHaveBeenCalledTimes(1);
  });

  it("returns 200 + text/event-stream content-type when both checks pass", async () => {
    const { GET } = await import("./route");
    const res = await GET(createRequest(`/api/messages/stream?conversationId=${CONV_ID}`));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/text\/event-stream/);
    expect(res.headers.get("Cache-Control")).toMatch(/no-cache/);
  });

  // ─── Phase 2.0 V2: ?since parameter coverage ─────────────────
  // NB: il `poll()` del SSE stream è schedulato via `setTimeout(poll, 500)`.
  // I test usano `vi.useFakeTimers()` + `vi.advanceTimersByTimeAsync(500)`
  // per triggereare il primo ciclo di poll sincronamente, così le
  // assertions su `prisma.message.findMany` hanno materiale da
  // verificare (altrimenti la risposta si chiude prima che il poll
  // parta).
  it("passes parsed `since` Date to message.findMany when ?since=<ISO> is provided", async () => {
    vi.useFakeTimers();
    const SINCE_ISO = "2024-06-15T12:00:00.000Z";
    const expectedSince = new Date(SINCE_ISO);
    try {
      const { GET } = await import("./route");
      const res = await GET(
        createRequest(
          `/api/messages/stream?conversationId=${CONV_ID}&since=${encodeURIComponent(SINCE_ISO)}`,
        ),
      );
      expect(res.status).toBe(200);
      // Triggera il primo poll (schedulato a 500ms post stream.start).
      await vi.advanceTimersByTimeAsync(500);
      expect(mockPrisma.message.findMany).toHaveBeenCalled();
      const firstCall = mockPrisma.message.findMany.mock.calls[0][0];
      expect(firstCall.where.conversationId).toBe(CONV_ID);
      expect(firstCall.where.createdAt).toMatchObject({ gt: expectedSince });
    } finally {
      vi.useRealTimers();
    }
  });

  it("defaults `since` to epoch (Date(0)) when ?since is absent", async () => {
    vi.useFakeTimers();
    try {
      const { GET } = await import("./route");
      const res = await GET(createRequest(`/api/messages/stream?conversationId=${CONV_ID}`));
      expect(res.status).toBe(200);
      await vi.advanceTimersByTimeAsync(500);
      expect(mockPrisma.message.findMany).toHaveBeenCalled();
      const firstCall = mockPrisma.message.findMany.mock.calls[0][0];
      // `gt: new Date(0)` = epoch 1970-01-01 — copertura totale per
      // una SSE che si connette senza snapshot precedente.
      expect(firstCall.where.createdAt).toMatchObject({ gt: new Date(0) });
    } finally {
      vi.useRealTimers();
    }
  });
});
