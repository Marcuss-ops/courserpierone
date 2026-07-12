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
    upsert: vi.fn(),
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

// ─── Phase 2.2: mock authorizeDmRequest ─────────────────────────
// La route chiama authorizeDmRequest(...). Per default allowed=true
// (i test storici del GET continuano a passare). I test del deny
// usano mockAuthorizeDmRequest.mockResolvedValueOnce(...).
const { mockAuthorizeDmRequest } = vi.hoisted(() => ({
  mockAuthorizeDmRequest: vi.fn(),
}));
vi.mock("@/lib/messaging/api-authorize", () => ({
  authorizeDmRequest: mockAuthorizeDmRequest,
}));
function setDefaultAuthorizeAllowed() {
  mockAuthorizeDmRequest.mockReset();
  mockAuthorizeDmRequest.mockResolvedValue({
    allowed: true,
    permission: {
      allowed: true,
      creatorId: "creator-1",
      studentId: SELF,
      productId: PRODUCT_A,
    },
  });
}
// NB: la chiamata module-level è rimossa: SELF/PRODUCT_A sono dichiarati
// più sotto (TDZ). La default mock-setup è dentro i `beforeEach` delle
// describe che ne hanno bisogno (POST). Il GET describe non consulta
// authorizeDmRequest, quindi non ne ha bisogno.

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

const createRequest = (url: string, init?: RequestInit): NextRequest =>
  new Request(`http://localhost${url}`, init) as unknown as NextRequest;

const postJson = (url: string, body: unknown): NextRequest =>
  createRequest(url, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });

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

