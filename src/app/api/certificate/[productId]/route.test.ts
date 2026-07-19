import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockRequest } from "@/app/api/__test-helpers__/mock-request";

// ─── Mock SSOT resolver ─────────────────────────────────────
//
// V2 cutover — AccessGrant SSOT: the route now reads from
// `resolveProductAccess` (AccessGrant.status="active" + non-expired,
// sourceType-agnostic). The legacy `findCompletedOrder`
// (Order.status="completed") mock contract is gone.
//
// Certificate route has NO inline admin bypass (mirrors the prior
// in-test contract) — admin must hold an explicit grant to download
// a certificate.
const mockResolveProductAccess = vi.fn();

vi.mock("@/lib/commerce/access/resolve-product-access", () => ({
  resolveProductAccess: mockResolveProductAccess,
}));

// ─── Mock Prisma (product.findUnique + lessonProgress.count) ───
const mockPrisma = {
  product: {
    findUnique: vi.fn(),
  },
  lessonProgress: {
    count: vi.fn(),
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

// ─── Mock i18n (deterministic localized error strings) ──────
vi.mock("@/lib/i18n/certificate-translations", () => ({
  getCertificateTranslations: vi.fn(() => ({
    brandLabel: "BRAND",
    certTitle: "CERT",
    certThisIsTo: "this-is-to",
    certHasCompleted: "has-completed",
    certDateLabel: "date-label",
    certLessonsCompleted: "{n} lessons",
  })),
}));

vi.mock("@/lib/i18n/ui-translations", () => ({
  getUiTranslations: vi.fn((lang: string) => ({
    dashCertNotPurchased: `[${lang}] not-purchased-error`,
    dashCertNoLessons: `[${lang}] no-lessons-error`,
    dashStatsLessonsCompleted: "[{n}] lessons-template",
    dashWelcomeDefaultName: "Mock Student",
  })),
  interpolate: vi.fn((tpl: string, vars: Record<string, unknown>) =>
    tpl.replace("{n}", String(vars.n))
  ),
}));

// ─── Helpers ─────────────────────────────────────────────────
const PRODUCT_ID = "cp-product-1";
const PRODUCT_SLUG = "test-course";
const USER_ID = "cu-user-1";
const ADMIN_ID = "cu-admin-1";


const params = Promise.resolve({ productId: PRODUCT_ID });

// ─── Role setup ────────────────────────────────────────────
const mockAnon = () =>
  mockGetServerUser.mockResolvedValueOnce({ supabase: null, user: null, dbUser: null });

const mockAdmin = () =>
  mockGetServerUser.mockResolvedValueOnce({
    supabase: null,
    user: { email: "admin@test.com" },
    dbUser: { id: ADMIN_ID, role: "admin", name: "Admin", preferredLocale: "en" },
  });

const mockCustomer = (id = USER_ID, preferredLocale = "it") =>
  mockGetServerUser.mockResolvedValueOnce({
    supabase: null,
    user: { email: "cust@test.com" },
    dbUser: { id, role: "student", name: "Customer", preferredLocale },
  });

// Convenience helpers for the post-cutover AccessGrant verdict.
const mockAllowedGrant = (sourceType: "order" | "free_enrollment" | "admin" | "bundle" | "watchlist" = "order") =>
  mockResolveProductAccess.mockResolvedValueOnce({ allowed: true, grantId: `grant-${sourceType}-1`, source: "grant" });

const mockDeniedGrant = () =>
  mockResolveProductAccess.mockResolvedValueOnce({ allowed: false, reason: "no_active_access_grant" });

// ─── fakeOrder factory → @/app/api/__test-helpers__/fake-order (V3.3.2) ─────
//
// Note: fakeOrder is still imported for legacy compatibility but the
// route no longer reads `Order.locale` directly — locale for the
// certificate template now comes from `dbUser.preferredLocale`.

// ─── Tests ───────────────────────────────────────────────────
describe("GET /api/certificate/[productId] — auth + completion-gate (AccessGrant SSOT)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // ── Anonymous ────────────────────────────────────────────
  it("anonymous: returns 401 Unauthorized", async () => {
    mockAnon();
    const { GET } = await import("./route");
    const response = await GET(createMockRequest("/api/certificate/" + PRODUCT_ID), { params });

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
    expect(mockResolveProductAccess).not.toHaveBeenCalled();
  });

  // ── Admin WITHOUT grant: NO admin bypass in this route ──
  it("admin (no active grant): returns 403 (no admin bypass on this route)", async () => {
    mockAdmin();
    mockDeniedGrant();
    const { GET } = await import("./route");
    const response = await GET(createMockRequest("/api/certificate/" + PRODUCT_ID), { params });

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toMatch(/not-purchased-error/i);
  });

  // ── Customer PENDING (no grant) ─────────────────────────
  it("customer no active grant: returns 403 with localized message", async () => {
    mockCustomer();
    mockDeniedGrant();
    const { GET } = await import("./route");
    const response = await GET(
      createMockRequest("/api/certificate/" + PRODUCT_ID, { headers: { "accept-language": "it-IT" } }),
      { params }
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toMatch(/\[it\] not-purchased-error/);
  });

  // ── Localization: Accept-Language negotiates error string ──
  it("customer no active grant with Accept-Language en: returns localized English message", async () => {
    mockCustomer();
    mockDeniedGrant();
    const { GET } = await import("./route");
    const response = await GET(
      createMockRequest("/api/certificate/" + PRODUCT_ID, { headers: { "accept-language": "en-US,en;q=0.9" } }),
      { params }
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    // "en-US" → "en" via .split("-")[0]
    expect(body.error).toMatch(/\[en\] not-purchased-error/);
  });

  // ── Customer no grant ever ───────────────────────────────
  it("customer with NO grant: returns 403", async () => {
    mockCustomer();
    mockDeniedGrant();
    const { GET } = await import("./route");
    const response = await GET(createMockRequest("/api/certificate/" + PRODUCT_ID), { params });
    expect(response.status).toBe(403);
  });

  // ── Customer with grant, but product NOT found in DB ─────
  it("customer with active grant but product UUID missing: returns 404", async () => {
    mockCustomer();
    mockAllowedGrant("order");
    mockPrisma.product.findUnique.mockResolvedValueOnce(null);
    const { GET } = await import("./route");
    const response = await GET(createMockRequest("/api/certificate/" + PRODUCT_ID), { params });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Product not found");
  });

  // ── Customer with grant, NO lessons attached to product ──
  it("customer with active grant but product has zero lessons: returns 400 with localized message", async () => {
    mockCustomer();
    mockAllowedGrant("order");
    mockPrisma.product.findUnique.mockResolvedValueOnce({
      id: PRODUCT_ID,
      slug: PRODUCT_SLUG,
      lessons: [], // empty!
      translations: [{ content: "Test Course" }],
    });
    mockPrisma.lessonProgress.count.mockResolvedValueOnce(0);

    const { GET } = await import("./route");
    const response = await GET(createMockRequest("/api/certificate/" + PRODUCT_ID), { params });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/no-lessons-error/);
  });

  // ── Customer with grant, lessons INCOMPLETE → 400 with X/Y ──
  it("customer with active grant but lessons incomplete: returns 400 with {completed}/{total}", async () => {
    mockCustomer();
    mockAllowedGrant("order");
    mockPrisma.product.findUnique.mockResolvedValueOnce({
      id: PRODUCT_ID,
      slug: PRODUCT_SLUG,
      lessons: [{ id: "l1" }, { id: "l2" }, { id: "l3" }], // 3 lessons
      translations: [{ content: "Test Course" }],
    });
    mockPrisma.lessonProgress.count.mockResolvedValueOnce(1); // only 1 of 3 completed
    const { GET } = await import("./route");
    const response = await GET(createMockRequest("/api/certificate/" + PRODUCT_ID), { params });
    const body = await response.json();

    expect(response.status).toBe(400);
    // "(1/3)" should appear in the error message
    expect(body.error).toMatch(/\(1\/3\)/);
  });

  // ── Customer with grant, ALL lessons done → 200 PDF ───────
  it("customer with active grant + all lessons done: returns 200 with PDF", async () => {
    mockCustomer();
    mockAllowedGrant("order");
    mockPrisma.product.findUnique.mockResolvedValueOnce({
      id: PRODUCT_ID,
      slug: PRODUCT_SLUG,
      lessons: [{ id: "l1" }],
      translations: [{ content: "Test Course" }],
    });
    mockPrisma.lessonProgress.count.mockResolvedValueOnce(1);

    const { GET } = await import("./route");
    const response = await GET(createMockRequest("/api/certificate/" + PRODUCT_ID), { params });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toMatch(/attachment/);
  });
});
