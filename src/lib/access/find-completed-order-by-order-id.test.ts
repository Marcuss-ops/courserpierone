/**
 * Tests for `findCompletedOrderByOrderId` — V3.1 sibling SSO.
 *
 * Covers 6 case matrix:
 *   1. (happy)   orderId matches Order.id (cuid) → Order returned
 *   2. (happy)   orderId matches Order.providerOrderId (Stripe/Lemon) → Order returned
 *   3. (guard #1) falsy orderId ("") → null SENZA DB hit (security-critical)
 *   4. (guard #1b) undefined orderId → null SENZA DB hit
 *   5. (guard #2) falsy productId ("") → null SENZA DB hit (security-critical)
 *   6. (sad)     no matching Order (status ≠ completed) → null
 *
 * Defensive guards sono il focus principale: mirror dei pattern
 * `findCompletedOrder`-test.ts ma adattati per la nuova chiave.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFindFirst = vi.fn();

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    order: { findFirst: mockFindFirst },
  },
}));

const ORDER_ID_CUID = "ckl0abc123def456";        // matches Order.id (Prisma cuid)
const ORDER_ID_STRIPE = "cs_test_a1b2c3d4e5f6";  // matches Order.providerOrderId (Stripe Session ID)
const OTHER_USER = "user-other";
const PRODUCT = "prod-1";
const OTHER_PRODUCT = "prod-2";

const ORDER_ROW_FOR_PRODUCT = {
  id: ORDER_ID_CUID,
  userId: OTHER_USER,
  productId: PRODUCT,
  paymentProvider: "stripe",
  stripeSessionId: ORDER_ID_STRIPE,
  stripeSubscriptionId: null,
  providerOrderId: ORDER_ID_STRIPE,
  amount: 4900,
  currency: "eur",
  locale: "it",
  status: "completed",
  createdAt: new Date("2024-06-01T10:00:00Z"),
};

describe("findCompletedOrderByOrderId — V3.1 sibling SSO for Pattern B", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: order matched.
    mockFindFirst.mockResolvedValue(ORDER_ROW_FOR_PRODUCT);
  });

  // ── 1: happy path via Order.id (cuid) ─────────────────────────
  it("returns the Order when orderId matches Order.id (cuid) for productId", async () => {
    const { findCompletedOrderByOrderId } = await import(
      "./find-completed-order-by-order-id"
    );
    const order = await findCompletedOrderByOrderId({
      orderId: ORDER_ID_CUID,
      productId: PRODUCT,
    });
    expect(order).toBeTruthy();
    expect(order?.id).toBe(ORDER_ID_CUID);
    expect(order?.productId).toBe(PRODUCT);
    expect(order?.status).toBe("completed");
    // Verifica che la query abbia usato OR su entrambi id+providerOrderId,
    // + status="completed", + productId Scope check.
    expect(mockFindFirst).toHaveBeenCalledWith({
      where: {
        OR: [{ providerOrderId: ORDER_ID_CUID }, { id: ORDER_ID_CUID }],
        productId: PRODUCT,
        status: "completed",
      },
    });
  });

  // ── 2: happy path via Order.providerOrderId (Stripe) ──────────
  it("returns the Order when orderId matches Order.providerOrderId (Stripe cs_test_...)", async () => {
    const { findCompletedOrderByOrderId } = await import(
      "./find-completed-order-by-order-id"
    );
    const order = await findCompletedOrderByOrderId({
      orderId: ORDER_ID_STRIPE,
      productId: PRODUCT,
    });
    expect(order).toBeTruthy();
    // Same query as before — il WHERE è lo stesso (OR su id|providerOrderId).
    expect(mockFindFirst).toHaveBeenCalledWith({
      where: {
        OR: [{ providerOrderId: ORDER_ID_STRIPE }, { id: ORDER_ID_STRIPE }],
        productId: PRODUCT,
        status: "completed",
      },
    });
  });

  // ── 3: defensive guard #1 — empty orderId ──────────────────────
  it("returns null when orderId is empty string (defensive guard #1) — does NOT query DB", async () => {
    // SECURITY: questo test protegge dal bug di authorization
    // cross-user data leak. Se manca, Prisma strippa la chiave
    // OR[{providerOrderId: empty}, {id: empty}] → entrambe le
    // alternative NON matchano → relazione degenerata in WHERE
    // (productId + status) = primo Order.completed per il prodotto.
    // Per Pattern B in particolare (presence check), l'attacker
    // potrebbe ottenere hasAccess=true su qualsiasi prodotto senza
    // avere alcun Order reale.
    const { findCompletedOrderByOrderId } = await import(
      "./find-completed-order-by-order-id"
    );
    const order = await findCompletedOrderByOrderId({
      orderId: "",
      productId: PRODUCT,
    });
    expect(order).toBeNull();
    expect(mockFindFirst).not.toHaveBeenCalled();
  });

  // ── 4: defensive guard #1b — undefined orderId (TypeScript trap) ─
  it("returns null when orderId is undefined — does NOT query DB", async () => {
    // Edge case per `orderId: searchParams.get("orderId") || undefined`:
    // se il route handler passa `undefined` (URL senza query), il guard
    // deve comunque rifiutare.
    const { findCompletedOrderByOrderId } = await import(
      "./find-completed-order-by-order-id"
    );
    const order = await findCompletedOrderByOrderId({
      orderId: undefined as unknown as string,
      productId: PRODUCT,
    });
    expect(order).toBeNull();
    expect(mockFindFirst).not.toHaveBeenCalled();
  });

  // ── 5: defensive guard #2 — empty productId ────────────────────
  it("returns null when productId is empty string (defensive guard #2) — does NOT query DB", async () => {
    // SECURITY: questo test protegge dal bug di authorization
    // cross-product leak. Se manca, Prisma strippa productId dal
    // WHERE → query degenerata in WHERE id|providerOrderId=X AND
    // status="completed" = un Order.completed per qualsiasi prodotto
    // (e.g. un orderId di un prodotto cheap potrebbe sbloccare un
    // prodotto premium).
    const { findCompletedOrderByOrderId } = await import(
      "./find-completed-order-by-order-id"
    );
    const order = await findCompletedOrderByOrderId({
      orderId: ORDER_ID_CUID,
      productId: "",
    });
    expect(order).toBeNull();
    expect(mockFindFirst).not.toHaveBeenCalled();
  });

  // ── 6: sad — no matching Order (status ≠ completed) ─────────────
  it("returns null when no Order matches — anche se la tabella ha Order per stesso (orderId) ma con status='refunded'/'pending'/'failed' (query WHERE ha status='completed' che esclude)", async () => {
    mockFindFirst.mockResolvedValueOnce(null);
    const { findCompletedOrderByOrderId } = await import(
      "./find-completed-order-by-order-id"
    );
    const order = await findCompletedOrderByOrderId({
      orderId: ORDER_ID_CUID,
      productId: PRODUCT,
    });
    expect(order).toBeNull();
    // Verifica che la query sia stata comunque fatta con status="completed"
    // (la WHERE clause include status="completed" hardcoded).
    expect(mockFindFirst).toHaveBeenCalledWith({
      where: {
        OR: [{ providerOrderId: ORDER_ID_CUID }, { id: ORDER_ID_CUID }],
        productId: PRODUCT,
        status: "completed",
      },
    });
  });
});
