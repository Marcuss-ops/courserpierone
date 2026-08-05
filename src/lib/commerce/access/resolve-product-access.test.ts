/**
 * Tests for src/lib/commerce/access/resolve-product-access.ts.
 *
 * MCR Phase 3 — central access resolver. AccessGrant is the SSOT for
 * the allow verdict; Order is read only to classify deny reasons.
 *
 * Contract: uniform `{ hasAccess, reason, productId, orderId }`.
 *
 * Canonical case matrix (pinned below):
 *   - ordine pagato            → hasAccess true,  reason active_purchase
 *   - ordine pending           → hasAccess false, reason payment_pending
 *   - ordine rimborsato        → hasAccess false, reason refunded
 *   - ordine di un altro prodotto (anonimo) → hasAccess false, reason order_not_found
 *   - utente diverso dall'acquirente (session) → hasAccess false, reason not_purchased
 *   - prodotto inesistente     → hasAccess false, reason not_purchased
 *   - orderId sconosciuto (anonimo) → hasAccess false, reason order_not_found
 *
 * Plus: guards, cuid fast-path, slug resolution, admin bypass,
 * anonymous grant allow, revoked/expired grants, sourceType-agnostic
 * allow, expiresAt OR clause.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    product: { findFirst: vi.fn() },
    accessGrant: { findFirst: vi.fn() },
    order: { findFirst: vi.fn() },
  },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));

import {
  resolveProductAccess,
  type ProductAccessResult,
} from "./resolve-product-access";

const USER_ID = "user-1";
const OTHER_USER_ID = "user-2";
const PRODUCT_ID = "prod-1";
const PRODUCT_SLUG = "test-course";
const GRANT_ID = "grant-42";
const ORDER_ID = "order-1";

beforeEach(() => {
  vi.clearAllMocks();
  // Default product resolution: the product exists and resolves to
  // the canonical PRODUCT_ID (non-cuid inputs go through the OR
  // lookup; cuid inputs skip it).
  mockPrisma.product.findFirst.mockResolvedValue({ id: PRODUCT_ID });
  // Default deny-path classification: no Order rows for the user.
  mockPrisma.order.findFirst.mockResolvedValue(null);
});

function expectDeny(result: ProductAccessResult, reason: string) {
  expect(result.hasAccess).toBe(false);
  expect(result.reason).toBe(reason);
}

function expectAllow(result: ProductAccessResult, orderId: string | null) {
  expect(result.hasAccess).toBe(true);
  expect(result.reason).toBe("active_purchase");
  expect(result.orderId).toBe(orderId);
}

describe("resolveProductAccess — defensive guards", () => {
  it("productId empty -> deny not_purchased without any DB hit", async () => {
    const result = await resolveProductAccess({
      userId: USER_ID,
      productId: "",
    });
    expectDeny(result, "not_purchased");
    expect(mockPrisma.product.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.accessGrant.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.order.findFirst).not.toHaveBeenCalled();
  });
});

describe("resolveProductAccess — product resolution", () => {
  it("resolves a slug via OR lookup (id|slug) and uses the canonical id", async () => {
    mockPrisma.accessGrant.findFirst.mockResolvedValue({
      id: GRANT_ID,
      sourceType: "order",
      sourceId: ORDER_ID,
    });

    const result = await resolveProductAccess({
      userId: USER_ID,
      productId: PRODUCT_SLUG,
    });

    expectAllow(result, ORDER_ID);
    expect(mockPrisma.product.findFirst).toHaveBeenCalledWith({
      where: { OR: [{ id: PRODUCT_SLUG }, { slug: PRODUCT_SLUG }] },
      select: { id: true },
    });
    expect(mockPrisma.accessGrant.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ productId: PRODUCT_ID }),
      }),
    );
  });

  it("cuid-shaped productId skips the product lookup (hot-path fast path)", async () => {
    const CUID_LIKE_ID = "c123456789012345678901234";
    mockPrisma.accessGrant.findFirst.mockResolvedValue({
      id: GRANT_ID,
      sourceType: "order",
      sourceId: ORDER_ID,
    });

    const result = await resolveProductAccess({
      userId: USER_ID,
      productId: CUID_LIKE_ID,
    });

    expectAllow(result, ORDER_ID);
    expect(mockPrisma.product.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.accessGrant.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ productId: CUID_LIKE_ID }),
      }),
    );
  });

  it("prodotto inesistente -> deny not_purchased without a grant query (fail-closed)", async () => {
    mockPrisma.product.findFirst.mockResolvedValue(null);

    const result = await resolveProductAccess({
      userId: USER_ID,
      productId: "ghost-product",
    });

    expectDeny(result, "not_purchased");
    expect(result.productId).toBe("ghost-product");
    expect(mockPrisma.accessGrant.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.order.findFirst).not.toHaveBeenCalled();
  });
});

describe("resolveProductAccess — admin bypass", () => {
  it("admin -> hasAccess true, reason active_purchase, orderId null (no grant query)", async () => {
    const result = await resolveProductAccess({
      userId: USER_ID,
      userRole: "admin",
      productId: PRODUCT_ID,
    });

    expectAllow(result, null);
    expect(mockPrisma.accessGrant.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.order.findFirst).not.toHaveBeenCalled();
  });

  it("denies admin when the product does not exist (product gate runs first)", async () => {
    mockPrisma.product.findFirst.mockResolvedValue(null);

    const result = await resolveProductAccess({
      userId: USER_ID,
      userRole: "admin",
      productId: "ghost-product",
    });

    expectDeny(result, "not_purchased");
  });
});

describe("resolveProductAccess — ordine pagato (session allow)", () => {
  it("active order grant -> hasAccess true, reason active_purchase, orderId = sourceId", async () => {
    mockPrisma.accessGrant.findFirst.mockResolvedValue({
      id: GRANT_ID,
      sourceType: "order",
      sourceId: ORDER_ID,
    });

    const result = await resolveProductAccess({
      userId: USER_ID,
      productId: PRODUCT_ID,
    });

    expectAllow(result, ORDER_ID);
    expect(mockPrisma.accessGrant.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        userId: USER_ID,
        productId: PRODUCT_ID,
        status: "active",
        OR: expect.arrayContaining([
          expect.objectContaining({ expiresAt: null }),
          expect.objectContaining({ expiresAt: expect.any(Object) }),
        ]),
      }),
      select: { id: true, sourceType: true, sourceId: true },
    });
  });

  it("non-order grant (free_enrollment) -> allow with orderId null", async () => {
    mockPrisma.accessGrant.findFirst.mockResolvedValue({
      id: GRANT_ID,
      sourceType: "free_enrollment",
      sourceId: "free_enrollment:u:p",
    });

    const result = await resolveProductAccess({
      userId: USER_ID,
      productId: PRODUCT_ID,
    });

    expectAllow(result, null);
  });

  it("allow path touches product + accessGrant ONLY — never Order", async () => {
    mockPrisma.accessGrant.findFirst.mockResolvedValue({
      id: GRANT_ID,
      sourceType: "order",
      sourceId: ORDER_ID,
    });
    const result = await resolveProductAccess({
      userId: USER_ID,
      productId: PRODUCT_ID,
    });
    expectAllow(result, ORDER_ID);
    expect(mockPrisma.accessGrant.findFirst).toHaveBeenCalledTimes(1);
    expect(mockPrisma.order.findFirst).not.toHaveBeenCalled();
  });
});

describe("resolveProductAccess — utente diverso dall'acquirente (session deny)", () => {
  it("no grant AND no order for this user -> deny not_purchased", async () => {
    mockPrisma.accessGrant.findFirst.mockResolvedValue(null);
    mockPrisma.order.findFirst.mockResolvedValue(null);

    const result = await resolveProductAccess({
      userId: OTHER_USER_ID, // not the buyer
      productId: PRODUCT_ID,
    });

    expectDeny(result, "not_purchased");
    expect(result.orderId).toBeNull();
    // Deny classification reads the user's Order rows.
    expect(mockPrisma.order.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: OTHER_USER_ID, productId: PRODUCT_ID }),
      }),
    );
  });

  it("grant belongs to another user -> this user denied", async () => {
    // The grant row exists for the buyer; the mock returns null for
    // this user's (userId, productId) seek.
    mockPrisma.accessGrant.findFirst.mockResolvedValue(null);
    mockPrisma.order.findFirst.mockResolvedValue(null);

    const result = await resolveProductAccess({
      userId: OTHER_USER_ID,
      productId: PRODUCT_ID,
    });

    expectDeny(result, "not_purchased");
  });
});

describe("resolveProductAccess — ordine pending (session deny)", () => {
  it("no grant + latest order pending -> deny payment_pending with orderId", async () => {
    mockPrisma.accessGrant.findFirst.mockResolvedValue(null);
    mockPrisma.order.findFirst.mockResolvedValue({ id: ORDER_ID, status: "pending" });

    const result = await resolveProductAccess({
      userId: USER_ID,
      productId: PRODUCT_ID,
    });

    expectDeny(result, "payment_pending");
    expect(result.orderId).toBe(ORDER_ID);
  });
});

describe("resolveProductAccess — ordine rimborsato (session deny)", () => {
  it("no grant + latest order refunded -> deny refunded with orderId", async () => {
    mockPrisma.accessGrant.findFirst.mockResolvedValue(null);
    mockPrisma.order.findFirst.mockResolvedValue({ id: ORDER_ID, status: "refunded" });

    const result = await resolveProductAccess({
      userId: USER_ID,
      productId: PRODUCT_ID,
    });

    expectDeny(result, "refunded");
    expect(result.orderId).toBe(ORDER_ID);
  });

  it("revoked grant (refund flips it atomically) + order refunded -> deny refunded", async () => {
    // The grant exists but is not active (SQL filter returns null);
    // the Order status classifies the reason.
    mockPrisma.accessGrant.findFirst.mockResolvedValue(null);
    mockPrisma.order.findFirst.mockResolvedValue({ id: ORDER_ID, status: "refunded" });

    const result = await resolveProductAccess({
      userId: USER_ID,
      productId: PRODUCT_ID,
    });

    expectDeny(result, "refunded");
  });
});

describe("resolveProductAccess — anonymous post-checkout path (order id)", () => {
  it("provider order id translated to the canonical grant -> allow", async () => {
    mockPrisma.order.findFirst.mockResolvedValue({ id: ORDER_ID, status: "completed" });
    mockPrisma.accessGrant.findFirst.mockResolvedValue({
      id: GRANT_ID,
      sourceType: "order",
      sourceId: ORDER_ID,
    });

    const result = await resolveProductAccess({
      productId: PRODUCT_ID,
      provider: "lemonsqueezy",
      providerOrderId: "order_ls_abc123",
    });

    expectAllow(result, ORDER_ID);
    expect(mockPrisma.order.findFirst).toHaveBeenCalledWith({
      where: {
        paymentProvider: "lemonsqueezy",
        providerOrderId: "order_ls_abc123",
        productId: PRODUCT_ID,
      },
      select: { id: true, status: true },
    });
  });

  it("same providerOrderId under a different provider remains isolated", async () => {
    mockPrisma.order.findFirst.mockResolvedValue(null);

    const result = await resolveProductAccess({
      productId: PRODUCT_ID,
      provider: "stripe",
      providerOrderId: "order_ls_abc123",
    });

    expectDeny(result, "order_not_found");
    expect(mockPrisma.order.findFirst).toHaveBeenCalledWith({
      where: {
        paymentProvider: "stripe",
        providerOrderId: "order_ls_abc123",
        productId: PRODUCT_ID,
      },
      select: { id: true, status: true },
    });
    expect(mockPrisma.accessGrant.findFirst).not.toHaveBeenCalled();
  });

  it("providerOrderId without provider -> deny order_not_found without an unscoped lookup", async () => {
    const result = await resolveProductAccess({
      productId: PRODUCT_ID,
      providerOrderId: "order_ls_abc123",
    });

    expectDeny(result, "order_not_found");
    expect(mockPrisma.order.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.accessGrant.findFirst).not.toHaveBeenCalled();
  });

  it("orderId sconosciuto -> deny order_not_found (no grant query)", async () => {
    mockPrisma.order.findFirst.mockResolvedValue(null);

    const result = await resolveProductAccess({
      productId: PRODUCT_ID,
      internalOrderId: "unknown-order",
    });

    expectDeny(result, "order_not_found");
    expect(mockPrisma.accessGrant.findFirst).not.toHaveBeenCalled();
  });

  it("ordine di un altro prodotto -> deny order_not_found (product-scoped lookup misses)", async () => {
    // The orderId exists but belongs to product B; the lookup is
    // scoped to product A → null.
    mockPrisma.order.findFirst.mockResolvedValue(null);

    const result = await resolveProductAccess({
      productId: PRODUCT_ID,
      internalOrderId: "order_of_other_product",
    });

    expectDeny(result, "order_not_found");
    expect(mockPrisma.order.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ productId: PRODUCT_ID }),
      }),
    );
  });

  it("anonymous pending order -> deny payment_pending with orderId", async () => {
    mockPrisma.order.findFirst.mockResolvedValue({ id: ORDER_ID, status: "pending" });
    mockPrisma.accessGrant.findFirst.mockResolvedValue(null);

    const result = await resolveProductAccess({
      productId: PRODUCT_ID,
      internalOrderId: ORDER_ID,
    });

    expectDeny(result, "payment_pending");
    expect(result.orderId).toBe(ORDER_ID);
  });

  it("anonymous refunded order -> deny refunded", async () => {
    mockPrisma.order.findFirst.mockResolvedValue({ id: ORDER_ID, status: "refunded" });
    mockPrisma.accessGrant.findFirst.mockResolvedValue(null);

    const result = await resolveProductAccess({
      productId: PRODUCT_ID,
      internalOrderId: ORDER_ID,
    });

    expectDeny(result, "refunded");
  });

  it("requires sourceType='order' (collision with other sourceTypes = deny)", async () => {
    mockPrisma.order.findFirst.mockResolvedValue({ id: ORDER_ID, status: "completed" });
    mockPrisma.accessGrant.findFirst.mockResolvedValue(null);

    const result = await resolveProductAccess({
      productId: PRODUCT_ID,
      internalOrderId: ORDER_ID,
    });

    expect(result.hasAccess).toBe(false);
    expect(mockPrisma.accessGrant.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ sourceType: "order" }),
      }),
    );
  });

  it("session path wins: userId grant allowed -> order path never reached", async () => {
    mockPrisma.accessGrant.findFirst.mockResolvedValue({
      id: GRANT_ID,
      sourceType: "order",
      sourceId: ORDER_ID,
    });

    const result = await resolveProductAccess({
      userId: USER_ID,
      productId: PRODUCT_ID,
      provider: "lemonsqueezy",
      providerOrderId: "order_ls_abc123",
    });

    expectAllow(result, ORDER_ID);
    expect(mockPrisma.order.findFirst).not.toHaveBeenCalled();
  });

  it("anonymous without orderId and without userId -> deny not_purchased (no grant/order query)", async () => {
    const result = await resolveProductAccess({
      productId: PRODUCT_ID,
    });

    expectDeny(result, "not_purchased");
    expect(mockPrisma.accessGrant.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.order.findFirst).not.toHaveBeenCalled();
  });
});

describe("resolveProductAccess — expiresAt handling", () => {
  it("includes OR clause: null OR future expiresAt match", async () => {
    mockPrisma.accessGrant.findFirst.mockResolvedValue({
      id: GRANT_ID,
      sourceType: "order",
      sourceId: ORDER_ID,
    });
    await resolveProductAccess({
      userId: USER_ID,
      productId: PRODUCT_ID,
    });
    const whereArg = mockPrisma.accessGrant.findFirst.mock.calls[0]?.[0]?.where;
    expect(whereArg).toEqual(
      expect.objectContaining({
        OR: expect.arrayContaining([
          expect.objectContaining({ expiresAt: null }),
          expect.objectContaining({
            expiresAt: expect.objectContaining({ gt: expect.any(Date) }),
          }),
        ]),
      }),
    );
  });

  it("expired grant (past expiresAt, SQL-filtered) -> deny via order classification", async () => {
    mockPrisma.accessGrant.findFirst.mockResolvedValue(null);
    mockPrisma.order.findFirst.mockResolvedValue(null);

    const result = await resolveProductAccess({
      userId: USER_ID,
      productId: PRODUCT_ID,
    });

    expectDeny(result, "not_purchased");
  });
});

describe("resolveProductAccess — sourceTypes honored uniformly (allow)", () => {
  const SOURCE_TYPES = [
    { sourceType: "order", sourceId: "order-1" },
    { sourceType: "free_enrollment", sourceId: "free_enrollment:u:p" },
    { sourceType: "admin", sourceId: "admin-grant-1" },
    { sourceType: "bundle", sourceId: "bundle-1" },
    { sourceType: "watchlist", sourceId: "watchlist-1" },
  ] as const;

  for (const fixture of SOURCE_TYPES) {
    it(`honors sourceType="${fixture.sourceType}" when status=active`, async () => {
      mockPrisma.accessGrant.findFirst.mockResolvedValue({
        id: `${fixture.sourceType}-grant`,
        sourceType: fixture.sourceType,
        sourceId: fixture.sourceId,
      });
      const result = await resolveProductAccess({
        userId: USER_ID,
        productId: PRODUCT_ID,
      });
      expectAllow(result, fixture.sourceType === "order" ? fixture.sourceId : null);
    });
  }
});

describe("resolveProductAccess — status filter (deny)", () => {
  it("filters strictly on status='active' (revoked grants are denied)", async () => {
    mockPrisma.accessGrant.findFirst.mockResolvedValue(null);
    mockPrisma.order.findFirst.mockResolvedValue(null);
    await resolveProductAccess({
      userId: USER_ID,
      productId: PRODUCT_ID,
    });
    const whereArg = mockPrisma.accessGrant.findFirst.mock.calls[0]?.[0]?.where;
    expect(whereArg).toEqual(
      expect.objectContaining({ status: "active" }),
    );
  });

  it("grant with status='revoked' surfaces as deny", async () => {
    mockPrisma.accessGrant.findFirst.mockResolvedValue(null);
    mockPrisma.order.findFirst.mockResolvedValue(null);
    const result = await resolveProductAccess({
      userId: USER_ID,
      productId: PRODUCT_ID,
    });
    expectDeny(result, "not_purchased");
  });
});
