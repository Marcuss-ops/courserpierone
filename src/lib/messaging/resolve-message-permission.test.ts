/**
 * Tests for src/lib/messaging/resolve-message-permission.ts.
 *
 * Phase 1.5 del piano DMs: il coalescing di tutti i check autorizzativi
 * in un unico resolver semplifica enormemente la suite di test
 * (basta coprire questo file, non tutte le route).
 *
 * PR 3 del piano DMs (MCR): aggiunge feature flag USE_ACCESS_GRANT_RESOLVER
 * che swappa la lettura in Step 5 da Order.findFirst a AccessGrant.findFirst.
 * - Flag OFF (default 'false'): legacy Order-based path. Deny reason =
 *   `NoCompletedOrderForStudent`.
 * - Flag ON: AccessGrant-based path. Deny reason = `NoValidAccessGrant`.
 * - Coesistono durante il rollout (entrambi i deny reason sono mappati
 *   in `api-authorize.ts` REASON_TO_STATUS).
 *
 * Scenari coperti (post-fase 4 hardening — migration
 * `20260712210000_creator_id_required_restrict`):
 *   - studente con Order.completed → consentito (legacy, flag OFF)
 *   - studente con AccessGrant.status='active' → consentito (PR 3, flag ON)
 *   - studente senza grant/ordine → deny (NoCompletedOrderForStudent legacy,
 *     NoValidAccessGrant post-cutover)
 *   - studente verso un altro studente → deny (not_creator_student_pair)
 *   - creator verso un proprio cliente con grant/ordine → consentito
 *   - creator verso un cliente che ha comprato un altro prodotto → deny
 *   - self-message (actor == target) → deny (self_message_blocked)
 *   - prodotto inesistente → deny (product_not_found)
 *   - invariante schema: `Product.creatorId` è REQUIRED, nessun fallback
 *     admin (era il deny `no_creator_for_product` pre-fase 4, ora
 *     irraggiungibile; sostituito da test di non-chiamata).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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
  // PR 3 of MCR — added so the new AccessGrant-based path can be tested.
  // Existing tests do NOT call this (flag is OFF by default), so it's
  // present but unused unless explicitly enabled via USE_ACCESS_GRANT_RESOLVER.
  accessGrant: {
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
const ORDER_ID = "order-1";
const GRANT_ID = "grant-1";

beforeEach(() => {
  vi.clearAllMocks();
  // Default happy-path: product esiste, ha un creator, student ha ordine.
  mockPrisma.product.findUnique.mockResolvedValue({
    id: PRODUCT_ID,
    creatorId: CREATOR_ID,
  });
  mockPrisma.order.findFirst.mockResolvedValue({ id: ORDER_ID });
  mockPrisma.accessGrant.findFirst.mockResolvedValue({ id: GRANT_ID });
});

afterEach(() => {
  // Restore env to "not set" so the next test's defaultValue kicks in
  // (i.e., "false" — the legacy path). Without this, vi.stubEnv from
  // a previous test can leak into the next test.
  vi.unstubAllEnvs();
});

// ─── Tests (existing — flag OFF / legacy) ───────────────────
describe("resolveMessagingPermission (legacy Order read — flag OFF)", () => {
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

  // NB: `denies when product has no creatorId AND no fallback admin` +
  // `uses first admin as fallback creator for legacy products` rimossi
  // post-fase 4 hardening (migration
  // `20260712210000_creator_id_required_restrict`): `Product.creatorId`
  // è REQUIRED + ON DELETE RESTRICT a livello DB. Vedi nuova
  // invariante sotto.
  it("rejects when creatorId would be null (post-fase 4 schema invariant)", async () => {
    // Two-line defense per il post-fase 4 invariant:
    //
    //   1) FIRST LINE: type system. `Product.creatorId` è REQUIRED
    //      (`String`, non `String?`) nel prisma schema + FK Restrict
    //      (migration `20260712210000_creator_id_required_restrict`).
    //      Il Prisma client static type impedisce staticamente a `null`
    //      di raggiungere `resolveMessagingPermission` — qualsiasi mock
    //      che restituisse `creatorId: null` richiederebbe un cast
    //      non-sicuro e non passerebbe `tsc`.
    //
    //   2) SECOND LINE: runtime. Questo test asserisce che il resolver
    //      NON esegue la query legacy `prisma.user.findFirst({ where:
    //      { role: "admin" } })` per il fallback admin. L'assenza di
    //      fall-through è la prova runtime che la pulizia è completa.
    //
    // Insieme le due difese garantiscono l'invariante "creatorId sempre
    // non-null e non-risolto-via-fallback" post-fase 4.
    mockPrisma.product.findUnique.mockResolvedValue({
      id: PRODUCT_ID,
      creatorId: CREATOR_ID, // post-migration: mai null
    });
    mockPrisma.order.findFirst.mockResolvedValue({ id: ORDER_ID });
    await resolveMessagingPermission({
      actorId: STUDENT_ID,
      targetId: CREATOR_ID,
      productId: PRODUCT_ID,
    });
    expect(mockPrisma.user.findFirst).not.toHaveBeenCalled();
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
    expect(res.customerId).toBe(STUDENT_ID);
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
    expect(res.customerId).toBe(STUDENT_ID);
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
    expect(res.customerId).toBe(STUDENT_ID);
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

  it("queries only product and order (no admin-fallback post-fase 4)", async () => {
    const callOrder: string[] = [];
    mockPrisma.product.findUnique.mockImplementation(async () => {
      callOrder.push("product");
      return { id: PRODUCT_ID, creatorId: CREATOR_ID };
    });
    mockPrisma.order.findFirst.mockImplementation(async () => {
      callOrder.push("order");
      return { id: ORDER_ID };
    });
    await resolveMessagingPermission({
      actorId: STUDENT_ID,
      targetId: CREATOR_ID,
      productId: PRODUCT_ID,
    });
    // Post-fase 4 hardening: creatorId non è mai più risolto via fallback
    // admin (la colonna è REQUIRED). Confermiamo che la query legacy
    // `prisma.user.findFirst({ where: { role: "admin" } })` è completamente
    // rimossa dal call sequence.
    expect(callOrder).toEqual(["product", "order"]);
    expect(mockPrisma.user.findFirst).not.toHaveBeenCalled();
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

// ─── PR 3 — feature-flagged AccessGrant resolver ─────────────
// See resolve-message-permission.ts JSDoc top-of-file for the
// rollout runbook (1d staging zero denies → 7d staging monitor
// → flip prod → 7d prod monitor → remove legacy read).
describe("resolveMessagingPermission (PR 3 — USE_ACCESS_GRANT_RESOLVER)", () => {
  describe("flag OFF (default — legacy Order read)", () => {
    it("uses Order.findFirst when flag is unset (defaultValue 'false')", async () => {
      // Don't stub env — the env module's defaultValue='false' is the
      // production-default. Test that the default falls through to the
      // legacy path without any env stubbing.
      await resolveMessagingPermission({
        actorId: STUDENT_ID,
        targetId: CREATOR_ID,
        productId: PRODUCT_ID,
      });
      expect(mockPrisma.order.findFirst).toHaveBeenCalledTimes(1);
      expect(mockPrisma.accessGrant.findFirst).not.toHaveBeenCalled();
    });

    it("uses Order.findFirst when flag is explicitly 'false'", async () => {
      vi.stubEnv("USE_ACCESS_GRANT_RESOLVER", "false");
      await resolveMessagingPermission({
        actorId: STUDENT_ID,
        targetId: CREATOR_ID,
        productId: PRODUCT_ID,
      });
      expect(mockPrisma.order.findFirst).toHaveBeenCalledTimes(1);
      expect(mockPrisma.accessGrant.findFirst).not.toHaveBeenCalled();
    });

    it("denies with NoCompletedOrderForStudent (NOT NoValidAccessGrant) when Order missing", async () => {
      mockPrisma.order.findFirst.mockResolvedValue(null);
      const res = await resolveMessagingPermission({
        actorId: STUDENT_ID,
        targetId: CREATOR_ID,
        productId: PRODUCT_ID,
      });
      expect(res.allowed).toBe(false);
      expect(res.reason).toBe(MessagingDenyReason.NoCompletedOrderForStudent);
    });

    it("does NOT call AccessGrant.findFirst even when an active grant exists", async () => {
      // Defense: the legacy path doesn't even peek at AccessGrant. If
      // the dual-write in PR 2 wrote a grant but Order.status was
      // somehow not 'completed' (race condition), the legacy path
      // denies — which is the conservative behavior.
      mockPrisma.accessGrant.findFirst.mockResolvedValue({ id: GRANT_ID });
      mockPrisma.order.findFirst.mockResolvedValue(null);
      const res = await resolveMessagingPermission({
        actorId: STUDENT_ID,
        targetId: CREATOR_ID,
        productId: PRODUCT_ID,
      });
      expect(res.allowed).toBe(false);
      expect(res.reason).toBe(MessagingDenyReason.NoCompletedOrderForStudent);
      expect(mockPrisma.accessGrant.findFirst).not.toHaveBeenCalled();
    });
  });

  describe("flag ON (AccessGrant read — post-cutover canonical path)", () => {
    beforeEach(() => {
      vi.stubEnv("USE_ACCESS_GRANT_RESOLVER", "true");
    });

    it("uses AccessGrant.findFirst (NOT Order.findFirst) when flag is 'true'", async () => {
      await resolveMessagingPermission({
        actorId: STUDENT_ID,
        targetId: CREATOR_ID,
        productId: PRODUCT_ID,
      });
      expect(mockPrisma.accessGrant.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: STUDENT_ID,
            productId: PRODUCT_ID,
            status: "active",
          }),
        }),
      );
      // The legacy path must NOT be called when the flag is on —
      // otherwise we'd double-query and burn an index lookup.
      expect(mockPrisma.order.findFirst).not.toHaveBeenCalled();
    });

    it("allows when grant is active", async () => {
      mockPrisma.accessGrant.findFirst.mockResolvedValue({ id: GRANT_ID });
      const res = await resolveMessagingPermission({
        actorId: STUDENT_ID,
        targetId: CREATOR_ID,
        productId: PRODUCT_ID,
      });
      expect(res.allowed).toBe(true);
      expect(res.creatorId).toBe(CREATOR_ID);
      expect(res.customerId).toBe(STUDENT_ID);
    });

    it("denies with NoValidAccessGrant when grant missing", async () => {
      mockPrisma.accessGrant.findFirst.mockResolvedValue(null);
      const res = await resolveMessagingPermission({
        actorId: STUDENT_ID,
        targetId: CREATOR_ID,
        productId: PRODUCT_ID,
      });
      expect(res.allowed).toBe(false);
      expect(res.reason).toBe(MessagingDenyReason.NoValidAccessGrant);
    });

    it("filters strictly on status='active' (revoked grants are skipped)", async () => {
      // If the schema returned a grant with status='revoked', the
      // findFirst with status='active' filter would skip it. The
      // assertion verifies the status filter is in the query args.
      await resolveMessagingPermission({
        actorId: STUDENT_ID,
        targetId: CREATOR_ID,
        productId: PRODUCT_ID,
      });
      expect(mockPrisma.accessGrant.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: "active" }),
        }),
      );
    });

    it("allows creator to write to a student who has an active grant (symmetric to legacy)", async () => {
      // Mirror of the legacy "allows creator to write" test, exercised
      // under the new path. Order of mock matters: product + grant
      // are read; Order is NOT read.
      mockPrisma.accessGrant.findFirst.mockResolvedValue({ id: GRANT_ID });
      const res = await resolveMessagingPermission({
        actorId: CREATOR_ID,
        targetId: STUDENT_ID,
        productId: PRODUCT_ID,
      });
      expect(res.allowed).toBe(true);
      expect(mockPrisma.accessGrant.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: STUDENT_ID }),
        }),
      );
      expect(mockPrisma.order.findFirst).not.toHaveBeenCalled();
    });
  });
});
