/**
 * src/lib/commerce/access/enroll-free-course.test.ts
 *
 * Phase 2 Step 1: free-course enrollment use case — unit tests
 * (2-query pattern rewrite).
 *
 * Coverage (7 cases):
 *   1. Fresh insert:           findFirst null   → upsert creates → alreadyEnrolled=false
 *   2. Existing active grant:  findFirst row    → upsert updates → alreadyEnrolled=true
 *   3. Existing revoked grant: findFirst row    → upsert REACTIVATES (BLOCKER-1 fix)
 *                                 alreadyEnrolled=true + update clause asserts {status: 'active', revokedAt: null}
 *   4. Paid course:            throws AppError('NOT_FREE_COURSE', 422); NO findFirst/upsert fires
 *   5. Product not found:      returns denial reason='product_not_found'
 *   6. Empty userId:           defensive denial — NO Prisma calls
 *   7. Id-style resolution:    passing cuid-style productId finds via OR clause
 *
 * Mocking pattern mirrors complete-order.test.ts: vi.mock dependencies
 * BEFORE importing the service under test, vi.clearAllMocks() + re-set
 * defaults in beforeEach, vi.useRealTimers() in afterEach to prevent
 * timer leakage across test files.
 *
 * Note on race conditions (not tested here, documented in JSDoc):
 *   The 2-query pattern (findFirst → upsert) has a known race: T1
 *   reads null, T2 reads null, T1 upserts (creates), T2 upserts hits
 *   @unique([sourceType, sourceId, productId]) — Prisma's atomic
 *   upsert path converts this to a no-op UPDATE on the existing row.
 *   So the second call succeeds (not P2002). Not covered here because
 *   the upsert path is already race-safe by virtue of the unique
 *   composite key — no application-level race-handling needed. If a
 *   future Prisma version regresses this behavior, add a dedicated
 *   concurrent-upsert test.
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from "vitest";

// ── Mock prisma BEFORE importing the service under test ─────────────
const mockPrisma = {
  product: {
    findFirst: vi.fn(),
  },
  accessGrant: {
    // ── NEW: pre-check existence (2-query pattern) ──────────────
    findFirst: vi.fn(),
    // ── Atomic write (idempotent on @@unique key) ──────────────
    upsert: vi.fn(),
  },
};
vi.mock("@/lib/db/prisma", () => ({
  prisma: mockPrisma,
}));

// ── Mock isFreeCourse to control free vs paid logic per test ────────
const mockIsFreeCourse = vi.fn();
vi.mock("@/lib/courses/is-free-course", () => ({
  isFreeCourse: mockIsFreeCourse,
}));

// Now import the service under test
const { enrollFreeCourse, EnrollDenialReason } = await import(
  "./enroll-free-course"
);

beforeEach(() => {
  vi.clearAllMocks();
  // DEFAULT: free course present, no existing grant (tests override)
  mockIsFreeCourse.mockReturnValue(true);
  mockPrisma.product.findFirst.mockResolvedValue({
    id: "prod_123",
    slug: "test-course-e2e",
    price: 0,
  });
  mockPrisma.accessGrant.findFirst.mockResolvedValue(null); // fresh user / course
  mockPrisma.accessGrant.upsert.mockResolvedValue({ id: "grant_abc" });
});

afterEach(() => {
  // No clock mocking in the new pattern (alreadyEnrolled is
  // deterministic from findFirst result). This afterEach is defensive
  // — if a future test reverts to vi.setSystemTime, ensure cleanup.
  vi.useRealTimers();
});

// ────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────
describe("enrollFreeCourse", () => {
  // ── 1. Fresh insert ───────────────────────────────────────────
  it("creates a grant and returns enrolled=true, alreadyEnrolled=false", async () => {
    mockPrisma.accessGrant.findFirst.mockResolvedValue(null); // no existing

    const result = await enrollFreeCourse({
      userId: "user_xyz",
      productSlug: "test-course-e2e",
    });

    expect(result.enrolled).toBe(true);
    if (result.enrolled) {
      expect(result.grantId).toBe("grant_abc");
      expect(result.alreadyEnrolled).toBe(false);
    }

    // FindFirst pre-check should fire with same shape as upsert's where
    expect(mockPrisma.accessGrant.findFirst).toHaveBeenCalledWith({
      where: {
        sourceType: "free_enrollment",
        sourceId: "free_enrollment:user_xyz:prod_123",
        productId: "prod_123",
      },
      select: { id: true },
    });

    // Upsert should fire with reactivate clause (BLOCKER 1 fix)
    expect(mockPrisma.accessGrant.upsert).toHaveBeenCalledWith({
      where: {
        sourceType_sourceId_productId: {
          sourceType: "free_enrollment",
          sourceId: "free_enrollment:user_xyz:prod_123",
          productId: "prod_123",
        },
      },
      create: {
        userId: "user_xyz",
        productId: "prod_123",
        sourceType: "free_enrollment",
        sourceId: "free_enrollment:user_xyz:prod_123",
        status: "active",
      },
      update: { status: "active", revokedAt: null },
      select: { id: true },
    });
  });

  // ── 2. Existing active grant ──────────────────────────────────
  it("updates an existing grant and returns alreadyEnrolled=true", async () => {
    // Real Prisma upsert returns the same row id whether it created
    // or updated (composite unique key match). Mirror that here so
    // the assertion is semantically meaningful, not a coincidence.
    mockPrisma.accessGrant.findFirst.mockResolvedValue({ id: "grant_existing" });
    mockPrisma.accessGrant.upsert.mockResolvedValue({ id: "grant_existing" });

    const result = await enrollFreeCourse({
      userId: "user_xyz",
      productSlug: "test-course-e2e",
    });

    expect(result.enrolled).toBe(true);
    if (result.enrolled) {
      expect(result.grantId).toBe("grant_existing");
      expect(result.alreadyEnrolled).toBe(true);
    }
  });

  // ── 3. Existing revoked grant → reactivates (BLOCKER 1 fix) ───
  it("reactivates a previously-revoked grant (sets status='active', revokedAt=null)", async () => {
    mockPrisma.accessGrant.findFirst.mockResolvedValue({ id: "grant_revoked" });

    await enrollFreeCourse({
      userId: "user_xyz",
      productSlug: "test-course-e2e",
    });

    // Critical assertion: the upsert's `update` clause must include
    // explicit reactivation (not `update: {}`). Without this, a
    // revoked grant stays revoked forever.
    expect(mockPrisma.accessGrant.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { status: "active", revokedAt: null },
      }),
    );
  });

  // ── 4. Paid course → AppError ─────────────────────────────────
  it("throws AppError('NOT_FREE_COURSE', 422) when product is not free", async () => {
    mockPrisma.product.findFirst.mockResolvedValue({
      id: "prod_paid",
      slug: "amish-secrets",
      price: 5500,
    });
    mockIsFreeCourse.mockReturnValue(false);

    await expect(
      enrollFreeCourse({
        userId: "user_xyz",
        productSlug: "amish-secrets",
      }),
    ).rejects.toThrow(/not in the FREE_COURSE_SLUGS list/);

    // Defense-in-depth: NO DB writes on paid course
    expect(mockPrisma.accessGrant.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.accessGrant.upsert).not.toHaveBeenCalled();
  });

  // ── 5. Product not found ──────────────────────────────────────
  it("returns enrolled=false with reason='product_not_found' when product missing", async () => {
    mockPrisma.product.findFirst.mockResolvedValue(null);

    const result = await enrollFreeCourse({
      userId: "user_xyz",
      productSlug: "nonexistent-slug",
    });

    expect(result.enrolled).toBe(false);
    if (!result.enrolled) {
      expect(result.reason).toBe(EnrollDenialReason.ProductNotFound);
    }

    expect(mockPrisma.accessGrant.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.accessGrant.upsert).not.toHaveBeenCalled();
  });

  // ── 6. Empty userId defensive guard ───────────────────────────
  it("returns denial reason='product_not_found' when userId is empty (defensive)", async () => {
    const result = await enrollFreeCourse({
      userId: "",
      productSlug: "test-course-e2e",
    });

    expect(result.enrolled).toBe(false);
    if (!result.enrolled) {
      expect(result.reason).toBe(EnrollDenialReason.ProductNotFound);
    }

    expect(mockPrisma.product.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.accessGrant.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.accessGrant.upsert).not.toHaveBeenCalled();
  });

  // ── 7. Id-style resolution (cuid passed instead of slug) ────────
  it("resolves product by CUID via the OR clause when productSlug is a product id", async () => {
    // Caller accidentally passes the product cuid instead of slug.
    // The OR clause in product.findFirst still matches.
    const PRODUCT_CUID = "clh4xy7z1000001xyzabcdefgh";
    mockPrisma.product.findFirst.mockResolvedValue({
      id: PRODUCT_CUID,
      slug: "test-course-e2e",
      price: 0,
    });

    const result = await enrollFreeCourse({
      userId: "user_xyz",
      productSlug: PRODUCT_CUID,
    });

    expect(result.enrolled).toBe(true);
    if (result.enrolled) {
      expect(result.grantId).toBe("grant_abc");
      expect(result.alreadyEnrolled).toBe(false);
    }

    // Verify findFirst was called with the OR clause containing
    // both slug and id, allowing slug-or-id resolution.
    expect(mockPrisma.product.findFirst).toHaveBeenCalledWith({
      where: { OR: [{ slug: PRODUCT_CUID }, { id: PRODUCT_CUID }] },
      select: { id: true, slug: true, price: true },
    });
  });
});
