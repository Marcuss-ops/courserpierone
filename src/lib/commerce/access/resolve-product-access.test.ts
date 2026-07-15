/**
 * Tests for src/lib/commerce/access/resolve-product-access.ts.
 *
 * MCR Phase 2/3 — central access resolver.
 *
 * Coverage:
 *   - flag OFF (default): legacy Order.findFirst path. Returns
 *     source:'legacy-order' OR deny NoCompletedOrder.
 *   - flag ON: AccessGrant.findFirst path. Returns source:'grant' +
 *     grantId OR deny NoValidAccessGrant.
 *   - Defensive guards: missing userId or productId → deny
 *     NoCompletedOrder without DB hit.
 *   - expiresAt clause: past timestamp → not active (treated as missing).
 *     future timestamp → active. null → active (no expiry).
 *   - Status filter: revoked grants denied, active grants allowed.
 *   - Spec-literal shape: `{ allowed: true; grantId?: string; source: ... }`.
 *     Tests verify grantId is populated on 'grant' branch and
 *     undefined on 'legacy-order' branch.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
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
const GRANT_ID = "grant-42";
const ORDER_ID = "order-42";

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("resolveProductAccess — defensive guards", () => {
  it("denies with NoCompletedOrder when userId is empty (no DB hit)", async () => {
    const result = await resolveProductAccess({
      userId: "",
      productId: PRODUCT_ID,
    });
    expect(result).toEqual({
      allowed: false,
      reason: ProductAccessDenyReason.NoCompletedOrder,
    });
    expect(mockPrisma.order.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.accessGrant.findFirst).not.toHaveBeenCalled();
  });

  it("denies with NoCompletedOrder when productId is empty (no DB hit)", async () => {
    const result = await resolveProductAccess({
      userId: USER_ID,
      productId: "",
    });
    expect(result.allowed).toBe(false);
    expect(mockPrisma.order.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.accessGrant.findFirst).not.toHaveBeenCalled();
  });
});

describe("resolveProductAccess — flag OFF (legacy Order read)", () => {
  it("returns source:'legacy-order' with undefined grantId when Order.findFirst hits", async () => {
    mockPrisma.order.findFirst.mockResolvedValue({ id: ORDER_ID });

    const result = await resolveProductAccess({
      userId: USER_ID,
      productId: PRODUCT_ID,
    });

    // Spec-literal shape: allowed true, source literal, grantId optional.
    expect(result).toMatchObject({ allowed: true, source: "legacy-order" });
    if (result.allowed) {
      // Consumer must check `result.grantId` against undefined
      // (single success branch — no `result.source === 'grant'`
      // discriminator available at type level).
      expect(result.source).toBe("legacy-order");
      expect(result.grantId).toBeUndefined();
    } else {
      throw new Error("expected allowed=true branch");
    }
    expect(mockPrisma.order.findFirst).toHaveBeenCalledWith({
      where: {
        userId: USER_ID,
        productId: PRODUCT_ID,
        status: "completed",
      },
      select: { id: true },
    });
    // Legacy path must NOT touch AccessGrant.
    expect(mockPrisma.accessGrant.findFirst).not.toHaveBeenCalled();
  });

  it("denies with NoCompletedOrder when Order.findFirst returns null", async () => {
    mockPrisma.order.findFirst.mockResolvedValue(null);

    const result = await resolveProductAccess({
      userId: USER_ID,
      productId: PRODUCT_ID,
    });

    expect(result).toEqual({
      allowed: false,
      reason: ProductAccessDenyReason.NoCompletedOrder,
    });
  });
});

describe("resolveProductAccess — flag ON (AccessGrant read)", () => {
  beforeEach(() => {
    vi.stubEnv("USE_ACCESS_GRANT_RESOLVER", "true");
  });

  it("returns source:'grant' + grantId when AccessGrant.findFirst hits status=active", async () => {
    mockPrisma.accessGrant.findFirst.mockResolvedValue({ id: GRANT_ID });

    const result = await resolveProductAccess({
      userId: USER_ID,
      productId: PRODUCT_ID,
    });

    // Spec-literal shape: grantId populated on the 'grant' branch.
    expect(result).toMatchObject({
      allowed: true,
      source: "grant",
      grantId: GRANT_ID,
    });
    if (result.allowed) {
      expect(result.source).toBe("grant");
      // grantId non-null when source='grant' (the resolver always sets it).
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
    // Grant path must NOT touch Order — no double-query.
    expect(mockPrisma.order.findFirst).not.toHaveBeenCalled();
  });

  it("denies with NoValidAccessGrant when AccessGrant.findFirst returns null", async () => {
    mockPrisma.accessGrant.findFirst.mockResolvedValue(null);

    const result = await resolveProductAccess({
      userId: USER_ID,
      productId: PRODUCT_ID,
    });

    expect(result).toEqual({
      allowed: false,
      reason: ProductAccessDenyReason.NoValidAccessGrant,
    });
  });

  it("excludes past-expiresAt grants via OR clause (only null OR future expiresAt match)", async () => {
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
});
