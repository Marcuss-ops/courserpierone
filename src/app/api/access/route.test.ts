import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
// ─── Mock helpers (SSOT seam) ──────────────────────────────
const mockFindCompletedOrder = vi.fn();
const mockFindCompletedOrderByOrderId = vi.fn();

vi.mock("@/lib/access/find-completed-order", () => ({
  findCompletedOrder: mockFindCompletedOrder,
}));

vi.mock("@/lib/access/find-completed-order-by-order-id", () => ({
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
const FAKE_ORDER_ID = "ck-order-1";
const FAKE_PROVIDER_ORDER_ID = "cs_test_aBc123";

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

const fakeOrder = (overrides: Partial<Order> = {}) =>
  ({
    id: FAKE_ORDER_ID,
    userId: FAKE_USER_ID,
    productId: FAKE_PRODUCT_ID,
    providerOrderId: FAKE_PROVIDER_ORDER_ID,
    locale: "it",
    ...overrides,
  } as unknown as Awaited<ReturnType<typeof mockFindCompletedOrder>>);

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
  mockPrisma.product.findFirst.mockResolvedValueOnce({ id: FAKE_PRODUCT_ID, slug: FAKE_PRODUCT_SLUG });

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
    // findCompletedOrder would have been called if we reached that point,
    // so ensure it ISN'T called for unknown products.
    mockFindCompletedOrder.mockResolvedValueOnce(fakeOrder());

    const { GET } = await import("./route");
    const response = await GET(createMockRequest({ productId: "ghost-product" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.hasAccess).toBe(false);
    expect(mockFindCompletedOrder).not.toHaveBeenCalled();
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
    expect(mockFindCompletedOrder).not.toHaveBeenCalled(); // no user → no Pattern A
  });

  it("anonymous with valid orderId (Pattern B): returns hasAccess:true", async () => {
    mockAnonymous();
    mockProductFound();
    mockFindCompletedOrderByOrderId.mockResolvedValueOnce(fakeOrder());

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
    // Critical security test: a real orderId for product A must NOT unlock product B.
    mockAnonymous();
    mockProductFound();
    // The helper itself enforces this: returns null when scope mismatches.
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

  it("admin: returns hasAccess:true with userId (inline bypass, no helper call)", async () => {
    mockAdmin();
    mockProductFound();

    const { GET } = await import("./route");
    const response = await GET(createMockRequest({ productId: FAKE_PRODUCT_SLUG }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.hasAccess).toBe(true);
    expect(body.userId).toBe(FAKE_USER_ID);
    // Admin bypass is INLINE — must not delegate to the helper.
    expect(mockFindCompletedOrder).not.toHaveBeenCalled();
  });

  // ── Customer with completed order (Pattern A via session) ──

  it("customer with completed order (Pattern A): returns hasAccess:true with userId", async () => {
    mockLoggedInCustomer();
    mockProductFound();
    mockFindCompletedOrder.mockResolvedValueOnce(fakeOrder());

    const { GET } = await import("./route");
    const response = await GET(createMockRequest({ productId: FAKE_PRODUCT_SLUG }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.hasAccess).toBe(true);
    expect(body.userId).toBe(FAKE_USER_ID);
    expect(mockFindCompletedOrder).toHaveBeenCalledWith({
      userId: FAKE_USER_ID,
      productId: FAKE_PRODUCT_ID,
    });
  });

  // ── Customer with pending order (order NOT completed) ──────

  it("customer with PENDING order (not completed): hasAccess:false", async () => {
    mockLoggedInCustomer();
    mockProductFound();
    mockFindCompletedOrder.mockResolvedValueOnce(null);

    const { GET } = await import("./route");
    const response = await GET(createMockRequest({ productId: FAKE_PRODUCT_SLUG }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.hasAccess).toBe(false);
    expect(body.userId).toBeUndefined();
  });

  // ── Customer with no order ────────────────────────────────

  it("customer with NO order ever: hasAccess:false", async () => {
    mockLoggedInCustomer();
    mockProductFound();
    mockFindCompletedOrder.mockResolvedValueOnce(null);

    const { GET } = await import("./route");
    const response = await GET(createMockRequest({ productId: FAKE_PRODUCT_SLUG }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.hasAccess).toBe(false);
  });

  // ── Hierarchy test: Pattern A wins over Pattern B ────────
  // V3.1 invariant: when logged in AND order exists AND orderId
  // is also passed, Pattern A (user-keyed) is checked first and
  // it wins. Pattern B is only a fallback for guests.

  it("logged-in customer: Pattern A takes precedence over Pattern B orderId", async () => {
    mockLoggedInCustomer();
    mockProductFound();
    mockFindCompletedOrder.mockResolvedValueOnce(fakeOrder());

    const { GET } = await import("./route");
    const response = await GET(
      createMockRequest({ productId: FAKE_PRODUCT_SLUG, orderId: FAKE_PROVIDER_ORDER_ID })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.hasAccess).toBe(true);
    expect(body.userId).toBe(FAKE_USER_ID);
    // Pattern A was attempted first and succeeded — Pattern B never reached.
    expect(mockFindCompletedOrder).toHaveBeenCalledTimes(1);
    expect(mockFindCompletedOrderByOrderId).not.toHaveBeenCalled();
  });

  // ── Crash safety: unhandled error returns hasAccess:false (NOT 500) ──

  it("returns hasAccess:false when getServerUser throws unhandled error", async () => {
    mockGetServerUser.mockRejectedValueOnce(new Error("supabase down"));
    // Suppress expected console.error from the route's catch block.
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { GET } = await import("./route");
    const response = await GET(createMockRequest({ productId: FAKE_PRODUCT_SLUG }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.hasAccess).toBe(false);
    consoleSpy.mockRestore();
  });
});
