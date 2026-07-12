/**
 * Tests for `findCompletedOrder` — V2 DRY helper.
 *
 * Covers 6 case matrix:
 *   1. (happy)  user×productId has completed order → Order returned
 *   2. (happy)  user×productSlug has completed order → Order returned (relation filter)
 *   3. (guard)  falsy userId → null SENZA DB hit (security-critical)
 *   4. (guard)  missing both productId+productSlug → null SENZA DB hit (ambiguity refusal)
 *   5. (sad)    no matching order (status !== completed) → null
 *   6. (sad)    wrong userId OR wrong productId → null
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFindFirst = vi.fn();

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    order: { findFirst: mockFindFirst },
  },
}));

const SELF = "user-1";
const OTHER = "user-2";
const PRODUCT = "prod-1";
const SLUG = "course-amazing";
const ORDER_ID = "order-1";

const ORDER_ROW = {
  id: ORDER_ID,
  userId: SELF,
  productId: PRODUCT,
  paymentProvider: "stripe",
  stripeSessionId: "cs_test_1",
  stripeSubscriptionId: null,
  providerOrderId: null,
  amount: 4900,
  currency: "eur",
  locale: "it",
  status: "completed",
  createdAt: new Date("2024-06-01T10:00:00Z"),
};

describe("findCompletedOrder — V2 DRY AccessGate predicate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: order matched.
    mockFindFirst.mockResolvedValue(ORDER_ROW);
  });

  it("returns the Order when user has completed order for productId", async () => {
    const { findCompletedOrder } = await import("./find-completed-order");
    const order = await findCompletedOrder({ userId: SELF, productId: PRODUCT });
    expect(order).toBeTruthy();
    expect(order?.id).toBe(ORDER_ID);
    expect(order?.locale).toBe("it");
    expect(mockFindFirst).toHaveBeenCalledWith({
      where: { userId: SELF, status: "completed", productId: PRODUCT },
    });
  });

  it("returns the Order when user has completed order for productSlug (relation filter)", async () => {
    const { findCompletedOrder } = await import("./find-completed-order");
    const order = await findCompletedOrder({ userId: SELF, productSlug: SLUG });
    expect(order).toBeTruthy();
    expect(mockFindFirst).toHaveBeenCalledWith({
      where: { userId: SELF, status: "completed", product: { slug: SLUG } },
    });
  });

  it("returns null when userId is falsy (defensive guard #1) — does NOT query DB", async () => {
    // SECURITY: questo test protegge dal bug di authorization
    // cross-user data leak. Se manca, Prisma strippa userId dalla WHERE
    // e una query accidentale senza userId matcherebbe Order.completed
    // di QUALSIASI utente per il prodotto passato.
    const { findCompletedOrder } = await import("./find-completed-order");
    const a = await findCompletedOrder({ userId: "", productId: PRODUCT });
    const b = await findCompletedOrder({
      userId: undefined as unknown as string,
      productId: PRODUCT,
    });
    expect(a).toBeNull();
    expect(b).toBeNull();
    expect(mockFindFirst).not.toHaveBeenCalled();
  });

  it("returns null when NEITHER productId NOR productSlug is provided (defensive guard #2) — does NOT query DB", async () => {
    const { findCompletedOrder } = await import("./find-completed-order");
    const order = await findCompletedOrder({ userId: SELF });
    expect(order).toBeNull();
    expect(mockFindFirst).not.toHaveBeenCalled();
  });

  it("returns null when no Order matches — anche se la tabella ha Order per stessa (user, product) ma con status='refunded'/'pending'/'failed' (query WHERE ha status='completed' che esclude)", async () => {
    mockFindFirst.mockResolvedValueOnce(null);
    const { findCompletedOrder } = await import("./find-completed-order");
    const order = await findCompletedOrder({ userId: SELF, productId: PRODUCT });
    expect(order).toBeNull();
    // Verifica che comunque la query sia stata fatta con status="completed".
    expect(mockFindFirst).toHaveBeenCalledWith({
      where: { userId: SELF, status: "completed", productId: PRODUCT },
    });
  });

  it("returns null when queryUser OR queryProduct mismatch → null Order", async () => {
    mockFindFirst.mockResolvedValueOnce(null);
    const { findCompletedOrder } = await import("./find-completed-order");
    const order = await findCompletedOrder({ userId: OTHER, productId: PRODUCT });
    expect(order).toBeNull();
    // Verifica che la query sia andata con i parametri forniti.
    expect(mockFindFirst).toHaveBeenCalledWith({
      where: { userId: OTHER, status: "completed", productId: PRODUCT },
    });
  });
});
