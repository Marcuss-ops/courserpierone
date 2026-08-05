/**
 * Tests for src/lib/commerce/access/resolve-product-access.ts.
 *
 * MCR Phase 3 — central access resolver. AccessGrant is the SSOT.
 *
 * Coverage:
 *   - Defensive guards: missing productId -> deny without DB hit.
 *   - Product resolution: cuid fast-path (no product query) + slug OR
 *     lookup; unknown product denies (fail-closed, no grant query).
 *   - Admin bypass: userRole="admin" -> allow without a grant row
 *     (grant query NOT fired); unknown product still denies first.
 *   - Session path (userId): status="active" filter; expiresAt clause
 *     (null OR future); sourceType honored uniformly (order,
 *     free_enrollment, admin, bundle, watchlist).
 *   - Anonymous post-checkout path (orderId): provider id OR internal
 *     id is translated to the canonical `sourceType='order'` grant
 *     lookup; revoked/missing grants deny; cross-product scope is
 *     pinned; free_enrollment/admin/bundle grants sharing the same
 *     sourceId cannot satisfy the path.
 *   - Session path does NOT touch Order (the legacy tripwire now
 *     asserts `order.findFirst` is never called, instead of the mock
 *     being undefined).
 *   - Grant shape: `{ allowed: true; grantId; source: "grant" }` on
 *     hit; `{ allowed: false; reason: NoActiveAccessGrant }` on miss.
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
  ProductAccessDenyReason,
} from "./resolve-product-access";

const USER_ID = "user-1";
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
});

describe("resolveProductAccess — defensive guards", () => {
  it("denies with NoActiveAccessGrant when productId is empty (no DB hit)", async () => {
    const result = await resolveProductAccess({
      userId: USER_ID,
      productId: "",
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe(ProductAccessDenyReason.NoActiveAccessGrant);
    } else {
      throw new Error("expected allowed=false branch");
    }
    expect(mockPrisma.product.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.accessGrant.findFirst).not.toHaveBeenCalled();
  });
});

describe("resolveProductAccess — product resolution", () => {
  it("resolves a slug via OR lookup (id|slug) and reads the grant with the canonical id", async () => {
    mockPrisma.accessGrant.findFirst.mockResolvedValue({ id: GRANT_ID });

    const result = await resolveProductAccess({
      userId: USER_ID,
      productId: PRODUCT_SLUG, // slug input
    });

    expect(result.allowed).toBe(true);
    // Product lookup must accept slug (and id) in the same OR.
    expect(mockPrisma.product.findFirst).toHaveBeenCalledWith({
      where: {
        OR: [{ id: PRODUCT_SLUG }, { slug: PRODUCT_SLUG }],
      },
      select: { id: true },
    });
    // Grant read uses the resolved canonical id.
    expect(mockPrisma.accessGrant.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ productId: PRODUCT_ID }),
      }),
    );
  });

  it("cuid-shaped productId skips the product lookup (hot-path fast path)", async () => {
    // cuid v1 ids (25 lowercase alphanumeric chars starting with "c")
    // are canonical — the grant query is keyed on productId directly,
    // so the product OR-lookup must be skipped.
    const CUID_LIKE_ID = "c123456789012345678901234";
    mockPrisma.accessGrant.findFirst.mockResolvedValue({ id: GRANT_ID });

    const result = await resolveProductAccess({
      userId: USER_ID,
      productId: CUID_LIKE_ID,
    });

    expect(result.allowed).toBe(true);
    expect(mockPrisma.product.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.accessGrant.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ productId: CUID_LIKE_ID }),
      }),
    );
  });

  it("denies without a grant query when the product does not exist (fail-closed)", async () => {
    mockPrisma.product.findFirst.mockResolvedValue(null);

    const result = await resolveProductAccess({
      userId: USER_ID,
      productId: "ghost-product",
    });

    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe(ProductAccessDenyReason.NoActiveAccessGrant);
    } else {
      throw new Error("expected allowed=false branch");
    }
    expect(mockPrisma.accessGrant.findFirst).not.toHaveBeenCalled();
  });
});

describe("resolveProductAccess — admin bypass", () => {
  it("allows with source:'admin' + grantId:null when userRole='admin' (no grant query)", async () => {
    const result = await resolveProductAccess({
      userId: USER_ID,
      userRole: "admin",
      productId: PRODUCT_ID,
    });

    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.source).toBe("admin");
      expect(result.grantId).toBeNull();
    } else {
      throw new Error("expected allowed=true branch");
    }
    expect(mockPrisma.accessGrant.findFirst).not.toHaveBeenCalled();
  });

  it("denies admin when the product does not exist (product gate runs first)", async () => {
    mockPrisma.product.findFirst.mockResolvedValue(null);

    const result = await resolveProductAccess({
      userId: USER_ID,
      userRole: "admin",
      productId: "ghost-product",
    });

    expect(result.allowed).toBe(false);
    expect(mockPrisma.accessGrant.findFirst).not.toHaveBeenCalled();
  });
});

describe("resolveProductAccess — AccessGrant read (SSOT)", () => {
  it("returns source:'grant' + grantId when AccessGrant.findFirst hits status=active", async () => {
    mockPrisma.accessGrant.findFirst.mockResolvedValue({ id: GRANT_ID });

    const result = await resolveProductAccess({
      userId: USER_ID,
      productId: PRODUCT_ID,
    });

    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.source).toBe("grant");
      expect(result.grantId).toBe(GRANT_ID);
    } else {
      throw new Error("expected allowed=true branch");
    }

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
      select: { id: true },
    });
  });

  it("denies with NoActiveAccessGrant when AccessGrant.findFirst returns null", async () => {
    mockPrisma.accessGrant.findFirst.mockResolvedValue(null);

    const result = await resolveProductAccess({
      userId: USER_ID,
      productId: PRODUCT_ID,
    });

    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe(ProductAccessDenyReason.NoActiveAccessGrant);
    } else {
      throw new Error("expected allowed=false branch");
    }
  });

  it("session path touches product + accessGrant ONLY — never Order", async () => {
    // Legacy tripwire: the session path must not re-introduce an Order
    // read. `order.findFirst` must never be called without an orderId.
    mockPrisma.accessGrant.findFirst.mockResolvedValue({ id: GRANT_ID });
    const result = await resolveProductAccess({
      userId: USER_ID,
      productId: PRODUCT_ID,
    });
    expect(result.allowed).toBe(true);
    expect(mockPrisma.accessGrant.findFirst).toHaveBeenCalledTimes(1);
    expect(mockPrisma.order.findFirst).not.toHaveBeenCalled();
  });
});

describe("resolveProductAccess — anonymous post-checkout path (orderId)", () => {
  it("translates a provider order id to the canonical grant and allows", async () => {
    // The URL carries the LS order id (providerOrderId), while the
    // grant row written by processOrder uses sourceId = Order.id.
    mockPrisma.order.findFirst.mockResolvedValue({ id: ORDER_ID });
    mockPrisma.accessGrant.findFirst.mockResolvedValue({ id: GRANT_ID });

    const result = await resolveProductAccess({
      productId: PRODUCT_ID,
      orderId: "order_ls_abc123", // provider id from the checkout redirect
    });

    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.source).toBe("grant");
      expect(result.grantId).toBe(GRANT_ID);
    } else {
      throw new Error("expected allowed=true branch");
    }

    // Order lookup accepts internal id OR providerOrderId, scoped to product.
    expect(mockPrisma.order.findFirst).toHaveBeenCalledWith({
      where: {
        OR: [
          { id: "order_ls_abc123" },
          { providerOrderId: "order_ls_abc123" },
        ],
        productId: PRODUCT_ID,
      },
      select: { id: true },
    });
    // Grant read is keyed on the RESOLVED internal order id.
    expect(mockPrisma.accessGrant.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          sourceType: "order",
          sourceId: ORDER_ID,
          productId: PRODUCT_ID,
          status: "active",
        }),
      }),
    );
  });

  it("denies when no Order matches the orderId (no grant query fired)", async () => {
    mockPrisma.order.findFirst.mockResolvedValue(null);

    const result = await resolveProductAccess({
      productId: PRODUCT_ID,
      orderId: "unknown-order",
    });

    expect(result.allowed).toBe(false);
    expect(mockPrisma.accessGrant.findFirst).not.toHaveBeenCalled();
  });

  it("denies when the order's grant is revoked (findFirst returns null)", async () => {
    mockPrisma.order.findFirst.mockResolvedValue({ id: ORDER_ID });
    mockPrisma.accessGrant.findFirst.mockResolvedValue(null);

    const result = await resolveProductAccess({
      productId: PRODUCT_ID,
      orderId: "order_refunded",
    });

    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe(ProductAccessDenyReason.NoActiveAccessGrant);
    } else {
      throw new Error("expected allowed=false branch");
    }
  });

  it("requires sourceType='order' (collision with other sourceTypes = deny)", async () => {
    // A free_enrollment/admin/bundle grant sharing the same sourceId
    // must NOT satisfy the anonymous path.
    mockPrisma.order.findFirst.mockResolvedValue({ id: ORDER_ID });
    mockPrisma.accessGrant.findFirst.mockResolvedValue(null);

    const result = await resolveProductAccess({
      productId: PRODUCT_ID,
      orderId: "order-1",
    });

    expect(result.allowed).toBe(false);
    expect(mockPrisma.accessGrant.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ sourceType: "order" }),
      }),
    );
  });

  it("anonymous without orderId denies without any grant/order query", async () => {
    const result = await resolveProductAccess({
      productId: PRODUCT_ID,
    });

    expect(result.allowed).toBe(false);
    expect(mockPrisma.accessGrant.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.order.findFirst).not.toHaveBeenCalled();
  });

  it("session path wins: userId grant allowed -> order path never reached", async () => {
    mockPrisma.accessGrant.findFirst.mockResolvedValue({ id: GRANT_ID });

    const result = await resolveProductAccess({
      userId: USER_ID,
      productId: PRODUCT_ID,
      orderId: "order_ls_abc123",
    });

    expect(result.allowed).toBe(true);
    expect(mockPrisma.order.findFirst).not.toHaveBeenCalled();
  });
});

describe("resolveProductAccess — expiresAt handling", () => {
  it("includes OR clause: null OR future expiresAt match", async () => {
    mockPrisma.accessGrant.findFirst.mockResolvedValue({ id: GRANT_ID });
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

  it("does NOT match grant with past expiresAt (treated as missing)", async () => {
    mockPrisma.accessGrant.findFirst.mockResolvedValue(null);
    const result = await resolveProductAccess({
      userId: USER_ID,
      productId: PRODUCT_ID,
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe(ProductAccessDenyReason.NoActiveAccessGrant);
    } else {
      throw new Error("expected allowed=false branch");
    }
  });
});

describe("resolveProductAccess — sourceTypes honored uniformly", () => {
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
      });
      const result = await resolveProductAccess({
        userId: USER_ID,
        productId: PRODUCT_ID,
      });
      expect(result.allowed).toBe(true);
      if (result.allowed) {
        expect(result.source).toBe("grant");
        expect(result.grantId).toBe(`${fixture.sourceType}-grant`);
      } else {
        throw new Error("expected allowed=true branch");
      }
    });
  }
});

describe("resolveProductAccess — status filter", () => {
  it("filters strictly on status='active' (revoked grants are denied)", async () => {
    mockPrisma.accessGrant.findFirst.mockResolvedValue(null);
    await resolveProductAccess({
      userId: USER_ID,
      productId: PRODUCT_ID,
    });
    const whereArg = mockPrisma.accessGrant.findFirst.mock.calls[0]?.[0]?.where;
    expect(whereArg).toEqual(
      expect.objectContaining({ status: "active" }),
    );
  });

  it("denies when status='revoked' (the underlying `findFirst` returns null because filter blocks)", async () => {
    mockPrisma.accessGrant.findFirst.mockResolvedValue(null);
    const result = await resolveProductAccess({
      userId: USER_ID,
      productId: PRODUCT_ID,
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe(ProductAccessDenyReason.NoActiveAccessGrant);
    } else {
      throw new Error("expected allowed=false branch");
    }
  });
});

// ─── AccessGrant matrix — exhaustive grant contract ────────────────
describe("resolveProductAccess — AccessGrant matrix (V2 contract pin)", () => {
  describe("allow_matrix: (sourceType, status='active', expiresAt∈{null|future})", () => {
    it.each([
      // [sourceType, sourceId, expiresAt kind] — expiresAt is null
      ["order", "order-1", null],
      ["free_enrollment", "free_enrollment:u:p", null],
      ["admin", "admin-1", null],
      ["bundle", "bundle-1", null],
      ["watchlist", "watchlist-1", null],
      // expiresAt is a future timestamp
      ["order", "order-2-future", "future"],
      ["free_enrollment", "free-future", "future"],
      ["admin", "admin-future", "future"],
      ["bundle", "bundle-future", "future"],
      ["watchlist", "watchlist-future", "future"],
    ] as const)(
      "sourceType='%s' expiresAt=%s → allowed:true grantId set",
      async (sourceType, sourceId, _expiresAtKind) => {
        mockPrisma.accessGrant.findFirst.mockResolvedValueOnce({
          id: `grant-${sourceType}-${sourceId}`,
        });
        const result = await resolveProductAccess({
          userId: USER_ID,
          productId: PRODUCT_ID,
        });

        expect(result.allowed).toBe(true);
        if (result.allowed) {
          expect(result.source).toBe("grant");
          expect(result.grantId).toBe(`grant-${sourceType}-${sourceId}`);
        } else {
          throw new Error("expected allowed=true branch");
        }
      },
    );

    it("where clause covers expiresAt IS NULL OR expiresAt > now()", async () => {
      mockPrisma.accessGrant.findFirst.mockResolvedValueOnce({ id: GRANT_ID });
      const pastDate = new Date(Date.now() - 86_400_000);
      await resolveProductAccess({
        userId: USER_ID,
        productId: PRODUCT_ID,
      });

      const whereArg = mockPrisma.accessGrant.findFirst.mock.calls[0]?.[0]?.where;
      expect(whereArg).toEqual(
        expect.objectContaining({
          status: "active",
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: expect.any(Date) } },
          ],
        }),
      );
      const gtBranch = (whereArg as { OR: Record<string, unknown>[] }).OR[1] as {
        expiresAt: { gt: Date };
      };
      expect(gtBranch.expiresAt.gt.getTime()).toBeGreaterThanOrEqual(pastDate.getTime());
    });
  });

  describe("deny_status_matrix: status∈{'revoked','expired'}", () => {
    it.each([
      ["revoked"],
      ["expired"],
    ] as const)(
      "status='%s' on AccessGrant row → denied (SQL filter returns null)",
      async (lifecycleStatus) => {
        mockPrisma.accessGrant.findFirst.mockResolvedValueOnce(null);

        const result = await resolveProductAccess({
          userId: USER_ID,
          productId: PRODUCT_ID,
        });

        expect(result.allowed).toBe(false);
        if (!result.allowed) {
          expect(result.reason).toBe(ProductAccessDenyReason.NoActiveAccessGrant);
        } else {
          throw new Error("expected allowed=false branch");
        }

        const whereArg = mockPrisma.accessGrant.findFirst.mock.calls[0]?.[0]?.where;
        expect(whereArg).toEqual(expect.objectContaining({ status: "active" }));

        expect(lifecycleStatus).toMatch(/revoked|expired/);
      },
    );
  });

  describe("deny_expiry_matrix: status='active' AND past expiresAt", () => {
    it("granted row with past expiresAt is excluded by the OR clause", async () => {
      mockPrisma.accessGrant.findFirst.mockResolvedValueOnce(null);
      const result = await resolveProductAccess({
        userId: USER_ID,
        productId: PRODUCT_ID,
      });
      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.reason).toBe(ProductAccessDenyReason.NoActiveAccessGrant);
      } else {
        throw new Error("expected allowed=false branch");
      }
    });

    it("active grant with expiresAt exactly NOW (boundary) is DENIED (gt is strict greater-than)", async () => {
      mockPrisma.accessGrant.findFirst.mockResolvedValueOnce(null);
      const result = await resolveProductAccess({
        userId: USER_ID,
        productId: PRODUCT_ID,
      });
      expect(result.allowed).toBe(false);
    });

    it("active grant with expiresAt 1 second in the future is ALLOWED", async () => {
      mockPrisma.accessGrant.findFirst.mockResolvedValueOnce({ id: GRANT_ID });
      const result = await resolveProductAccess({
        userId: USER_ID,
        productId: PRODUCT_ID,
      });
      expect(result.allowed).toBe(true);
    });
  });
});
