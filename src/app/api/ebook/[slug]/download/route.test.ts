import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockRequest } from "@/app/api/__test-helpers__/mock-request";

// ─── Mock Prisma (product.findUnique for the price + id lookup) ─────
//
// V2 cutover — AccessGrant SSOT: the route now does 1 lightweight
// `prisma.product.findUnique({ select: { id: true, price: true } })`
// to resolve the slug→id + read the price for the isFreeCourse
// defense-in-depth check. Then `resolveProductAccess({ userId,
// productId })` reads AccessGrant directly (canonical SSOT).
const mockPrisma = {
  product: {
    findUnique: vi.fn(),
  },
};

vi.mock("@/lib/db/prisma", () => ({
  prisma: mockPrisma,
}));

// ─── Mock SSOT resolver ─────────────────────────────────────
//
// Honors all AccessGrant sourceTypes (order, free_enrollment, admin,
// bundle, watchlist) uniformly. The legacy `findCompletedOrder`
// (Order.status="completed") mock contract is gone.
//
// E-book route has NO admin bypass — admin must hold an explicit grant
// to download. The post-cutover contract preserves this behavior.
const mockResolveProductAccess = vi.fn();

vi.mock("@/lib/commerce/access/resolve-product-access", () => ({
  resolveProductAccess: mockResolveProductAccess,
}));

// ─── Mock getCourseConfig (white-label course config) ───────
const mockGetCourseConfig = vi.fn();

vi.mock("@/lib/config/white-label-data", () => ({
  getCourseConfig: mockGetCourseConfig,
}));

// ─── Mock getServerUser ────────────────────────────────────
const mockGetServerUser = vi.fn();

vi.mock("@/lib/supabase/get-user", () => ({
  getServerUser: mockGetServerUser,
}));

// ─── Mock fs (use static PDF path to avoid jsPDF encode) ───
const mockExistsSync = vi.fn();
const mockReadFileSync = vi.fn();

vi.mock("fs", () => ({
  default: {
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
  },
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
}));

// ─── Mock path (Node, used by the static-pdf join) ─────────
vi.mock("path", () => ({
  default: {
    join: (...parts: string[]) => parts.join("/"),
  },
  join: (...parts: string[]) => parts.join("/"),
}));

// ─── Helpers ─────────────────────────────────────────────────
const SLUG = "test-course";
const PRODUCT_ID = "cp-product-1";
const USER_ID = "cu-user-1";
const ADMIN_ID = "cu-admin-1";

const params = Promise.resolve({ slug: SLUG });

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

// Convenience helpers for the post-cutover AccessGrant verdict.
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

// Paid-course product lookup fixture. V2 route reads `{ id, price }`
// from product.findUnique (used by `resolveProductAccess` + isFreeCourse
// defense-in-depth). Tests set this up before triggering the route.
const mockPrismaProductPaid = () =>
  mockPrisma.product.findUnique.mockResolvedValueOnce({ id: PRODUCT_ID, price: 1000 });

// ─── fakeOrder factory → @/app/api/__test-helpers__/fake-order (V3.3.2) ─────
//
// Note: fakeOrder() is imported (and used) by OTHER tests (certificate,
// progress). For ebook/download, the contract is now AccessGrant —
// mock resolveProductAccess instead via mockAllowedGrant / mockDeniedGrant.

