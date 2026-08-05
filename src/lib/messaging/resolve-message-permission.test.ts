/**
 * Tests for src/lib/messaging/resolve-message-permission.ts.
 *
 * Phase 1.5 del piano DMs: il coalescing di tutti i check autorizzativi
 * in un unico resolver semplifica enormemente la suite di test
 * (basta coprire questo file, non tutte le route).
 *
 * ─── Step 9 — MCR Phase 3 cutover (this revision) ─────────────────────
 *
 * The legacy `USE_ACCESS_GRANT_RESOLVER` feature flag and the dual
 * `Order.findFirst` / `AccessGrant.findFirst` paths have been REMOVED.
 * The resolver ALWAYS delegates to `resolveProductAccess` (which reads
 * `AccessGrant.status='active'`). The tests below are the post-cutover
 * canonical suite:
 *   - studente con AccessGrant.status='active' → consentito
 *   - studente senza grant → deny (NoValidAccessGrant)
 *   - studente verso un altro studente → deny (not_creator_student_pair)
 *   - creator verso un proprio cliente con grant → consentito
 *   - creator verso un cliente senza grant → deny (NoValidAccessGrant)
 *   - self-message (actor == target) → deny (self_message_blocked)
 *   - prodotto inesistente → deny (product_not_found)
 *   - invariante schema: `Product.creatorId` è REQUIRED, nessun fallback
 *     admin (era il deny `no_creator_for_product` pre-fase 4, ora
 *     irraggiungibile; sostituito da test di non-chiamata).
 *
 * ─── Canonical resolver contract (this revision) ─────────────────────
 *
 * `resolveProductAccess` returns the uniform `{ hasAccess, reason,
 * productId, orderId }` shape. The messaging flow only passes `userId`
 * (never `orderId`), so only the session path is exercised here:
 *   - grant present -> allow
 *   - grant missing -> `classifyDenial` reads `prisma.order.findFirst`
 *     once (pending/refunded/not_purchased) to classify the deny.
 * `mockPrisma.order` is therefore a REAL mock returning null by
 * default (no order -> not_purchased -> NoValidAccessGrant). The
 * legacy `MessagingDenyReason.NoCompletedOrderForStudent` export is
 * kept @deprecated for `api-authorize.ts` backward compat; the
 * resolver NEVER returns it post-cutover.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────
// `order.findFirst` IS mocked: the canonical resolver's deny path
// (`classifyDenial`) reads the user's latest Order for the product to
// classify payment_pending / refunded / not_purchased. The messaging
// flow never passes orderId, so the anonymous order path stays
// unreachable — only the session-keyed classifyDenial read can fire.
const mockPrisma = {
  product: {
    findUnique: vi.fn(),
    // findFirst is used by the canonical `resolveProductAccess`
    // product resolution (cuid OR slug). Kept alongside findUnique.
    findFirst: vi.fn(),
  },
  user: {
    findFirst: vi.fn(),
  },
  accessGrant: {
    findFirst: vi.fn(),
  },
  order: {
    findFirst: vi.fn(),
  },
};

vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));

// ─── Imports under test ───────────────────────────────────────
const { resolveMessagingPermission, MessagingDenyReason } = await import(
  "./resolve-message-permission"
);

// ─── Test fixtures ────────────────────────────────────────────
const CREATOR_ID = "creator-1";
const STUDENT_ID = "student-1";
const ANOTHER_STUDENT_ID = "student-2";
const PRODUCT_ID = "prod-1";
const GRANT_ID = "grant-1";

beforeEach(() => {
  vi.clearAllMocks();
  // Default happy-path: product esiste, ha un creator, student ha grant attivo.
  mockPrisma.product.findUnique.mockResolvedValue({
    id: PRODUCT_ID,
    creatorId: CREATOR_ID,
  });
  // Default product resolution inside `resolveProductAccess` (the
  // canonical resolver now owns product lookup: cuid OR slug).
  mockPrisma.product.findFirst.mockResolvedValue({ id: PRODUCT_ID });
  mockPrisma.accessGrant.findFirst.mockResolvedValue({ id: GRANT_ID });
  // No order for (student, product) by default -> deny classifies as
  // not_purchased (only reachable when the grant lookup misses).
  mockPrisma.order.findFirst.mockResolvedValue(null);
});

// ─── Tests ───────────────────────────────────────────────────
describe("resolveMessagingPermission (Step 9 — AccessGrant SSOT path)", () => {
  it("denies self-messages (actor == target)", async () => {
    const res = await resolveMessagingPermission({
      actorId: STUDENT_ID,
      targetId: STUDENT_ID,
      productId: PRODUCT_ID,
    });
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe(MessagingDenyReason.SelfMessage);
  });

  it("denies when product does not exist", async () => {
    mockPrisma.product.findUnique.mockResolvedValue(null);
    const res = await resolveMessagingPermission({
      actorId: STUDENT_ID,
      targetId: CREATOR_ID,
      productId: PRODUCT_ID,
    });
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe(MessagingDenyReason.ProductNotFound);
  });

  // Schema invariant post-fase 4 hardening:
  // Product.creatorId is REQUIRED + FK Restrict. The Prisma type
  // ensures `creatorId` is non-nullable; runtime: the resolver does
  // NOT call `prisma.user.findFirst` for an admin fallback.
  it("rejects when no fallback admin lookup happens (post-fase 4 invariant)", async () => {
    mockPrisma.product.findUnique.mockResolvedValue({
      id: PRODUCT_ID,
      creatorId: CREATOR_ID, // post-migration: never null
    });
    mockPrisma.accessGrant.findFirst.mockResolvedValue({ id: GRANT_ID });
    await resolveMessagingPermission({
      actorId: STUDENT_ID,
      targetId: CREATOR_ID,
      productId: PRODUCT_ID,
    });
    expect(mockPrisma.user.findFirst).not.toHaveBeenCalled();
  });

  it("denies pair with neither participant being THIS product's creator", async () => {
    mockPrisma.product.findUnique.mockResolvedValue({
      id: PRODUCT_ID,
      creatorId: CREATOR_ID,
    });
    const res = await resolveMessagingPermission({
      actorId: "another-creator-id",
      targetId: "yet-another-creator-id",
      productId: PRODUCT_ID,
    });
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe(MessagingDenyReason.NotCreatorStudentPair);
  });

  it("denies pair with both participants as students (no creator in the pair)", async () => {
    const res = await resolveMessagingPermission({
      actorId: STUDENT_ID,
      targetId: ANOTHER_STUDENT_ID,
      productId: PRODUCT_ID,
    });
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe(MessagingDenyReason.NotCreatorStudentPair);
  });

  // ── Step 9 — AccessGrant path ────────────────────────────────

  it("denies with NoValidAccessGrant when student has no active grant", async () => {
    mockPrisma.accessGrant.findFirst.mockResolvedValue(null);
    const res = await resolveMessagingPermission({
      actorId: STUDENT_ID,
      targetId: CREATOR_ID,
      productId: PRODUCT_ID,
    });
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe(MessagingDenyReason.NoValidAccessGrant);
    expect(res.customerId).toBe(STUDENT_ID);
    expect(res.creatorId).toBe(CREATOR_ID);
  });

  it("NEVER returns the deprecated NoCompletedOrderForStudent reason", async () => {
    // Defense: post-cutover the resolver's only "no access" deny
    // reason is NoValidAccessGrant. NoCompletedOrderForStudent
    // remains exported @deprecated for REASON_TO_STATUS compat
    // but is structurally unreachable. If this assertion fails,
    // something has re-introduced the legacy path.
    mockPrisma.accessGrant.findFirst.mockResolvedValue(null);
    const res = await resolveMessagingPermission({
      actorId: STUDENT_ID,
      targetId: CREATOR_ID,
      productId: PRODUCT_ID,
    });
    expect(res.reason).not.toBe(MessagingDenyReason.NoCompletedOrderForStudent);
    expect(res.reason).toBe(MessagingDenyReason.NoValidAccessGrant);
  });

  it("allows student with active grant to write to the creator", async () => {
    const res = await resolveMessagingPermission({
      actorId: STUDENT_ID,
      targetId: CREATOR_ID,
      productId: PRODUCT_ID,
    });
    expect(res.allowed).toBe(true);
    expect(res.creatorId).toBe(CREATOR_ID);
    expect(res.customerId).toBe(STUDENT_ID);
    expect(res.reason).toBeUndefined();
  });

  it("allows creator to write to a student who has an active grant", async () => {
    const res = await resolveMessagingPermission({
      actorId: CREATOR_ID,
      targetId: STUDENT_ID,
      productId: PRODUCT_ID,
    });
    expect(res.allowed).toBe(true);
    expect(res.creatorId).toBe(CREATOR_ID);
    expect(res.customerId).toBe(STUDENT_ID);
  });

  it("denies when student only has grant on a DIFFERENT product", async () => {
    mockPrisma.product.findUnique.mockResolvedValue({
      id: PRODUCT_ID,
      creatorId: CREATOR_ID,
    });
    // resolveProductAccess's WHERE filters strictly by productId — the
    // mock returns null when no grant matches the queried productId.
    mockPrisma.accessGrant.findFirst.mockResolvedValue(null);
    const res = await resolveMessagingPermission({
      actorId: STUDENT_ID,
      targetId: CREATOR_ID,
      productId: PRODUCT_ID,
    });
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe(MessagingDenyReason.NoValidAccessGrant);
  });

  it("reads only product + access grant (no Order, no admin fallback)", async () => {
    // Canonical footprint: resolve-message-permission reads the
    // product (findUnique), then `resolveProductAccess` resolves the
    // product again (findFirst — product resolution is now part of the
    // canonical resolver) and reads the accessGrant. No order.findFirst
    // (session path), no user.findFirst admin fallback.
    mockPrisma.accessGrant.findFirst.mockResolvedValue({ id: GRANT_ID });
    const callOrder: string[] = [];
    mockPrisma.product.findUnique.mockImplementation(async () => {
      callOrder.push("product");
      return { id: PRODUCT_ID, creatorId: CREATOR_ID };
    });
    mockPrisma.product.findFirst.mockImplementation(async () => {
      callOrder.push("product");
      return { id: PRODUCT_ID };
    });
    mockPrisma.accessGrant.findFirst.mockImplementation(async () => {
      callOrder.push("accessGrant");
      return { id: GRANT_ID };
    });
    await resolveMessagingPermission({
      actorId: STUDENT_ID,
      targetId: CREATOR_ID,
      productId: PRODUCT_ID,
    });
    expect(callOrder).toEqual(["product", "product", "accessGrant"]);
    expect(mockPrisma.user.findFirst).not.toHaveBeenCalled();
    // Allow path: the deny classifier (order.findFirst) must NOT fire.
    expect(mockPrisma.order.findFirst).not.toHaveBeenCalled();
  });

  it("does NOT require a grant when querying as the creator (creator side)", async () => {
    // When actor = creator, the grant lookup targets the customer
    // (target=STUDENT_ID), not the creator.
    mockPrisma.product.findUnique.mockResolvedValue({
      id: PRODUCT_ID,
      creatorId: CREATOR_ID,
    });
    mockPrisma.accessGrant.findFirst.mockResolvedValue({ id: GRANT_ID });

    await resolveMessagingPermission({
      actorId: CREATOR_ID,
      targetId: STUDENT_ID,
      productId: PRODUCT_ID,
    });

    // resolveProductAccess is called with the customerId (target),
    // not the creator's id.
    const whereArg =
      mockPrisma.accessGrant.findFirst.mock.calls[0]?.[0]?.where;
    expect(whereArg).toEqual(
      expect.objectContaining({
        userId: STUDENT_ID,
        productId: PRODUCT_ID,
        status: "active",
      }),
    );
  });
});
