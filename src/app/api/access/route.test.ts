import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

// ─── Mock helpers (SSOT seam) ──────────────────────────────
// Step 9 — MCR Phase 3 cutover: BOTH the session-keyed AND the
// orderId-keyed (Pattern B) reads go through AccessGrant. The route:
//   - session-keyed → `resolveProductAccess` resolver (helper).
//   - orderId-keyed → `prisma.accessGrant.findFirst` directly (Pattern B).
//
// `findCompletedOrderByOrderId` is REMOVED — its prior Order.status
// read is replaced by the canonical grant query keyed by
// `(sourceType='order' AND sourceId=orderId AND productId)`.
const mockResolveProductAccess = vi.fn();

vi.mock("@/lib/commerce/access/resolve-product-access", () => ({
  resolveProductAccess: mockResolveProductAccess,
}));

// ─── Mock Supabase user ────────────────────────────────────
const mockGetServerUser = vi.fn();

vi.mock("@/lib/supabase/get-user", () => ({
  getServerUser: mockGetServerUser,
}));

// ─── Mock Prisma (product.findFirst + accessGrant.findFirst) ───
//
// V2 — Pattern B reads `prisma.accessGrant.findFirst` directly. Both
// queries surface in this mock; tests use the appropriate one.
const mockPrisma = {
  product: {
    findFirst: vi.fn(),
  },
  accessGrant: {
    findFirst: vi.fn(),
  },
};

vi.mock("@/lib/db/prisma", () => ({
  prisma: mockPrisma,
}));

// ─── Mock rate limit (no-op wrapper) ─────────────────────────
vi.mock("@/lib/utils/rate-limit", () => ({
  withRateLimit: <T,>(fn: T) => fn,
}));

// ─── Helpers ─────────────────────────────────────────────────
const FAKE_PRODUCT_ID = "cp-product-1";
const FAKE_PRODUCT_SLUG = "test-course";
const FAKE_USER_ID = "cu-user-1";
const FAKE_PROVIDER_ORDER_ID = "cs_test_aBc123";
const FAKE_GRANT_ID = "grant-1";

function createMockRequest(query: Record<string, string> = {}) {
  const url = new URL("http://localhost:3000/api/access");
  for (const [k, v] of Object.entries(query)) {
    url.searchParams.set(k, v);
  }
  return {
    nextUrl: { searchParams: url.searchParams },
    url: url.toString(),
    headers: new Map(),
  } as unknown as NextRequest;
}

// ─── Test fixtures ──────────────────────────────────────────

const mockAdmin = () =>
  mockGetServerUser.mockResolvedValueOnce({
    supabase: null,
    user: { email: "admin@test.com" },
    dbUser: { id: FAKE_USER_ID, role: "admin" },
  });

const mockLoggedInCustomer = () =>
  mockGetServerUser.mockResolvedValueOnce({
    supabase: null,
    user: { email: "customer@test.com" },
    dbUser: { id: FAKE_USER_ID, role: "student" },
  });

const mockAnonymous = () =>
  mockGetServerUser.mockResolvedValueOnce({
    supabase: null,
    user: null,
    dbUser: null,
  });

const mockProductFound = () =>
  mockPrisma.product.findFirst.mockResolvedValueOnce({
    id: FAKE_PRODUCT_ID,
    slug: FAKE_PRODUCT_SLUG,
  });

