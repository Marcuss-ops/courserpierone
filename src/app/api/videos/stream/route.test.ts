import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockRequest } from "@/app/api/__test-helpers__/mock-request";

// ─── Mock SSOT resolver ─────────────────────────────────────
//
// V2 cutover — AccessGrant SSOT: the route now reads from
// `resolveProductAccess` (AccessGrant.status="active" + non-expired,
// sourceType-agnostic). The legacy `findCompletedOrder`
// (Order.status="completed") mock contract is gone.
//
// fakeOrder helper is kept imported (and used by select tests below)
// for parity checks on the resolveProductAccess call shape only —
// not as a route input.
const mockResolveProductAccess = vi.fn();

vi.mock("@/lib/commerce/access/resolve-product-access", () => ({
  resolveProductAccess: mockResolveProductAccess,
}));

// ─── Mock isFreeCourse (so tests don't depend on env vars) ──
const mockIsFreeCourse = vi.fn();
vi.mock("@/lib/courses/is-free-course", () => ({
  isFreeCourse: (...args: unknown[]) => mockIsFreeCourse(...args),
}));

// ─── Mock Prisma (product + lessonTranslation) ─────────────
const mockPrisma = {
  product: {
    findUnique: vi.fn(),
  },
  lessonTranslation: {
    findFirst: vi.fn(),
  },
};

vi.mock("@/lib/db/prisma", () => ({
  prisma: mockPrisma,
}));

// ─── Mock getServerUser ────────────────────────────────────
const mockGetServerUser = vi.fn();

vi.mock("@/lib/supabase/get-user", () => ({
  getServerUser: mockGetServerUser,
}));

// ─── Mock rate-limit (no-op wrapper) ────────────────────────
vi.mock("@/lib/utils/rate-limit", () => ({
  withRateLimit: <T,>(fn: T) => fn,
}));

// ─── Helpers ─────────────────────────────────────────────────
const SLUG = "test-course";
const PRODUCT_ID = "cp-product-1";
const LESSON_ID = "cl-lesson-1";
const USER_ID = "cu-user-1";
const ADMIN_ID = "cu-admin-1";
const VIDEO_URL = "https://example.com/video.mp4";

const mockAnon = () =>
  mockGetServerUser.mockResolvedValueOnce({ supabase: null, user: null, dbUser: null });

const mockAdmin = () =>
  mockGetServerUser.mockResolvedValueOnce({
    supabase: null,
    user: { email: "admin@test.com" },
    dbUser: { id: ADMIN_ID, role: "admin" },
  });

const mockCustomer = () =>
  mockGetServerUser.mockResolvedValueOnce({
    supabase: null,
    user: { email: "cust@test.com" },
    dbUser: { id: USER_ID, role: "student" },
  });

const mockProductFound = () =>
  mockPrisma.product.findUnique.mockResolvedValueOnce({ id: PRODUCT_ID, slug: SLUG });

const mockVideoFound = () =>
  mockPrisma.lessonTranslation.findFirst.mockResolvedValueOnce({ videoUrl: VIDEO_URL });

// Convenience helpers for the post-cutover AccessGrant verdict —
// `mockAllowed()` returns `{allowed:true}` (any non-purchase sourceType
// works — the resolver is sourceType-agnostic), `mockDenied()` returns
// the canonical "no active grant" denial.
// Post-contract-change shape: uniform `{ hasAccess, reason, productId,
// orderId }`. The route only branches on `hasAccess`.
const mockAllowedGrant = (_sourceType: "order" | "free_enrollment" | "admin" | "bundle" | "watchlist" = "order") =>
  mockResolveProductAccess.mockResolvedValueOnce({
    hasAccess: true,
    reason: "active_purchase",
    productId: PRODUCT_ID,
    orderId: "ord-1",
  });

const mockDeniedGrant = () =>
  mockResolveProductAccess.mockResolvedValueOnce({
    hasAccess: false,
    reason: "not_purchased",
    productId: PRODUCT_ID,
    orderId: null,
  });

