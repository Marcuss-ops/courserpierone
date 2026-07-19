import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import { fakeOrder } from "@/app/api/__test-helpers__/fake-order";

// ─── Mock helpers (SSOT seam) ──────────────────────────────
// Step 9 — MCR Phase 3 cutover: the session-keyed read goes through
// resolveProductAccess (canonical AccessGrant SSOT). findCompletedOrder
// is no longer imported by the route, so its mock is removed here.
const mockResolveProductAccess = vi.fn();
const mockFindCompletedOrderByOrderId = vi.fn();

vi.mock("@/lib/commerce/access/resolve-product-access", () => ({
  resolveProductAccess: mockResolveProductAccess,
}));

vi.mock("@/lib/access", () => ({
  findCompletedOrderByOrderId: mockFindCompletedOrderByOrderId,
}));

// ─── Mock Supabase user ────────────────────────────────────
const mockGetServerUser = vi.fn();

vi.mock("@/lib/supabase/get-user", () => ({
  getServerUser: mockGetServerUser,
}));

// ─── Mock Prisma (prisma.product.findFirst only — used by access route) ─
const mockPrisma = {
  product: {
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
    // Pattern B is preserved — it's a payment-receipt concern, not
    // an access-control concern.
    mockFindCompletedOrderByOrderId.mockResolvedValueOnce(
      fakeOrder({ providerOrderId: FAKE_PROVIDER_ORDER_ID }),
    );

    const { GET } = await import("./route");
    const response = await GET(
      createMockRequest({ productId: FAKE_PRODUCT_SLUG, orderId: FAKE_PROVIDER_ORDER_ID })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.hasAccess).toBe(true);
    // Note: guest (Pattern B) does NOT receive userId in response shape.
    expect(body.userId).toBeUndefined();
    expect(mockFindCompletedOrderByOrderId).toHaveBeenCalledWith({
      orderId: FAKE_PROVIDER_ORDER_ID,
      productId: FAKE_PRODUCT_ID,
    });
  });

  it("anonymous with valid orderId but WRONG productId (cross-product exploit): hasAccess:false", async () => {
    mockAnonymous();
    mockProductFound();
    mockFindCompletedOrderByOrderId.mockResolvedValueOnce(null);

    const { GET } = await import("./route");
    const response = await GET(
      createMockRequest({ productId: FAKE_PRODUCT_SLUG, orderId: FAKE_PROVIDER_ORDER_ID })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.hasAccess).toBe(false);
    expect(mockFindCompletedOrderByOrderId).toHaveBeenCalledWith({
      orderId: FAKE_PROVIDER_ORDER_ID,
      productId: FAKE_PRODUCT_ID,
    });
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
    // Resolver was attempted and succeeded — Pattern B never reached.
    expect(mockResolveProductAccess).toHaveBeenCalledTimes(1);
    expect(mockFindCompletedOrderByOrderId).not.toHaveBeenCalled();
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
