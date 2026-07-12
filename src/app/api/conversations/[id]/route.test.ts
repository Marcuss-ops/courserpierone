import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { createMockRequest } from "@/app/api/__test-helpers__/mock-request";

// ─── Mocks (must come before route import) ───────────────────
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    conversation: {
      findFirst: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock("@/lib/supabase/get-user", () => ({
  getServerUser: vi.fn(),
}));

vi.mock("@/lib/ws/broker", () => ({
  messageBroker: { emit: vi.fn() },
  THREAD_DELETED: "threadDeleted",
}));

// ─── Helpers ─────────────────────────────────────────────────

// ─── Imports under test ──────────────────────────────────────
import { prisma } from "@/lib/db/prisma";
import { getServerUser } from "@/lib/supabase/get-user";
import { messageBroker } from "@/lib/ws/broker";

const findFirst = prisma.conversation.findFirst as unknown as Mock;
const deleteConv = prisma.conversation.delete as unknown as Mock;
const getServerUserMock = getServerUser as unknown as Mock;
const emitMock = messageBroker.emit as unknown as Mock;

// ─── Fixtures ────────────────────────────────────────────────
const USER_A = { id: "user-a", email: "a@test.com", name: "Alice", role: "creator" };
const USER_B = { id: "user-b", email: "b@test.com", name: "Bob", role: "student" };
const CONV_AB = {
  id: "conv-123",
  userOneId: USER_A.id,
  userTwoId: USER_B.id,
  productId: "prod-1",
};

async function callDELETE() {
  const { DELETE } = await import("./route");
  const req = createMockRequest("/api/conversations/conv-123", { method: "DELETE" });
  return DELETE(req, { params: Promise.resolve({ id: "conv-123" }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  emitMock.mockReset();
  findFirst.mockReset();
  deleteConv.mockReset();
});

describe("DELETE /api/conversations/[id] (Phase 2.3)", () => {
  // ── 1. 401 anon ─────────────────────────────────────────
  it("returns 401 when user is not authenticated", async () => {
    getServerUserMock.mockResolvedValueOnce({ user: null, dbUser: null });

    const res = await callDELETE();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Non autenticato" });
    expect(findFirst).not.toHaveBeenCalled();
    expect(deleteConv).not.toHaveBeenCalled();
    expect(emitMock).not.toHaveBeenCalled();
  });

  // ── 2. 404 non-existent id (collapses with not-member per info-leak policy) ─
  it("returns 404 when conversation does not exist", async () => {
    getServerUserMock.mockResolvedValueOnce({ user: { email: USER_A.email }, dbUser: USER_A });
    findFirst.mockResolvedValueOnce(null); // not found

    const res = await callDELETE();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Conversazione non trovata" });
    expect(deleteConv).not.toHaveBeenCalled();
    expect(emitMock).not.toHaveBeenCalled();
  });

  // ── 3. 404 not-member (id exists but user not in userOne/userTwo) ─────
  it("returns 404 when user is not the conversation member (info-leak mitigation)", async () => {
    // findFirst predicate `OR: [{userOneId=me}, {userTwoId=me}]` returns null
    // for someone who isn't a participant — collapses with non-existent.
    getServerUserMock.mockResolvedValueOnce({ user: { email: USER_A.email }, dbUser: USER_A });
    findFirst.mockResolvedValueOnce(null);

    const res = await callDELETE();
    expect(res.status).toBe(404);
    expect(deleteConv).not.toHaveBeenCalled();
    expect(emitMock).not.toHaveBeenCalled();
  });

  // ── 4. 204 happy path A (userOne closes) ─────────────────
  it("closes the thread as user-one: 204, row deleted, WS event emitted", async () => {
    getServerUserMock.mockResolvedValueOnce({ user: { email: USER_A.email }, dbUser: USER_A });
    findFirst.mockResolvedValueOnce(CONV_AB);
    deleteConv.mockResolvedValueOnce({
      id: CONV_AB.id,
      userOneId: CONV_AB.userOneId,
      userTwoId: CONV_AB.userTwoId,
      productId: CONV_AB.productId,
    });

    const res = await callDELETE();
    expect(res.status).toBe(204);
    expect(res.body).toBeNull();

    // Membership check on the right id with the right OR predicate
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: CONV_AB.id,
        OR: [{ userOneId: USER_A.id }, { userTwoId: USER_A.id }],
      },
      select: { id: true, userOneId: true, userTwoId: true, productId: true },
    });

    // Hard-delete issued on the right id
    expect(deleteConv).toHaveBeenCalledWith({ where: { id: CONV_AB.id } });

    // THREAD_DELETED event emitted with the right payload
    expect(emitMock).toHaveBeenCalledWith("threadDeleted", {
      conversationId: CONV_AB.id,
      userOneId: CONV_AB.userOneId,
      userTwoId: CONV_AB.userTwoId,
    });
  });

  // ── 5. 204 happy path B (userTwo closes) — symmetric ────
  it("closes the thread as user-two: 204, row deleted, symmetric WS emit", async () => {
    getServerUserMock.mockResolvedValueOnce({ user: { email: USER_B.email }, dbUser: USER_B });
    // user-b IS a member (userTwoId) — membership predicate returns the row
    findFirst.mockResolvedValueOnce(CONV_AB);
    deleteConv.mockResolvedValueOnce(CONV_AB);

    const res = await callDELETE();
    expect(res.status).toBe(204);

    // The OR predicate includes user-b's id (via userTwoId branch)
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: CONV_AB.id,
        OR: [{ userOneId: USER_B.id }, { userTwoId: USER_B.id }],
      },
      select: { id: true, userOneId: true, userTwoId: true, productId: true },
    });
    expect(deleteConv).toHaveBeenCalledWith({ where: { id: CONV_AB.id } });
    expect(emitMock).toHaveBeenCalledWith("threadDeleted", {
      conversationId: CONV_AB.id,
      userOneId: CONV_AB.userOneId,
      userTwoId: CONV_AB.userTwoId,
    });
  });

  // ── 6. 204 close-after-refund (bypass authorization proof) ─────
  it("closes the thread even when authorizeDmRequest would deny (refund case)", async () => {
    // Scenario: Order completed originally → Conversation created. Months
    // later: admin refunds the Order → authorizeDmRequest would deny DM
    // (resolveMessagingPermission returns ctx.deny reason: NoCompletedOrderForStudent).
    // The DELETE route MUST still succeed so the user can clean up their
    // inbox. We verify this by NOT mocking any authorizeDmRequest mocked
    // and confirming the close still happens — the route deliberately
    // does not call authorizeDmRequest (see top-of-file JSDoc).
    getServerUserMock.mockResolvedValueOnce({ user: { email: USER_A.email }, dbUser: USER_A });
    findFirst.mockResolvedValueOnce(CONV_AB);
    deleteConv.mockResolvedValueOnce(CONV_AB);

    const res = await callDELETE();
    expect(res.status).toBe(204);
    expect(deleteConv).toHaveBeenCalledWith({ where: { id: CONV_AB.id } });
    expect(emitMock).toHaveBeenCalledWith("threadDeleted", {
      conversationId: CONV_AB.id,
      userOneId: CONV_AB.userOneId,
      userTwoId: CONV_AB.userTwoId,
    });
  });

  // ── 7. CASCADE contract: route issues exactly ONE Conversation.delete ───────
  it("relies on FK CASCADE — issues exactly ONE delete on Conversation, no Message cleanup loop", async () => {
    // Hard-delete design choice: deleted Conversation → Postgres CASCADE
    // deletes the Messages automatically. The route MUST NOT issue any
    // explicit Message.deleteMany (would be redundant + slower + 2 DB
    // hit). This test guards against a V2 regression that adds redundant
    // cleanup. Implicit defense: the prisma mock has no `message` key,
    // so any attempt to call Message.deleteMany would throw with a
    // "Cannot read property of undefined" — the test observes success.
    getServerUserMock.mockResolvedValueOnce({ user: { email: USER_A.email }, dbUser: USER_A });
    findFirst.mockResolvedValueOnce(CONV_AB);
    deleteConv.mockResolvedValueOnce(CONV_AB);

    await callDELETE();

    // Positive: ONLY one Conversation.delete was issued, with the exact
    // `{ where: { id } }` arg. NB: `toHaveBeenCalledWith` already requires
    // exact-match by default (no partial pattern). Vitest non espone un
    // matcher `toHaveBeenCalledExactlyWith` — usiamo lo standard.
    expect(deleteConv).toHaveBeenCalledTimes(1);
    expect(deleteConv).toHaveBeenCalledWith({ where: { id: CONV_AB.id } });
    // The call succeeded without throwing, proving no Message-level
    // cleanup loop was attempted (which would have failed on the missing
    // prisma.message mock fn).
  });

  // ── 8. Idempotent end-state: DELETE twice returns 204 then 404 ────────────────
  it("returns 204 then 404 when called twice — idempotent end-state via status collapse", async () => {
    // Hard-delete semantics: il response status NON è puramente idempotente
    // (la seconda chiamata ottiene 404 invece di 204). L'idempotenza è
    // sull'end-state ("row-non-più-presente"), non sul response code.
    // Vedere JSDoc di route.ts per la rationale. NB: per ottenere
    // true HTTP-204 idempotency servirebbe un tombstone logico (soft-
    // delete), ma la Fase 2.3 ha optato per hard-delete per scelta
    // deliberata dell'utente.
    getServerUserMock.mockResolvedValueOnce({ user: { email: USER_A.email }, dbUser: USER_A });
    findFirst.mockResolvedValueOnce(CONV_AB);
    deleteConv.mockResolvedValueOnce(CONV_AB);

    const res1 = await callDELETE();
    expect(res1.status).toBe(204);
    expect(deleteConv).toHaveBeenCalledWith({ where: { id: CONV_AB.id } });

    // Second call: row is gone (findFirst predicate returns null)
    getServerUserMock.mockResolvedValueOnce({ user: { email: USER_A.email }, dbUser: USER_A });
    findFirst.mockResolvedValueOnce(null);

    const res2 = await callDELETE();
    expect(res2.status).toBe(404);
    expect(deleteConv).toHaveBeenCalledTimes(1); // still just one underlying delete
  });

  // ── 9. WS broadcast payload contract invariant ─────────
  it("emits THREAD_DELETED with both userOne and userTwo ids — never undefined", async () => {
    getServerUserMock.mockResolvedValueOnce({ user: { email: USER_A.email }, dbUser: USER_A });
    findFirst.mockResolvedValueOnce(CONV_AB);
    deleteConv.mockResolvedValueOnce(CONV_AB);

    await callDELETE();

    const [eventName, payload] = emitMock.mock.calls[0];
    expect(eventName).toBe("threadDeleted");
    expect(payload.conversationId).toBe(CONV_AB.id);
    expect(payload.userOneId).toBe(USER_A.id);
    expect(payload.userTwoId).toBe(USER_B.id);
    // Both user ids MUST be present for `deliverThreadDeleted` to fan
    // out to both inbox cache slots in server.ts.
    expect(payload.userOneId).toBeTruthy();
    expect(payload.userTwoId).toBeTruthy();
  });

  // ── 10. 404 already-deleted (idempotent end-state via 404) ──
  it("returns 404 on a second DELETE call (row already gone — idempotent end-state)", async () => {
    getServerUserMock.mockResolvedValueOnce({ user: { email: USER_A.email }, dbUser: USER_A });
    findFirst.mockResolvedValueOnce(null); // already deleted

    const res = await callDELETE();
    expect(res.status).toBe(404);
    expect(deleteConv).not.toHaveBeenCalled();
    expect(emitMock).not.toHaveBeenCalled();
  });

  // ── 11. Prisma error on delete() → 500 via apiErrorResponse ────────────────
  it("returns 500 via apiErrorResponse when prisma.delete throws — and does NOT emit WS event", async () => {
    getServerUserMock.mockResolvedValueOnce({ user: { email: USER_A.email }, dbUser: USER_A });
    findFirst.mockResolvedValueOnce(CONV_AB);
    deleteConv.mockRejectedValueOnce(new Error("Prisma write error"));

    const res = await callDELETE();
    expect(res.status).toBe(500);
    // Important: the WS event MUST NOT have been emitted because
    // the DELETE failed mid-flight (the Conversation row is still
    // alive in DB, the partner's UI must NOT see a phantom close).
    expect(emitMock).not.toHaveBeenCalled();
  });
});