// ─── fakeOrder factory → @/app/api/__test-helpers__/fake-order (V3.3.2) ─────
//
// Note: the cert/test helpers retain `fakeOrder()` for OTHER routes
// (certificate still uses Order.locale metadata via dbUser.preferredLocale
// — no Order read). For videos/stream the relevant resolveProductAccess
// verdict is the post-cutover SSOT path, mocked via mockAllowedGrant /
// mockDeniedGrant above.

// ─── Tests ───────────────────────────────────────────────────
describe("GET /api/videos/stream — admin bypass + AccessGrant SSOT check", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // ── Anonymous ────────────────────────────────────────────
  it("anonymous on PAID course: returns 401 Non autenticato", async () => {
    mockAnon();
    // Product lookup happens BEFORE the auth check (needed to evaluate
    // the FREE_COURSE_SLUGS bypass). The mock returns no `price` field,
    // and isFreeCourse is mocked to return false (paid course).
    mockIsFreeCourse.mockReturnValueOnce(false);
    mockPrisma.product.findUnique.mockResolvedValueOnce({ id: PRODUCT_ID, slug: SLUG });

    const { GET } = await import("./route");
    const response = await GET(
      createMockRequest("/api/videos/stream", { query: { lessonId: LESSON_ID, productSlug: SLUG } })
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toMatch(/Non autenticato/);
    expect(mockResolveProductAccess).not.toHaveBeenCalled();
    expect(mockPrisma.product.findUnique).toHaveBeenCalled();
  });

  // ── Anonymous on FREE course: 200 (bypass) ────────────────
  it("anonymous on FREE course: returns 200 (NEXT_PUBLIC_FREE_COURSE_SLUGS bypass)", async () => {
    mockAnon();
    mockIsFreeCourse.mockReturnValueOnce(true);
    mockPrisma.product.findUnique.mockResolvedValueOnce({ id: PRODUCT_ID, slug: SLUG, price: 0 });
    mockVideoFound();

    const { GET } = await import("./route");
    const response = await GET(
      createMockRequest("/api/videos/stream", { query: { lessonId: LESSON_ID, productSlug: SLUG } })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.videoUrl).toBe(VIDEO_URL);
    // Free course bypass: auth not required, resolveProductAccess not called.
    expect(mockResolveProductAccess).not.toHaveBeenCalled();
  });

  // ── Anonymous on FREE course but product NOT in FREE_COURSE_SLUGS: 401 ──
  it("anonymous on FREE-priced course NOT in FREE_COURSE_SLUGS: returns 401", async () => {
    mockAnon();
    // price=0 but isFreeCourse returns false (slug not in env var).
    mockIsFreeCourse.mockReturnValueOnce(false);
    mockPrisma.product.findUnique.mockResolvedValueOnce({ id: PRODUCT_ID, slug: SLUG, price: 0 });

    const { GET } = await import("./route");
    const response = await GET(
      createMockRequest("/api/videos/stream", { query: { lessonId: LESSON_ID, productSlug: SLUG } })
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toMatch(/Non autenticato/);
  });

  // ── Missing required params : 400 ───────────────────────
  it("missing lessonId: returns 400", async () => {
    mockCustomer();
    const { GET } = await import("./route");
    const response = await GET(createMockRequest("/api/videos/stream", { query: { productSlug: SLUG } }));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/lessonId/);
  });

  it("missing productSlug: returns 400", async () => {
    mockCustomer();
    const { GET } = await import("./route");
    const response = await GET(createMockRequest("/api/videos/stream", { query: { lessonId: LESSON_ID } }));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/productSlug/);
  });

  // ── No product found in DB ─────────────────────────────
  it("valid user but product NOT found: returns 404", async () => {
    mockCustomer();
    mockPrisma.product.findUnique.mockResolvedValueOnce(null);

    const { GET } = await import("./route");
    const response = await GET(
      createMockRequest("/api/videos/stream", { query: { lessonId: LESSON_ID, productSlug: SLUG } })
    );
    expect(response.status).toBe(404);
    // resolveProductAccess is gated behind product found
    expect(mockResolveProductAccess).not.toHaveBeenCalled();
  });

  // ── Admin: bypass the resolver (INLINE admin bypass) ─────
  it("admin with NO grant: returns 200 (admin bypass inline)", async () => {
    mockAdmin();
    mockProductFound();
    mockVideoFound();

    const { GET } = await import("./route");
    const response = await GET(
      createMockRequest("/api/videos/stream", { query: { lessonId: LESSON_ID, productSlug: SLUG } })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.videoUrl).toBe(VIDEO_URL);
    // Admin bypass is inline — resolver MUST NOT have been called.
    expect(mockResolveProductAccess).not.toHaveBeenCalled();
  });

  // ── Customer with active grant (sourceType='order'): 200 ─────────────────
  it("customer with active order grant: returns 200 {videoUrl}", async () => {
    mockCustomer();
    mockProductFound();
    mockAllowedGrant("order");
    mockVideoFound();

    const { GET } = await import("./route");
    const response = await GET(
      createMockRequest("/api/videos/stream", { query: { lessonId: LESSON_ID, productSlug: SLUG } })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.videoUrl).toBe(VIDEO_URL);
    expect(mockResolveProductAccess).toHaveBeenCalledWith({
      userId: USER_ID,
      productId: PRODUCT_ID,
    });
  });

  // ── Customer with admin-issued grant: 200 (admin sourceType honored) ──
  it("customer with admin-issued grant: returns 200 (sourceType-uniform)", async () => {
    // V2 — AccessGrant SSOT honors admin sourceType uniformly. Demonstrates
    // that students can hold a manual grant AND access gated content.
    mockCustomer();
    mockProductFound();
    mockAllowedGrant("admin");
    mockVideoFound();

    const { GET } = await import("./route");
    const response = await GET(
      createMockRequest("/api/videos/stream", { query: { lessonId: LESSON_ID, productSlug: SLUG } })
    );
    expect(response.status).toBe(200);
  });

  // ── Customer with bundle grant: 200 (bundle sourceType honored) ──
  it("customer with bundle grant: returns 200 (sourceType-uniform)", async () => {
    mockCustomer();
    mockProductFound();
    mockAllowedGrant("bundle");
    mockVideoFound();

    const { GET } = await import("./route");
    const response = await GET(
      createMockRequest("/api/videos/stream", { query: { lessonId: LESSON_ID, productSlug: SLUG } })
    );
    expect(response.status).toBe(200);
  });

  // ── Customer without grant → 403 ─────────────────────────
  it("customer without grant: returns 403 Accesso negato", async () => {
    mockCustomer();
    mockProductFound();
    mockDeniedGrant();

    const { GET } = await import("./route");
    const response = await GET(
      createMockRequest("/api/videos/stream", { query: { lessonId: LESSON_ID, productSlug: SLUG } })
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toMatch(/Accesso negato/);
  });

  // ── Valid access but no video URL for this lesson ────
  it("valid customer but no video URL: returns 404", async () => {
    mockCustomer();
    mockProductFound();
    mockAllowedGrant("order");
    // Locale-specific try: null
    // Locale-fallback try: null
    mockPrisma.lessonTranslation.findFirst
      .mockResolvedValueOnce(null) // locale-specific
      .mockResolvedValueOnce(null); // fallback

    const { GET } = await import("./route");
    const response = await GET(
      createMockRequest("/api/videos/stream", { query: { lessonId: LESSON_ID, productSlug: SLUG } })
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toMatch(/Video non trovato/);
  });

  // ── Locale fallback: videoUrl found at a different locale ──
  it("locale-specific translation missing, fallback locale returns videoUrl: 200", async () => {
    mockCustomer();
    mockProductFound();
    mockAllowedGrant("order");
    // Locale-specific (it) miss → fallback (any locale) hit
    mockPrisma.lessonTranslation.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ videoUrl: VIDEO_URL });

    const { GET } = await import("./route");
    const response = await GET(
      createMockRequest("/api/videos/stream", { query: { lessonId: LESSON_ID, productSlug: SLUG, lang: "it" } })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.videoUrl).toBe(VIDEO_URL);
  });
});
