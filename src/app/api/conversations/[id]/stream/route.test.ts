/**
 * Tests for GET /api/conversations/[id]/stream — canonical SSE route
 * (Fase 4.x del piano DMs, sostituisce la legacy /api/messages/stream
 * rimossa in commit `cfb2d12`).
 *
 * Copertura (mirror del legacy SSE test file adattato al path-param):
 *   - 401 anon
 *   - 400 missing `id` path param (canonical path-param, NOT query)
 *     — short-circuits BEFORE any DB read
 *   - 404 conversation not found
 *   - 403 non-member precheck (membership fast-fail)
 *   - 403 resolver deny (NoCompletedOrderForStudent → no reason leak)
 *   - 404 resolver deny (ProductNotFound → no reason leak)
 *   - authorizeDmRequest called with {actorId, targetId, productId}
 *   - targetId derivation when SELF is userTwo (getPartnerId inversion)
 *   - Resolver check happens BEFORE the SSE stream controller is set up
 *   - 200 + text/event-stream content-type + Connection: keep-alive
 *   - 15s heartbeat cycle (controller.enqueue ": heartbeat\n\n")
 *   - ?since=<ISO> passed to message.findMany
 *   - ?since absent defaults to epoch (Date(0))
 *   - ?since=<invalid-timestamp> returns 400 (canonical divergence
 *     from legacy: invalid timestamps are now rejected explicitly
 *     instead of silently degraded)
 *
 * NB: la response shape on deny è plain text + status (no JSON, no
 * reason leak). Allinea con la convenzione SSE del codebase. Il
 * reason interno (es. `no_completed_order_for_student`) è fingerprinting-
 * prone e non deve mai uscire dal boundary API — il client discrimina
 * 403 vs 404 vs 409 dallo status code, le stringhe interne restano
 * mapping-only.
 *
 * Pattern: vi.mock hoisted per prisma + getServerUser + authorizeDmRequest.
 * getPartnerId è una pure helper (no prisma access) — non mockato.
 * Per i test time-based (heartbeat, since) si usa `vi.useFakeTimers()`
 * + `vi.advanceTimersByTimeAsync(...)` per triggereare i setTimeout /
 * setInterval deterministically.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

// ─── Mock prisma ────────────────────────────────────────────
const mockPrisma = {
  conversation: {
    findUnique: vi.fn(),
  },
  message: {
    findMany: vi.fn(),
  },
};

vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));

// ─── Mock getServerUser ────────────────────────────────────
const mockGetServerUser = vi.fn();
vi.mock("@/lib/supabase/get-user", () => ({
  getServerUser: mockGetServerUser,
}));

// ─── Fase 2.0 wire: mock authorizeDmRequest ─────────────────
const { mockAuthorizeDmRequest } = vi.hoisted(() => ({
  mockAuthorizeDmRequest: vi.fn(),
}));
vi.mock("@/lib/messaging/api-authorize", () => ({
  authorizeDmRequest: mockAuthorizeDmRequest,
}));

// NB: getPartnerId non è mockato — è una pure helper (no prisma access,
// no async I/O) ed esercitare il real impl qui vale come mini-regression
// del derivation logic (~~lato server.ts WS upgrade~~ C3 removed; ora la
// helper vive solo qui e nel consumer REST POST della conversation).
// quindi un break qui si propaga anche lì).

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

// ─── Helpers ────────────────────────────────────────────────
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

/**
 * Costruisce un `Request` per il route handler canonico.
 * `pathParam` mappa sul dynamic segment `[id]` (empty string → 400
 * missing-id path-param branch). `queryString` diventa `?...`.
 */
function makeRequest(
  pathParam: string,
  queryString = "",
): NextRequest {
  const url = `http://localhost/api/conversations/${pathParam}/stream${
    queryString ? "?" + queryString : ""
  }`;
  return new Request(url) as unknown as NextRequest;
}