// ─── POST /api/conversations tests (Phase 2.2) ─────────────────
// Endpoint idempotente: trova o crea la Conversation per la coppia
// (me, targetUserId) su `productId`. Il check autorizzativo passa
// dal resolver centrale (authorizeDmRequest).
describe("POST /api/conversations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setDefaultAuthorizeAllowed();
    // default upsert: ritorna una conversation fittizia
    mockPrisma.conversation.upsert.mockResolvedValue({ id: "newConvId" });
  });

  it("returns 401 when not authenticated", async () => {
    mockGetServerUser.mockResolvedValue({ user: null, dbUser: null });
    const { POST } = await import("./route");
    const res = await POST(
      postJson("/api/conversations", { productId: PRODUCT_A, targetUserId: OTHER_A }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when productId is missing", async () => {
    mockAuth({ id: SELF, email: "self@test.com" });
    const { POST } = await import("./route");
    const res = await POST(
      postJson("/api/conversations", { targetUserId: OTHER_A }),
    );
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toContain("productId");
  });

  it("returns 400 when targetUserId is missing", async () => {
    mockAuth({ id: SELF, email: "self@test.com" });
    const { POST } = await import("./route");
    const res = await POST(
      postJson("/api/conversations", { productId: PRODUCT_A }),
    );
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toContain("targetUserId");
  });

  it("returns 400 when targetUserId equals the caller (inline self-check)", async () => {
    // Defense-in-depth: il inline self-check cattura il caso prima del DB.
    // Il resolver farebbe lo stesso con status 400, ma qui risparmiamo
    // il round-trip al resolver per il caso più ovvio.
    mockAuth({ id: SELF, email: "self@test.com" });
    const { POST } = await import("./route");
    const res = await POST(
      postJson("/api/conversations", { productId: PRODUCT_A, targetUserId: SELF }),
    );
    expect(res.status).toBe(400);
    // L'inline check NON consulta il resolver né il DB:
    expect(mockAuthorizeDmRequest).not.toHaveBeenCalled();
    expect(mockPrisma.conversation.upsert).not.toHaveBeenCalled();
  });

  it("returns 404 when resolver denies (product_not_found)", async () => {
    mockAuth({ id: SELF, email: "self@test.com" });
    const { NextResponse } = await import("next/server");
    mockAuthorizeDmRequest.mockResolvedValueOnce({
      allowed: false,
      permission: { allowed: false, productId: PRODUCT_A, reason: "product_not_found" },
      response: NextResponse.json(
        { error: "Prodotto non trovato", reason: "product_not_found" },
        { status: 404 },
      ),
    });

    const { POST } = await import("./route");
    const res = await POST(
      postJson("/api/conversations", { productId: PRODUCT_A, targetUserId: OTHER_A }),
    );
    const body = await res.json();
    expect(res.status).toBe(404);
    expect(body.reason).toBe("product_not_found");
    // Wiring: il deny blocca PRIMA dell'upsert.
    expect(mockPrisma.conversation.upsert).not.toHaveBeenCalled();
  });

  it("returns 403 when resolver denies (not_creator_student_pair)", async () => {
    mockAuth({ id: SELF, email: "self@test.com" });
    const { NextResponse } = await import("next/server");
    mockAuthorizeDmRequest.mockResolvedValueOnce({
      allowed: false,
      permission: { allowed: false, productId: PRODUCT_A, reason: "not_creator_student_pair" },
      response: NextResponse.json(
        { error: "DM non autorizzata", reason: "not_creator_student_pair" },
        { status: 403 },
      ),
    });

    const { POST } = await import("./route");
    const res = await POST(
      postJson("/api/conversations", { productId: PRODUCT_A, targetUserId: OTHER_A }),
    );
    expect(res.status).toBe(403);
    expect(mockPrisma.conversation.upsert).not.toHaveBeenCalled();
  });

  it("returns 403 when resolver denies (no_completed_order_for_student)", async () => {
    mockAuth({ id: SELF, email: "self@test.com" });
    const { NextResponse } = await import("next/server");
    mockAuthorizeDmRequest.mockResolvedValueOnce({
      allowed: false,
      permission: {
        allowed: false,
        productId: PRODUCT_A,
        reason: "no_completed_order_for_student",
        creatorId: "creator-1",
        studentId: OTHER_A,
      },
      response: NextResponse.json(
        { error: "DM non autorizzata", reason: "no_completed_order_for_student" },
        { status: 403 },
      ),
    });

    const { POST } = await import("./route");
    const res = await POST(
      postJson("/api/conversations", { productId: PRODUCT_A, targetUserId: OTHER_A }),
    );
    expect(res.status).toBe(403);
    expect(mockPrisma.conversation.upsert).not.toHaveBeenCalled();
  });

  it("returns 200 with {conversationId} on success (canonical order: OTHER_A < SELF)", async () => {
    // "other-a" < "self-1" lessicograficamente ('o' = 111 < 's' = 115).
    // sort([SELF, OTHER_A]) = [OTHER_A, SELF] → upsert chiamato con
    // userOneId = OTHER_A (min) e userTwoId = SELF (max).
    mockAuth({ id: SELF, email: "self@test.com" });
    mockPrisma.conversation.upsert.mockResolvedValue({ id: "conv-self-other" });

    const { POST } = await import("./route");
    const res = await POST(
      postJson("/api/conversations", { productId: PRODUCT_A, targetUserId: OTHER_A }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ conversationId: "conv-self-other" });
    // L'helper è chiamato con la canonizzazione corretta
    // (userOneId = min, userTwoId = max).
    expect(mockPrisma.conversation.upsert).toHaveBeenCalledWith({
      where: {
        userOneId_userTwoId_productId: {
          userOneId: OTHER_A,
          userTwoId: SELF,
          productId: PRODUCT_A,
        },
      },
      create: expect.objectContaining({
        userOneId: OTHER_A,
        userTwoId: SELF,
        productId: PRODUCT_A,
      }),
      update: {},
    });
  });

  it("canonicalizes pair order when targetUserId < SELF (sort inverts)", async () => {
    // other-a < self-1 lessicograficamente? No, 'o' > 's'. Per testare
    // l'inversione uso un id che sta lessicograficamente prima di SELF.
    // SELF = "self-1", uso l'id pre-sort "aaa_target" (es: nuovo utente
    // con id inferiore).
    mockAuth({ id: SELF, email: "self@test.com" });

    const { POST } = await import("./route");
    await POST(
      postJson("/api/conversations", { productId: PRODUCT_A, targetUserId: "aaa_target" }),
    );

    expect(mockPrisma.conversation.upsert).toHaveBeenCalledWith({
      where: {
        userOneId_userTwoId_productId: {
          userOneId: "aaa_target", // min
          userTwoId: SELF,         // max
          productId: PRODUCT_A,
        },
      },
      create: expect.any(Object),
      update: {},
    });
  });

  it("calls the resolver BEFORE the upsert (wiring-order invariant)", async () => {
    // L'autorizzazione è SEMPRE prima della persistenza: anche se
    // l'upsert è idempotente, bloccare a monte evita di scrivere righe
    // Conversation per coppie non autorizzate (es. prodotto inesistente
    // o coppia non creator↔studente).
    mockAuth({ id: SELF, email: "self@test.com" });
    const callOrder: string[] = [];
    mockAuthorizeDmRequest.mockImplementation(async () => {
      callOrder.push("resolver");
      return {
        allowed: true,
        permission: { allowed: true, productId: PRODUCT_A, creatorId: "creator-1", studentId: SELF },
      };
    });
    mockPrisma.conversation.upsert.mockImplementation(async () => {
      callOrder.push("upsert");
      return { id: "conv-callorder" };
    });

    const { POST } = await import("./route");
    const res = await POST(
      postJson("/api/conversations", { productId: PRODUCT_A, targetUserId: OTHER_A }),
    );

    expect(res.status).toBe(200);
    expect(callOrder).toEqual(["resolver", "upsert"]);
  });

  it("passes {actorId=me, targetId=targetUserId, productId} to authorizeDmRequest", async () => {
    mockAuth({ id: SELF, email: "self@test.com" });
    mockPrisma.conversation.upsert.mockResolvedValue({ id: "conv-w" });

    const { POST } = await import("./route");
    await POST(
      postJson("/api/conversations", { productId: PRODUCT_B, targetUserId: OTHER_B }),
    );

    expect(mockAuthorizeDmRequest).toHaveBeenCalledWith({
      actorId: SELF,
      targetId: OTHER_B,
      productId: PRODUCT_B,
    });
  });

  it("is idempotent on existing conversation (upsert update-branch returns same id)", async () => {
    // Fase 2.2: l'endpoint è idempotente per definizione. Due POST
    // consecutivi sulla stessa coppia-prodotto devono restituire lo
    // stesso `conversationId`. Il path Prisma è upsert con `update: {}`
    // (no-op): la Conversation esistente viene semplicemente
    // restituita senza modifiche.
    mockAuth({ id: SELF, email: "self@test.com" });
    // 1a chiamata: DB restituisce {id:"conv-existing"} come row esistente.
    // 2a chiamata: stesso ritorno perché Prisma upsert è idempotente.
    mockPrisma.conversation.upsert.mockResolvedValue({ id: "conv-existing" });

    const { POST } = await import("./route");
    const res1 = await POST(
      postJson("/api/conversations", { productId: PRODUCT_A, targetUserId: OTHER_A }),
    );
    const res2 = await POST(
      postJson("/api/conversations", { productId: PRODUCT_A, targetUserId: OTHER_A }),
    );
    const body1 = await res1.json();
    const body2 = await res2.json();

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(body1).toEqual({ conversationId: "conv-existing" });
    expect(body2).toEqual({ conversationId: "conv-existing" });
    // Entrambe le chiamate hanno usato `update: {}` (no-op) invece che
    // creare una nuova riga — questo è il contratto di race-safety
    // documentato nella Fase 2.2.
    expect(mockPrisma.conversation.upsert).toHaveBeenCalledTimes(2);
    expect(mockPrisma.conversation.upsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ update: {} }),
    );
    expect(mockPrisma.conversation.upsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ update: {} }),
    );
  });
});
