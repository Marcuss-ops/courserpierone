import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

// ─── Mock helpers (SSOT seam) ──────────────────────────────
// Post-consolidation contract: the route contains ZERO access logic
// and ZERO prisma queries. It only parses the request, delegates to
// `resolveProductAccess`, and maps the verdict to `{ hasAccess }`.
// Product resolution (slug|id), admin bypass, session grants and the
// anonymous orderId path all live in the resolver — tested in
// `resolve-product-access.test.ts`. This suite pins the thin route
// contract: input parsing, parameter forwarding, response mapping,
// crash safety.
const mockResolveProductAccess = vi.fn();

vi.mock("@/lib/commerce/access/resolve-product-access", () => ({
  resolveProductAccess: mockResolveProductAccess,
}));

// ─── Mock Supabase user ────────────────────────────────────
const mockGetServerUser = vi.fn();

vi.mock("@/lib/supabase/get-user", () => ({
  getServerUser: mockGetServerUser,
}));

// ─── Mock rate limit (no-op wrapper) ─────────────────────────
vi.mock("@/lib/utils/rate-limit", () => ({
  withRateLimit: <T,>(fn: T) => fn,
}));

// ─── Helpers ─────────────────────────────────────────────────
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

// Post-contract-change shape: the resolver returns a uniform
// `{ hasAccess, reason, productId, orderId }`. The route only maps
// `hasAccess` (and exposes `userId` for session-keyed allows).
const mockAllowed = (overrides: Partial<{ orderId: string | null }> = {}) =>
  mockResolveProductAccess.mockResolvedValueOnce({
    hasAccess: true,
    reason: "active_purchase",
    productId: FAKE_PRODUCT_SLUG,
    orderId: overrides.orderId ?? FAKE_GRANT_ID,
  });

const mockDenied = () =>
  mockResolveProductAccess.mockResolvedValueOnce({
    hasAccess: false,
    reason: "not_purchased",
    productId: FAKE_PRODUCT_SLUG,
    orderId: null,
  });

// ─── Tests ───────────────────────────────────────────────────
describe("GET /api/access — thin auth semantics probe", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns hasAccess:false when productId query param is missing (resolver not called)", async () => {
    mockAnonymous();
    const { GET } = await import("./route");
    const response = await GET(createMockRequest({}));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.hasAccess).toBe(false);
    // Early return BEFORE any delegation — no resolver hit.
    expect(mockResolveProductAccess).not.toHaveBeenCalled();
  });

  it("forwards productId (slug) + anonymous identity to the resolver and maps deny", async () => {
    mockAnonymous();
    mockDenied();

    const { GET } = await import("./route");
    const response = await GET(createMockRequest({ productId: FAKE_PRODUCT_SLUG }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.hasAccess).toBe(false);
    expect(body.userId).toBeUndefined();
    // The route passes the raw slug — product resolution is the
    // resolver's job now.
    expect(mockResolveProductAccess).toHaveBeenCalledWith({
      userId: undefined,
      userRole: undefined,
      productId: FAKE_PRODUCT_SLUG,
      orderId: undefined,
    });
  });

  it("forwards orderId (Pattern B guest) and maps allow WITHOUT userId", async () => {
    mockAnonymous();
    mockAllowed();

    const { GET } = await import("./route");
    const response = await GET(
      createMockRequest({ productId: FAKE_PRODUCT_SLUG, orderId: FAKE_PROVIDER_ORDER_ID })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.hasAccess).toBe(true);
    // Guest (orderId-keyed) does NOT receive userId in the response.
    expect(body.userId).toBeUndefined();
    expect(mockResolveProductAccess).toHaveBeenCalledWith({
      userId: undefined,
      userRole: undefined,
      productId: FAKE_PRODUCT_SLUG,
      orderId: FAKE_PROVIDER_ORDER_ID,
    });
  });

  it("accepts the legacy order_id query param alias", async () => {
    mockAnonymous();
    mockAllowed();

    const { GET } = await import("./route");
    const response = await GET(
      createMockRequest({ productId: FAKE_PRODUCT_SLUG, order_id: FAKE_PROVIDER_ORDER_ID })
    );

    expect(response.status).toBe(200);
    expect((await response.json()).hasAccess).toBe(true);
    expect(mockResolveProductAccess).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: FAKE_PROVIDER_ORDER_ID }),
    );
  });

  it("maps resolver deny (anonymous + wrong orderId) to hasAccess:false", async () => {
    mockAnonymous();
    mockDenied();

    const { GET } = await import("./route");
    const response = await GET(
      createMockRequest({ productId: FAKE_PRODUCT_SLUG, orderId: FAKE_PROVIDER_ORDER_ID })
    );

    expect(response.status).toBe(200);
    expect((await response.json()).hasAccess).toBe(false);
  });

  it("forwards userId + userRole (customer) and maps allow WITH userId", async () => {
    mockLoggedInCustomer();
    mockAllowed();

    const { GET } = await import("./route");
    const response = await GET(createMockRequest({ productId: FAKE_PRODUCT_SLUG }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.hasAccess).toBe(true);
    expect(body.userId).toBe(FAKE_USER_ID);
    expect(mockResolveProductAccess).toHaveBeenCalledWith({
      userId: FAKE_USER_ID,
      userRole: "student",
      productId: FAKE_PRODUCT_SLUG,
      orderId: undefined,
    });
  });

  it("maps resolver deny (customer without grant) to hasAccess:false, no userId", async () => {
    mockLoggedInCustomer();
    mockDenied();

    const { GET } = await import("./route");
    const response = await GET(createMockRequest({ productId: FAKE_PRODUCT_SLUG }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.hasAccess).toBe(false);
    expect(body.userId).toBeUndefined();
  });

  it("maps admin allow (delegated admin bypass) to hasAccess:true WITH userId", async () => {
    mockAdmin();
    mockAllowed();

    const { GET } = await import("./route");
    const response = await GET(createMockRequest({ productId: FAKE_PRODUCT_SLUG }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.hasAccess).toBe(true);
    expect(body.userId).toBe(FAKE_USER_ID);
    // The admin verdict now comes from the resolver (delegated), not
    // from an inline role check in the route.
    expect(mockResolveProductAccess).toHaveBeenCalledWith(
      expect.objectContaining({ userId: FAKE_USER_ID, userRole: "admin" }),
    );
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