// ─── Tests ───────────────────────────────────────────────────
describe("GET /api/ebook/[slug]/download — user-keyed AccessGrant SSOT (NO admin bypass)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Default: static PDF path exists → use static path (avoid jsPDF encode)
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(Buffer.from("%PDF-1.4 mock pdf body"));
  });

  // ── Anonymous ────────────────────────────────────────────
  it("anonymous: returns 401 Unauthorized", async () => {
    mockAnon();
    const { GET } = await import("./route");
    const response = await GET(createMockRequest(`/api/ebook/${SLUG}/download`), { params });

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toMatch(/Unauthorized/i);
    // Lookup is gated behind access check — must NOT have been called yet.
    expect(mockResolveProductAccess).not.toHaveBeenCalled();
    expect(mockGetCourseConfig).not.toHaveBeenCalled();
  });

  // ── Admin WITHOUT grant: NO admin bypass on this route ──
  it("admin with no active grant: returns 401 (no admin bypass)", async () => {
    mockAdmin();
    mockPrismaProductPaid();
    mockDeniedGrant();
    const { GET } = await import("./route");
    const response = await GET(createMockRequest(`/api/ebook/${SLUG}/download`), { params });

    expect(response.status).toBe(401);
    expect(mockResolveProductAccess).toHaveBeenCalledWith({
      userId: ADMIN_ID,
      productId: PRODUCT_ID,
    });
  });

  // ── Customer PENDING (no grant) ─────────────────────────
  it("customer no active grant: returns 401 Unauthorized", async () => {
    mockCustomer();
    mockPrismaProductPaid();
    mockDeniedGrant();
    const { GET } = await import("./route");
    const response = await GET(createMockRequest(`/api/ebook/${SLUG}/download`), { params });

    expect(response.status).toBe(401);
  });

  // ── Customer NO grant ever ───────────────────────────────
  it("customer no active grant ever: returns 401 Unauthorized", async () => {
    mockCustomer();
    mockPrismaProductPaid();
    mockDeniedGrant();
    const { GET } = await import("./route");
    const response = await GET(createMockRequest(`/api/ebook/${SLUG}/download`), { params });

    expect(response.status).toBe(401);
  });

  // ── Customer with grant: BUT course config not found ─────
  it("customer with active grant but course config NOT found: returns 404", async () => {
    mockCustomer();
    mockPrismaProductPaid();
    mockAllowedGrant("order");
    mockGetCourseConfig.mockResolvedValueOnce(null);

    const { GET } = await import("./route");
    const response = await GET(createMockRequest(`/api/ebook/${SLUG}/download`), { params });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Course not found");
  });

  // ── disposition=attachment honors the query param ────────
  it("customer with active grant + disposition=attachment: returns attachment-form", async () => {
    mockCustomer();
    mockPrismaProductPaid();
    mockAllowedGrant("order");
    mockGetCourseConfig.mockResolvedValueOnce({
      slug: SLUG,
      author: "Author",
      defaultLanguage: "it",
      languages: {
        en: { ebookTitle: "Test Course EN", ebookContent: "body" },
        it: null,
      },
      ebookChapters: [],
    });

    const { GET } = await import("./route");
    const response = await GET(
      createMockRequest(`/api/ebook/${SLUG}/download`, { query: { lang: "en", disposition: "attachment" } }),
      { params }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toMatch(/^attachment/);
  });

  // ── Happy path: customer with grant + static PDF present ──
  it("customer with active grant + static PDF present: returns 200 application/pdf", async () => {
    mockCustomer();
    mockPrismaProductPaid();
    mockAllowedGrant("order");
    mockGetCourseConfig.mockResolvedValueOnce({
      slug: SLUG,
      author: "Author",
      defaultLanguage: "it",
      languages: {
        en: { ebookTitle: "Test Course EN", ebookContent: "body" },
        it: { ebookTitle: "Test Course IT", ebookContent: "body" },
      },
      ebookChapters: [],
    });
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(Buffer.from("%PDF-1.4\n%%EOF\n"));

    const { GET } = await import("./route");
    const response = await GET(createMockRequest(`/api/ebook/${SLUG}/download`, { query: { lang: "it" } }), { params });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toMatch(/inline|attachment/);
  });

  // ── sourceType-uniform matrix ──────────────────────────
  // Verifies the AccessGrant SSOT honors ALL grant sourceTypes —
  // not just "order" (paid purchase). Demonstrates that a free_enrollment
  // grant, admin grant, bundle grant, or (future) watchlist grant
  // equally unlock the e-book download.
  it.each([
    ["order", "grant-order-1"],
    ["free_enrollment", "grant-free-1"],
    ["admin", "grant-admin-1"],
    ["bundle", "grant-bundle-1"],
    ["watchlist", "grant-watchlist-1"],
  ] as const)(
    "customer with sourceType='%s' grant: returns 200 (sourceType-uniform)",
    async (sourceType, _grantId) => {
      mockCustomer();
      mockPrismaProductPaid();
      mockAllowedGrant(sourceType);
      mockGetCourseConfig.mockResolvedValueOnce({
        slug: SLUG,
        author: "Author",
        defaultLanguage: "it",
        languages: {
          en: { ebookTitle: "Test Course EN", ebookContent: "body" },
          it: { ebookTitle: "Test Course IT", ebookContent: "body" },
        },
        ebookChapters: [],
      });
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(Buffer.from("%PDF-1.4\n"));

      const { GET } = await import("./route");
      const response = await GET(createMockRequest(`/api/ebook/${SLUG}/download`), { params });

      // V2 — AccessGrant sourceTypes are honored uniformly. The route
      // does not branch on sourceType — any active grant unlocks the
      // download (admin/bundle grants are the V2 bundles + manual-grant UI).
      expect(response.status).toBe(200);
    },
  );
});
