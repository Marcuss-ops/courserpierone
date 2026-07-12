import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

// ─── Mock SSOT helper ───────────────────────────────────────
const mockFindCompletedOrder = vi.fn();

vi.mock("@/lib/access", () => ({
  findCompletedOrder: mockFindCompletedOrder,
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

function createMockRequest(options: {
  acceptLanguage?: string;
} = {}) {
  const headers = new Map<string, string>();
  if (options.acceptLanguage) {
    headers.set("accept-language", options.acceptLanguage);
  }
  return {
    headers: {
      get: (key: string) => (headers.get(key.toLowerCase()) ?? null),
    },
    url: "http://localhost:3000/api/certificate/" + PRODUCT_ID,
  } as unknown as NextRequest;
}

const params = Promise.resolve({ productId: PRODUCT_ID });

// ─── Role setup ────────────────────────────────────────────
const mockAnon = () =>
  mockGetServerUser.mockResolvedValueOnce({ supabase: null, user: null, dbUser: null });

const mockAdmin = () =>
  mockGetServerUser.mockResolvedValueOnce({
    supabase: null,
    user: { email: "admin@test.com" },
    dbUser: { id: ADMIN_ID, role: "admin", name: "Admin" },
  });

const mockCustomer = (id = USER_ID) =>
  mockGetServerUser.mockResolvedValueOnce({
    supabase: null,
    user: { email: "cust@test.com" },
    dbUser: { id, role: "student", name: "Customer" },
  });

// ─── Typed fakeOrder factory (replaces inline untyped literal casts) ─────
type FakeOrder = Awaited<ReturnType<typeof mockFindCompletedOrder>>;
const fakeOrder = (overrides: Partial<FakeOrder> = {}) => ({
  id: "ck-order-1",
  userId: USER_ID,
  locale: "it",
  ...overrides,
} as unknown as FakeOrder);

// ─── Tests ───────────────────────────────────────────────────
describe("GET /api/certificate/[productId] — auth + completion-gate", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // ── Anonymous ────────────────────────────────────────────
  it("anonymous: returns 401 Unauthorized", async () => {
    mockAnon();
    const { GET } = await import("./route");
    const response = await GET(createMockRequest(), { params });

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
    expect(mockFindCompletedOrder).not.toHaveBeenCalled();
  });

  // ── Admin WITHOUT order: NO admin bypass in this route ──
  it("admin (no completed order): returns 403 (no admin bypass on this route)", async () => {
    mockAdmin();
    mockFindCompletedOrder.mockResolvedValueOnce(null);
    const { GET } = await import("./route");
    const response = await GET(createMockRequest(), { params });

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toMatch(/not-purchased-error/i);
  });

  // ── Customer PENDING (order not completed) ────────────────
  it("customer pending order: returns 403 with localized message", async () => {
    mockCustomer();
    mockFindCompletedOrder.mockResolvedValueOnce(null);
    const { GET } = await import("./route");
    const response = await GET(
      createMockRequest({ acceptLanguage: "it-IT" }),
      { params }
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toMatch(/\[it\] not-purchased-error/);
  });

  // ── Localization: Accept-Language negotiates error string ──
  it("customer pending order with Accept-Language en: returns localized English message", async () => {
    mockCustomer();
    mockFindCompletedOrder.mockResolvedValueOnce(null);
    const { GET } = await import("./route");
    const response = await GET(
      createMockRequest({ acceptLanguage: "en-US,en;q=0.9" }),
      { params }
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    // "en-US" → "en" via .split("-")[0]
    expect(body.error).toMatch(/\[en\] not-purchased-error/);
  });

  // ── Customer NO order ever ────────────────────────────────
  it("customer with NO order: returns 403", async () => {
    mockCustomer();
    mockFindCompletedOrder.mockResolvedValueOnce(null);
    const { GET } = await import("./route");
    const response = await GET(createMockRequest(), { params });
    expect(response.status).toBe(403);
  });

  // ── Customer completed, but product NOT found in DB ─────
  it("customer completed order but product UUID missing: returns 404", async () => {
    mockCustomer();
    mockFindCompletedOrder.mockResolvedValueOnce(fakeOrder());
    mockPrisma.product.findUnique.mockResolvedValueOnce(null);
    const { GET } = await import("./route");
    const response = await GET(createMockRequest(), { params });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Product not found");
  });

  // ── Customer completed, NO lessons attached to product ──
  it("customer completed but product has zero lessons: returns 400 with localized message", async () => {
    mockCustomer();
    mockFindCompletedOrder.mockResolvedValueOnce(fakeOrder());
    mockPrisma.product.findUnique.mockResolvedValueOnce({
      id: PRODUCT_ID,
      slug: PRODUCT_SLUG,
      lessons: [], // empty!
      translations: [{ content: "Test Course" }],
    });
    mockPrisma.lessonProgress.count.mockResolvedValueOnce(0);

    const { GET } = await import("./route");
    const response = await GET(createMockRequest(), { params });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/no-lessons-error/);
  });

  // ── Customer completed, lessons INCOMPLETE → 400 with X/Y ──
  it("customer completed but lessons incomplete: returns 400 with {completed}/{total}", async () => {
    mockCustomer();
    mockFindCompletedOrder.mockResolvedValueOnce(fakeOrder());
    mockPrisma.product.findUnique.mockResolvedValueOnce({
      id: PRODUCT_ID,
      slug: PRODUCT_SLUG,
      lessons: [{ id: "l1" }, { id: "l2" }, { id: "l3" }], // 3 lessons
      translations: [{ content: "Test Course" }],
    });
    mockPrisma.lessonProgress.count.mockResolvedValueOnce(1); // only 1 of 3 completed
    const { GET } = await import("./route");
    const response = await GET(createMockRequest(), { params });
    const body = await response.json();

    expect(response.status).toBe(400);
    // "(1/3)" should appear in the error message
    expect(body.error).toMatch(/\(1\/3\)/);
  });

  // ── Customer completed, ALL lessons done → 200 PDF ───────
  it("customer completed with all lessons done: returns 200 with PDF", async () => {
    mockCustomer();
    mockFindCompletedOrder.mockResolvedValueOnce(fakeOrder());
    mockPrisma.product.findUnique.mockResolvedValueOnce({
      id: PRODUCT_ID,
      slug: PRODUCT_SLUG,
      lessons: [{ id: "l1" }],
      translations: [{ content: "Test Course" }],
    });
    mockPrisma.lessonProgress.count.mockResolvedValueOnce(1);

    const { GET } = await import("./route");
    const response = await GET(createMockRequest(), { params });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toMatch(/attachment/);
  });
});