// ─── Tests ───────────────────────────────────────────────────
describe("GET /api/access — auth semantics probe", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // ── Edge cases ────────────────────────────────────────────

  it("returns hasAccess:false when productId query param is missing", async () => {
    mockAnonymous();
    const { GET } = await import("./route");
    const response = await GET(createMockRequest({}));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.hasAccess).toBe(false);
    // Critical: NO prisma hit when productId is missing (early return before DB)
    expect(mockPrisma.product.findFirst).not.toHaveBeenCalled();
  });

  it("returns hasAccess:false when product slug/id is not found", async () => {
    mockLoggedInCustomer();
    mockPrisma.product.findFirst.mockResolvedValueOnce(null);
    // resolveProductAccess would have been called if we reached that
    // point, so ensure it ISN'T called for unknown products.
    mockResolveProductAccess.mockResolvedValueOnce({
      allowed: true,
      grantId: FAKE_GRANT_ID,
      source: "grant",
    });

    const { GET } = await import("./route");
    const response = await GET(createMockRequest({ productId: "ghost-product" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.hasAccess).toBe(false);
    expect(mockResolveProductAccess).not.toHaveBeenCalled();
  });

  // ── Anonymous (Pattern B may still grant via valid orderId) ──

  it("anonymous: returns hasAccess:false without orderId", async () => {
    mockAnonymous();
    mockProductFound();
    const { GET } = await import("./route");
    const response = await GET(createMockRequest({ productId: FAKE_PRODUCT_SLUG }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.hasAccess).toBe(false);
    expect(body.userId).toBeUndefined();
    // No user -> resolveProductAccess is not called; Pattern B
    // requires an explicit orderId query param.
    expect(mockResolveProductAccess).not.toHaveBeenCalled();
  });

  it("anonymous with valid orderId (Pattern B): returns hasAccess:true", async () => {
    mockAnonymous();
    mockProductFound();
    // V2 — Pattern B reads `prisma.accessGrant.findFirst` keyed by
    // (sourceType='order' AND sourceId=orderId AND productId). The
    // grant row IS the SSOT link between the Order and authorization.
    mockPrisma.accessGrant.findFirst.mockResolvedValueOnce({
      id: FAKE_GRANT_ID,
    });

    const { GET } = await import("./route");
    const response = await GET(
      createMockRequest({ productId: FAKE_PRODUCT_SLUG, orderId: FAKE_PROVIDER_ORDER_ID })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.hasAccess).toBe(true);
    // Note: guest (Pattern B) does NOT receive userId in response shape.
    expect(body.userId).toBeUndefined();
    // V2 invariant — the read queries AccessGrant (canonical SSOT),
    // not Order. Verify the WHERE clause shape explicitly.
    expect(mockPrisma.accessGrant.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          sourceType: "order",
          sourceId: FAKE_PROVIDER_ORDER_ID,
          productId: FAKE_PRODUCT_ID,
          status: "active",
          OR: expect.arrayContaining([
            expect.objectContaining({ expiresAt: null }),
            expect.objectContaining({ expiresAt: expect.any(Object) }),
          ]),
        }),
      }),
    );
  });

  it("anonymous with valid orderId but WRONG productId (cross-product exploit): hasAccess:false", async () => {
    mockAnonymous();
    mockProductFound();
    // Wrong productId means different productId in the WHERE → SQL
    // filter excludes the grant. findFirst returns null.
    mockPrisma.accessGrant.findFirst.mockResolvedValueOnce(null);

    const { GET } = await import("./route");
    const response = await GET(
      createMockRequest({ productId: FAKE_PRODUCT_SLUG, orderId: FAKE_PROVIDER_ORDER_ID })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.hasAccess).toBe(false);
    // Verify the WHERE clause carries the correct productId (defense
    // against cross-product scope-leak on Pattern B).
    expect(mockPrisma.accessGrant.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          sourceType: "order",
          sourceId: FAKE_PROVIDER_ORDER_ID,
          productId: FAKE_PRODUCT_ID,
        }),
      }),
    );
  });

  // ── Pattern B sourceType-uniform matrix ─────────────────
  // V2 — Pattern B reads the canonical grant table, not the Order.
  // The read is keyed by (sourceType='order' + sourceId), which is
  // invariant across all grant sourceTypes EXCEPT 'order' (Pattern B
  // IS the post-checkout orderId-keyed receipt).\n  // We assert the strict sourceType='order' boundary in the WHERE — a\n  // free_enrollment/admin/bundle grant with the same sourceId
  // (collision-test) MUST NOT satisfy Pattern B (defense against
  // accidental sourceId reuse).
  it("Pattern B requires sourceType='order' (collision with free_enrollment grant = deny)", async () => {
    mockAnonymous();
    mockProductFound();
    mockPrisma.accessGrant.findFirst.mockResolvedValueOnce(null);

    const { GET } = await import("./route");
    const response = await GET(
      createMockRequest({ productId: FAKE_PRODUCT_SLUG, orderId: FAKE_PROVIDER_ORDER_ID })
    );
    expect(response.status).toBe(200);
    expect((await response.json()).hasAccess).toBe(false);

    // The filter MUST pin sourceType='order' so that an arbitrary grant
    // with the same sourceId (e.g. a free_enrollment or admin grant
    // mistakenly sharing the id) cannot satisfy Pattern B.
    expect(mockPrisma.accessGrant.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ sourceType: "order" }),
      }),
    );
  });

  // ── Admin (inline bypass — different shape from customer) ──

  it("admin: returns hasAccess:true with userId (inline bypass, no resolver call)", async () => {
    mockAdmin();
    mockProductFound();

    const { GET } = await import("./route");
    const response = await GET(createMockRequest({ productId: FAKE_PRODUCT_SLUG }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.hasAccess).toBe(true);
    expect(body.userId).toBe(FAKE_USER_ID);
    // Admin bypass is INLINE — must not delegate to the resolver.
    expect(mockResolveProductAccess).not.toHaveBeenCalled();
  });

  // ── Customer with active AccessGrant (post-cutover canonical) ──

  it("customer with active AccessGrant: returns hasAccess:true with userId", async () => {
    mockLoggedInCustomer();
    mockProductFound();
    mockResolveProductAccess.mockResolvedValueOnce({
      allowed: true,
      grantId: FAKE_GRANT_ID,
      source: "grant",
    });

    const { GET } = await import("./route");
    const response = await GET(createMockRequest({ productId: FAKE_PRODUCT_SLUG }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.hasAccess).toBe(true);
    expect(body.userId).toBe(FAKE_USER_ID);
    expect(mockResolveProductAccess).toHaveBeenCalledWith({
      userId: FAKE_USER_ID,
      productId: FAKE_PRODUCT_ID,
    });
  });

  // ── Customer with no active grant ─────────────────────────

  it("customer with NO active grant: hasAccess:false", async () => {
    mockLoggedInCustomer();
    mockProductFound();
    mockResolveProductAccess.mockResolvedValueOnce({
      allowed: false,
      reason: "no_active_access_grant",
    });

    const { GET } = await import("./route");
    const response = await GET(createMockRequest({ productId: FAKE_PRODUCT_SLUG }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.hasAccess).toBe(false);
    expect(body.userId).toBeUndefined();
  });

  // ── Hierarchy: resolver wins over Pattern B orderId ────────
  // V3.1 invariant: when logged in AND an access check is needed,
  // resolveProductAccess runs first and decides. Pattern B is
  // only a fallback for guests.

  it("logged-in customer: resolver takes precedence over Pattern B orderId", async () => {
    mockLoggedInCustomer();
    mockProductFound();
    mockResolveProductAccess.mockResolvedValueOnce({
      allowed: true,
      grantId: FAKE_GRANT_ID,
      source: "grant",
    });

    const { GET } = await import("./route");
    const response = await GET(
      createMockRequest({ productId: FAKE_PRODUCT_SLUG, orderId: FAKE_PROVIDER_ORDER_ID })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.hasAccess).toBe(true);
    expect(body.userId).toBe(FAKE_USER_ID);
    // Resolver was attempted and succeeded — Pattern B (V2: the
    // accessGrant.findFirst query) never reached.
    expect(mockResolveProductAccess).toHaveBeenCalledTimes(1);
    expect(mockPrisma.accessGrant.findFirst).not.toHaveBeenCalled();
  });

  // ── Crash safety: unhandled error returns hasAccess:false (NOT 500) ──

  it("returns hasAccess:false when getServerUser throws unhandled error", async () => {
    mockGetServerUser.mockRejectedValueOnce(new Error("supabase down"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { GET } = await import("./route");
    const response = await GET(createMockRequest({ productId: FAKE_PRODUCT_SLUG }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.hasAccess).toBe(false);
    consoleSpy.mockRestore();
  });
});
