/**
 * Tests for src/lib/messaging/resolve-message-permission.ts.
 *
 * Phase 1.5 del piano DMs: il coalescing di tutti i check autorizzativi
 * in un unico resolver semplifica enormemente la suite di test
 * (basta coprire questo file, non tutte le route).
 *
 * Scenari coperti (corrispondono alle specifiche del piano):
 *   - studente con Order.completed → consentito
 *   - studente senza Order.completed → deny (no_completed_order_for_student)
 *   - studente verso un altro studente → deny (not_creator_student_pair)
 *   - creator verso un proprio cliente con Order → consentito
 *   - creator verso un cliente che ha comprato un altro prodotto → deny
 *   - self-message (actor == target) → deny (self_message_blocked)
 *   - prodotto inesistente → deny (product_not_found)
 *   - prodotto legacy con creatorId NULL e nessun admin → deny
 *     (no_creator_for_product). Con admin fallback → consentito.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────
const mockPrisma = {
  product: {
    findUnique: vi.fn(),
  },
  user: {
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
const ANOTHER_PRODUCT_ID = "prod-2";
const ORDER_ID = "order-1";

beforeEach(() => {
  vi.clearAllMocks();
  // Default happy-path: product esiste, ha un creator, student ha ordine.
  mockPrisma.product.findUnique.mockResolvedValue({
    id: PRODUCT_ID,
    creatorId: CREATOR_ID,
  });
  mockPrisma.order.findFirst.mockResolvedValue({ id: ORDER_ID });
});

// ─── Tests ────────────────────────────────────────────────────
describe("resolveMessagingPermission", () => {
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

  it("denies when product has no creatorId AND no fallback admin", async () => {
    mockPrisma.product.findUnique.mockResolvedValue({
      id: PRODUCT_ID,
      creatorId: null,
    });
    mockPrisma.user.findFirst.mockResolvedValue(null); // nessun admin
    const res = await resolveMessagingPermission({
      actorId: STUDENT_ID,
      targetId: "any-user-id",
      productId: PRODUCT_ID,
    });
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe(MessagingDenyReason.NoCreatorForProduct);
  });

  it("uses first admin as fallback creator for legacy products", async () => {
    mockPrisma.product.findUnique.mockResolvedValue({
      id: PRODUCT_ID,
      creatorId: null, // legacy pre-Fase 1.4
    });
    const ADMIN_ID = "admin-fallback-1";
    mockPrisma.user.findFirst.mockResolvedValue({ id: ADMIN_ID });
    const res = await resolveMessagingPermission({
      actorId: STUDENT_ID,
      targetId: ADMIN_ID,
      productId: PRODUCT_ID,
    });
    expect(res.allowed).toBe(true);
    expect(res.creatorId).toBe(ADMIN_ID);
    expect(res.studentId).toBe(STUDENT_ID);
  });

  it("denies student whose only order has status refunded (status filter is strict)", async () => {
    // Verifica che la query Order filtri strettamente su status="completed".
    // Un Order refunded (status="refunded") NON deve bastare per autorizzare
    // la DM. Phase 2 del piano vuole che il refund blocchi retroattivamente
    // l'accesso al canale creator↔cliente.
    mockPrisma.product.findUnique.mockResolvedValue({
      id: PRODUCT_ID,
      creatorId: CREATOR_ID,
    });
    mockPrisma.order.findFirst.mockResolvedValue(null); // refunded → null
    const res = await resolveMessagingPermission({
      actorId: STUDENT_ID,
      targetId: CREATOR_ID,
      productId: PRODUCT_ID,
    });
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe(MessagingDenyReason.NoCompletedOrderForStudent);
    // Assert esplicito del filtro status: la query non guarda
    // "pending" o "refunded", solo "completed".
    expect(mockPrisma.order.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "completed" }),
      })
    );
  });

  it("denies pair with neither participant being THIS product's creator", async () => {
    // Caso reale e non ridondante: actor è il creator di un ALTRO
    // prodotto (Product.creatorId = ACTOR_OTHER_CREATOR) e target è un
    // altro creator ancora. Per Product A (id = PRODUCT_ID) nessuno dei
    // due è il creator designato. Il resolver rigetta coppie che non
    // hanno almeno un creator del PRODOTTO CORRENTE.
    mockPrisma.product.findUnique.mockResolvedValue({
      id: PRODUCT_ID,
      creatorId: CREATOR_ID, // non coincide con nessuno dei due
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

  it("denies when student has no completed order for the product", async () => {
    mockPrisma.order.findFirst.mockResolvedValue(null); // nessun ordine completed
    const res = await resolveMessagingPermission({
      actorId: STUDENT_ID,
      targetId: CREATOR_ID,
      productId: PRODUCT_ID,
    });
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe(MessagingDenyReason.NoCompletedOrderForStudent);
    expect(res.studentId).toBe(STUDENT_ID);
    expect(res.creatorId).toBe(CREATOR_ID);
  });

  it("allows student with completed order to write to the creator", async () => {
    const res = await resolveMessagingPermission({
      actorId: STUDENT_ID,
      targetId: CREATOR_ID,
      productId: PRODUCT_ID,
    });
    expect(res.allowed).toBe(true);
    expect(res.creatorId).toBe(CREATOR_ID);
    expect(res.studentId).toBe(STUDENT_ID);
    expect(res.reason).toBeUndefined();
  });

  it("allows creator to write to a student who bought the product", async () => {
    const res = await resolveMessagingPermission({
      actorId: CREATOR_ID,
      targetId: STUDENT_ID,
      productId: PRODUCT_ID,
    });
    expect(res.allowed).toBe(true);
    expect(res.creatorId).toBe(CREATOR_ID);
    expect(res.studentId).toBe(STUDENT_ID);
  });

  it("denies when student only completed an order for a DIFFERENT product", async () => {
    // Esegui query 1 (product lookup) → ok
    mockPrisma.product.findUnique.mockResolvedValue({
      id: PRODUCT_ID,
      creatorId: CREATOR_ID,
    });
    // Esegui query 2 (order lookup) → ordine completed ma su altro prodotto
    mockPrisma.order.findFirst.mockImplementation(async ({ where }) => {
      // Rispecchia il comportamento reale: Order.findFirst con
      // productId=PRODUCT_ID e status="completed" ritorna null.
      if (where.productId === PRODUCT_ID && where.status === "completed") {
        return null;
      }
      return { id: "ord-other-product" };
    });
    const res = await resolveMessagingPermission({
      actorId: STUDENT_ID,
      targetId: CREATOR_ID,
      productId: PRODUCT_ID,
    });
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe(MessagingDenyReason.NoCompletedOrderForStudent);
    // Conferma che la query è stata effettivamente filtrata per productId
    expect(mockPrisma.order.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: STUDENT_ID,
          productId: PRODUCT_ID,
          status: "completed",
        }),
      })
    );
  });

  it("queries product, creator-fallback and order (in that order)", async () => {
    const callOrder: string[] = [];
    mockPrisma.product.findUnique.mockImplementation(async () => {
      callOrder.push("product");
      return { id: PRODUCT_ID, creatorId: CREATOR_ID };
    });
    mockPrisma.order.findFirst.mockImplementation(async () => {
      callOrder.push("order");
      return { id: ORDER_ID };
    });
    mockPrisma.user.findFirst.mockImplementation(async () => {
      callOrder.push("admin-fallback");
      return { id: "fallback" };
    });
    await resolveMessagingPermission({
      actorId: STUDENT_ID,
      targetId: CREATOR_ID,
      productId: PRODUCT_ID,
    });
    // admin-fallback NON deve essere chiamato quando product.creatorId c'è
    expect(callOrder).toEqual(["product", "order"]);
  });

  it("does NOT require an order when querying as the creator (creator side)", async () => {
    // Quando actor = creator, target = studente con ordine → consentito.
    // Verifica che l'Order.findFirst venga chiamato sull'ID del
    // customer (target=STUDENT_ID), non sull'ID del creator.
    mockPrisma.product.findUnique.mockResolvedValue({
      id: PRODUCT_ID,
      creatorId: CREATOR_ID,
    });
    mockPrisma.order.findFirst.mockResolvedValue({ id: ORDER_ID });

    await resolveMessagingPermission({
      actorId: CREATOR_ID,
      targetId: STUDENT_ID,
      productId: PRODUCT_ID,
    });

    expect(mockPrisma.order.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: STUDENT_ID }),
      })
    );
  });
});