const callGet = async (
  pathParam: string,
  queryString = "",
) => {
  // Import the SIBLING route (./route = stream/route.ts which exports
  // GET), not the parent route (../route = conversations/[id]/route.ts
  // which only exports DELETE). This was a pre-existing import-path
  // typo that the stale `.next/types/validator.ts` had been masking.
  // After the .next/ cache regen, TS2339 correctly surfaced the bug.
  const { GET } = await import("./route");
  return await GET(
    makeRequest(pathParam, queryString),
    { params: Promise.resolve({ id: pathParam }) },
  );
};

// ─── Tests ───────────────────────────────────────────────────
describe("GET /api/conversations/[id]/stream (canonical SSE, Fase 4.x)", () => {
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
    const res = await callGet(CONV_ID);
    expect(res.status).toBe(401);
  });

  it("returns 400 when `id` path param is missing (empty segment)", async () => {
    const res = await callGet("");
    expect(res.status).toBe(400);
    const body = await res.text();
    expect(body).toMatch(/id/i);
    // 400 short-circuits BEFORE any DB read.
    expect(mockPrisma.conversation.findUnique).not.toHaveBeenCalled();
    expect(mockAuthorizeDmRequest).not.toHaveBeenCalled();
  });

  it("returns 404 when the conversation does not exist", async () => {
    mockPrisma.conversation.findUnique.mockResolvedValue(null);
    const res = await callGet("missing");
    expect(res.status).toBe(404);
    // 404 short-circuits BEFORE membership precheck AND resolver.
    expect(mockAuthorizeDmRequest).not.toHaveBeenCalled();
  });

  it("returns 403 when user is not a participant (membership precheck)", async () => {
    mockPrisma.conversation.findUnique.mockResolvedValue({
      id: CONV_ID,
      userOneId: OTHER, // SELF not in either side
      userTwoId: "other-2",
      productId: PRODUCT,
    });
    const res = await callGet(CONV_ID);
    expect(res.status).toBe(403);
    // Membership precheck fast-fail: resolver non chiamato (N round-trip
    // risparmiati per il caso ovvio).
    expect(mockAuthorizeDmRequest).not.toHaveBeenCalled();
  });

  it("returns 403 when resolver denies (NoCompletedOrderForStudent → status 403, NO reason leak)", async () => {
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

    const res = await callGet(CONV_ID);
    expect(res.status).toBe(403);
    // Phase 2.0 V2: il reason interno NON deve essere nel body (no
    // fingerprinting). Solo "Forbidden" plain text + status code.
    const body = await res.text();
    expect(body).toBe("Forbidden");
    expect(body).not.toContain("no_completed_order_for_student");
    expect(mockAuthorizeDmRequest).toHaveBeenCalledTimes(1);
  });

  it("returns 404 when resolver denies (ProductNotFound → status 404, body 'Not found')", async () => {
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

    const res = await callGet(CONV_ID);
    expect(res.status).toBe(404);
    const body = await res.text();
    expect(body).toBe("Not found");
    expect(body).not.toContain("product_not_found");
  });

  it("passes {actorId=me, targetId=partner, productId=conversation.productId} to authorizeDmRequest", async () => {
    await callGet(CONV_ID);
    expect(mockAuthorizeDmRequest).toHaveBeenCalledWith({
      actorId: SELF,
      targetId: OTHER,
      productId: PRODUCT,
    });
  });

  it("derives targetId correctly when SELF is userTwo of the conversation", async () => {
    // Edge case di inversione: SELF è userTwo (non userOne), quindi
    // partnerId = userOneId (via getPartnerId helper).
    mockPrisma.conversation.findUnique.mockResolvedValue({
      id: CONV_ID,
      userOneId: OTHER, // OTHER è userOne
      userTwoId: SELF, // SELF è userTwo
      productId: PRODUCT,
    });
    await callGet(CONV_ID);
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
    mockAuthorizeDmRequest.mockImplementation(() => {
      resolverCalledFirst = true;
      return {
        allowed: true,
        permission: { allowed: true, productId: PRODUCT, creatorId: "c", customerId: SELF },
      };
    });

    const res = await callGet(CONV_ID);
    expect(res.status).toBe(200);
    expect(resolverCalledFirst).toBe(true);
    expect(mockAuthorizeDmRequest).toHaveBeenCalledTimes(1);
  });

  it("returns 200 + text/event-stream content-type + Cache-Control: no-cache + Connection: keep-alive when both checks pass", async () => {
    const res = await callGet(CONV_ID);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/text\/event-stream/);
    expect(res.headers.get("Cache-Control")).toMatch(/no-cache/);
    expect(res.headers.get("Connection")).toMatch(/keep-alive/);
    // Vercel/NGINX friendly header (disables response buffering in
    // proxies that would otherwise hold chunks until close).
    expect(res.headers.get("X-Accel-Buffering")).toBe("no");
  });

  it("emits a ': heartbeat' SSE comment every 15s on the open stream", async () => {
    vi.useFakeTimers();
    try {
      const res = await callGet(CONV_ID);
      expect(res.status).toBe(200);
      expect(res.body).toBeTruthy();

      // Lo stream è già aperto al return di GET. Advance 15s per
      // triggereare il primo heartbeat setInterval.
      await vi.advanceTimersByTimeAsync(15_000);

      // Drena il primo chunk disponibile.
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      const { value, done } = await reader.read();
      expect(done).toBe(false);
      const text = decoder.decode(value ?? new Uint8Array());
      expect(text).toContain(": heartbeat");
      // Cleanup: cancel the stream so the heartbeat interval clears.
      try {
        await reader.cancel();
      } catch {
        // best-effort cleanup
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it("emits a second ': heartbeat' after another 15s elapses (multi-cycle coverage)", async () => {
    // Belt-and-suspenders per il 15s heartbeat: verifica che il
    // interval continui a sparare (non solo il primo colpo). Una
    // regressione che chiude il controller dopo il primo enqueue
    // sarebbe catturata qui.
    vi.useFakeTimers();
    try {
      const res = await callGet(CONV_ID);
      expect(res.status).toBe(200);

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();

      // First heartbeat (15s)
      await vi.advanceTimersByTimeAsync(15_000);
      const first = await reader.read();
      expect(decoder.decode(first.value ?? new Uint8Array())).toContain(
        ": heartbeat",
      );

      // Second heartbeat (another 15s, total 30s)
      await vi.advanceTimersByTimeAsync(15_000);
      const second = await reader.read();
      expect(decoder.decode(second.value ?? new Uint8Array())).toContain(
        ": heartbeat",
      );

      try {
        await reader.cancel();
      } catch {
        // best-effort cleanup
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects ?since=<invalid-timestamp> with 400 (canonical divergence from legacy)", async () => {
    // Phase 2.0 V2 diverge dal legacy (che accettava qualsiasi stringa
    // come `since` e silently degradava a "from dawn of time"). Il
    // canonico rifiuta esplicitamente timestamp invalidi con 400 per
    // prevenire diagnostica ambigua lato client in caso di bug a monte
    // (es. `since="undefined"` da una Date malformata).
    const res = await callGet(CONV_ID, "since=not-a-date");
    expect(res.status).toBe(400);
    const body = await res.text();
    expect(body).toMatch(/since/i);
  });

  // ─── ?since coverage (mirror del legacy) ─────────────────────
  it("passes parsed `since` Date to message.findMany when ?since=<ISO>", async () => {
    vi.useFakeTimers();
    const SINCE_ISO = "2024-06-15T12:00:00.000Z";
    const expectedSince = new Date(SINCE_ISO);
    try {
      const res = await callGet(CONV_ID, `since=${encodeURIComponent(SINCE_ISO)}`);
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
      const res = await callGet(CONV_ID);
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
