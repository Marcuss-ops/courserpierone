import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

// ─── Mock SSOT helper ───────────────────────────────────────
const mockFindCompletedOrder = vi.fn();

vi.mock("@/lib/access", () => ({
  findCompletedOrder: mockFindCompletedOrder,
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

function createMockRequest(query: Record<string, string> = {}) {
  const url = new URL("http://localhost:3000/api/videos/stream");
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return {
    headers: new Map(),
    url: url.toString(),
    nextUrl: { searchParams: url.searchParams },
  } as unknown as NextRequest;
}

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

// ─── Typed fakeOrder factory (replaces inline untyped literal casts) ─────
type FakeOrder = Awaited<ReturnType<typeof mockFindCompletedOrder>>;
const fakeOrder = (overrides: Partial<FakeOrder> = {}) => ({
  id: "ck-order-1",
  userId: USER_ID,
  productId: PRODUCT_ID,
  ...overrides,
} as unknown as FakeOrder);

// ─── Tests ───────────────────────────────────────────────────
describe("GET /api/videos/stream — admin bypass + customer order check", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // ── Anonymous ────────────────────────────────────────────
  it("anonymous: returns 401 Non autenticato", async () => {
    mockAnon();
    const { GET } = await import("./route");
    const response = await GET(
      createMockRequest({ lessonId: LESSON_ID, productSlug: SLUG })
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toMatch(/Non autenticato/);
    expect(mockFindCompletedOrder).not.toHaveBeenCalled();
    expect(mockPrisma.product.findUnique).not.toHaveBeenCalled();
  });

  // ── Missing required params : 400 ───────────────────────
  it("missing lessonId: returns 400", async () => {
    mockCustomer();
    const { GET } = await import("./route");
    const response = await GET(createMockRequest({ productSlug: SLUG }));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/lessonId/);
  });

  it("missing productSlug: returns 400", async () => {
    mockCustomer();
    const { GET } = await import("./route");
    const response = await GET(createMockRequest({ lessonId: LESSON_ID }));

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
      createMockRequest({ lessonId: LESSON_ID, productSlug: SLUG })
    );
    expect(response.status).toBe(404);
    // findCompletedOrder is gated behind product found
    expect(mockFindCompletedOrder).not.toHaveBeenCalled();
  });

  // ── Admin: bypass the helper (INLINE admin bypass) ─────
  it("admin with NO order: returns 200 (admin bypass inline)", async () => {
    mockAdmin();
    mockProductFound();
    mockVideoFound();

    const { GET } = await import("./route");
    const response = await GET(
      createMockRequest({ lessonId: LESSON_ID, productSlug: SLUG })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.videoUrl).toBe(VIDEO_URL);
    // Admin bypass is inline — helper MUST NOT have been called.
    expect(mockFindCompletedOrder).not.toHaveBeenCalled();
  });

  // ── Customer with completed order: 200 ─────────────────
  it("customer with completed order: returns 200 {videoUrl}", async () => {
    mockCustomer();
    mockProductFound();
    mockFindCompletedOrder.mockResolvedValueOnce(fakeOrder());
    mockVideoFound();

    const { GET } = await import("./route");
    const response = await GET(
      createMockRequest({ lessonId: LESSON_ID, productSlug: SLUG })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.videoUrl).toBe(VIDEO_URL);
    expect(mockFindCompletedOrder).toHaveBeenCalledWith({
      userId: USER_ID,
      productId: PRODUCT_ID,
    });
  });

  // ── Customer PENDING → 403 ─────────────────────────────
  it("customer with pending order: returns 403 Accesso negato", async () => {
    mockCustomer();
    mockProductFound();
    mockFindCompletedOrder.mockResolvedValueOnce(null);

    const { GET } = await import("./route");
    const response = await GET(
      createMockRequest({ lessonId: LESSON_ID, productSlug: SLUG })
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toMatch(/Accesso negato/);
  });

  // ── Customer NO order ever → 403 ───────────────────────
  it("customer with NO order: returns 403", async () => {
    mockCustomer();
    mockProductFound();
    mockFindCompletedOrder.mockResolvedValueOnce(null);

    const { GET } = await import("./route");
    const response = await GET(
      createMockRequest({ lessonId: LESSON_ID, productSlug: SLUG })
    );
    expect(response.status).toBe(403);
  });

  // ── Valid access but no video URL for this lesson ────
  it("valid customer but no video URL: returns 404", async () => {
    mockCustomer();
    mockProductFound();
    mockFindCompletedOrder.mockResolvedValueOnce(fakeOrder());
    // Locale-specific try: null
    // Locale-fallback try: null
    mockPrisma.lessonTranslation.findFirst
      .mockResolvedValueOnce(null) // locale-specific
      .mockResolvedValueOnce(null); // fallback

    const { GET } = await import("./route");
    const response = await GET(
      createMockRequest({ lessonId: LESSON_ID, productSlug: SLUG })
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toMatch(/Video non trovato/);
  });

  // ── Locale fallback: videoUrl found at a different locale ──
  it("locale-specific translation missing, fallback locale returns videoUrl: 200", async () => {
    mockCustomer();
    mockProductFound();
    mockFindCompletedOrder.mockResolvedValueOnce(fakeOrder());
    // Locale-specific (it) miss → fallback (any locale) hit
    mockPrisma.lessonTranslation.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ videoUrl: VIDEO_URL });

    const { GET } = await import("./route");
    const response = await GET(
      createMockRequest({ lessonId: LESSON_ID, productSlug: SLUG, lang: "it" })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.videoUrl).toBe(VIDEO_URL);
  });
});
