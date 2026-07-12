import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

// ─── Mock SSOT helper ───────────────────────────────────────
const mockFindCompletedOrder = vi.fn();

vi.mock("@/lib/access", () => ({
  findCompletedOrder: mockFindCompletedOrder,
}));

// ─── Mock Prisma ────────────────────────────────────────────
const mockPrisma = {
  product: {
    findUnique: vi.fn(),
  },
  lesson: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
  },
  lessonProgress: {
    findMany: vi.fn(),
    upsert: vi.fn(),
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

// ─── Helpers ─────────────────────────────────────────────────
const PRODUCT_ID = "cp-product-1";
const SLUG = "test-course";
const LESSON_ID = "cl-lesson-1";
const USER_ID = "cu-user-1";
const ADMIN_ID = "cu-admin-1";

function createMockRequest(options: {
  method?: "GET" | "POST";
  query?: Record<string, string>;
  body?: unknown;
} = {}) {
  const { method = "GET", query = {}, body } = options;
  const url = new URL("http://localhost:3000/api/progress");
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return {
    method,
    headers: new Map(),
    url: url.toString(),
    nextUrl: { searchParams: url.searchParams },
    json: () => Promise.resolve(body ?? {}),
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

// ─── Typed fakeOrder factory (replaces inline untyped literal casts) ─────
type FakeOrder = Awaited<ReturnType<typeof mockFindCompletedOrder>>;
const fakeOrder = (overrides: Partial<FakeOrder> = {}) => ({
  id: "ck-order-1",
  userId: USER_ID,
  productId: PRODUCT_ID,
  ...overrides,
} as unknown as FakeOrder);

// ─── Tests ───────────────────────────────────────────────────
//
// Critical invariant: GET /api/progress does NOT check access — it
// returns lessonProgress rows for the *authenticated* user. POST
// /api/progress DOES check access (admin bypass | findCompletedOrder).

describe("GET /api/progress — auth-only (no access gate)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("anonymous: returns 401 Unauthorized", async () => {
    mockAnon();
    const { GET } = await import("./route");
    const response = await GET(createMockRequest({ query: { productId: PRODUCT_ID } }));

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
    expect(mockFindCompletedOrder).not.toHaveBeenCalled();
  });

  it("authenticated customer with productId: returns 200 {progress, lessons}", async () => {
    mockCustomer();
    mockPrisma.lessonProgress.findMany.mockResolvedValueOnce([
      { id: "lp1", userId: USER_ID, lessonId: LESSON_ID, completed: true },
    ]);
    mockPrisma.lesson.findMany.mockResolvedValueOnce([
      { id: LESSON_ID, translations: [{ title: "Lesson 1" }] },
    ]);

    const { GET } = await import("./route");
    const response = await GET(createMockRequest({ query: { productId: PRODUCT_ID } }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.progress).toHaveLength(1);
    expect(body.lessons).toHaveLength(1);
    // GET has no access gate — admin bypass not invoked.
    expect(mockFindCompletedOrder).not.toHaveBeenCalled();
  });

  it("authenticated customer with KNOWN productSlug: resolves to productId and returns progress", async () => {
    mockCustomer();
    mockPrisma.product.findUnique.mockResolvedValueOnce({ id: PRODUCT_ID });
    mockPrisma.lessonProgress.findMany.mockResolvedValueOnce([]);
    mockPrisma.lesson.findMany.mockResolvedValueOnce([]);

    const { GET } = await import("./route");
    const response = await GET(createMockRequest({ query: { productSlug: SLUG } }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.progress).toEqual([]);
    expect(mockPrisma.product.findUnique).toHaveBeenCalledWith({
      where: { slug: SLUG },
      select: { id: true },
    });
  });

  it("authenticated customer with UNKNOWN productSlug: anti-leak — returns empty progress (NOT 404)", async () => {
    mockCustomer();
    mockPrisma.product.findUnique.mockResolvedValueOnce(null);

    const { GET } = await import("./route");
    const response = await GET(
      createMockRequest({ query: { productSlug: "unknown-product" } })
    );
    const body = await response.json();

    // SECURITY INVARIANT: Unknown product slug must NOT leak via 404.
    // Route deliberately returns empty arrays so callers can't probe for
    // existing slugs. Critical regression-guard.
    expect(response.status).toBe(200);
    expect(body.progress).toEqual([]);
    expect(body.lessons).toEqual([]);
    // findMany must NOT have been called for the unknown slug.
    expect(mockPrisma.lessonProgress.findMany).not.toHaveBeenCalled();
  });

  it("admin: returns 200 progress without invoking findCompletedOrder", async () => {
    mockAdmin();
    mockPrisma.lessonProgress.findMany.mockResolvedValueOnce([]);
    mockPrisma.lesson.findMany.mockResolvedValueOnce([]);

    const { GET } = await import("./route");
    const response = await GET(createMockRequest({ query: { productId: PRODUCT_ID } }));
    expect(response.status).toBe(200);
    // GET has no access gate — verified independently of role.
    expect(mockFindCompletedOrder).not.toHaveBeenCalled();
  });
});

describe("POST /api/progress — admin bypass + customer access gate", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // ── Anonymous ────────────────────────────────────────────
  it("anonymous: returns 401 Unauthorized", async () => {
    mockAnon();
    const { POST } = await import("./route");
    const response = await POST(
      createMockRequest({ method: "POST", body: { lessonId: LESSON_ID, completed: true } })
    );

    expect(response.status).toBe(401);
    expect(mockPrisma.lesson.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.lessonProgress.upsert).not.toHaveBeenCalled();
  });

  // ── Invalid body schema ─────────────────────────────────
  it("invalid body schema: returns 400 Invalid progress data", async () => {
    mockCustomer();
    const { POST } = await import("./route");
    const response = await POST(
      createMockRequest({ method: "POST", body: { wrongField: "x" } })
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Invalid progress data");
    expect(mockPrisma.lesson.findUnique).not.toHaveBeenCalled();
  });

  // ── Missing lessonId ────────────────────────────────────
  it("missing lessonId even with valid schema: returns 400", async () => {
    mockCustomer();
    const { POST } = await import("./route");
    // zod schema requires lessonId: omitting it from a valid z.object({lessonId,completed})
    // shape would result in a failed parse → 400 "Invalid progress data" (already covered).
    // To exercise the explicit `if (!lessonId)` guard we need to slip past zod
    // but still have undefined lessonId — practically only the schema path is reachable.
    // Verify the schema path catches it.
    const response = await POST(
      createMockRequest({ method: "POST", body: { completed: true } })
    );

    expect(response.status).toBe(400);
  });

  // ── Unknown lessonId ────────────────────────────────────
  it("unknown lessonId: returns 404 Lesson not found", async () => {
    mockCustomer();
    mockPrisma.lesson.findUnique.mockResolvedValueOnce(null);
    const { POST } = await import("./route");
    const response = await POST(
      createMockRequest({ method: "POST", body: { lessonId: "ghost-lesson", completed: true } })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe("Lesson not found");
    expect(mockFindCompletedOrder).not.toHaveBeenCalled();
    expect(mockPrisma.lessonProgress.upsert).not.toHaveBeenCalled();
  });

  // ── Customer PENDING / NO order → 403 ──────────────────
  it("customer NO order: returns 403 Forbidden", async () => {
    mockCustomer();
    mockPrisma.lesson.findUnique.mockResolvedValueOnce({ productId: PRODUCT_ID });
    mockFindCompletedOrder.mockResolvedValueOnce(null);
    const { POST } = await import("./route");
    const response = await POST(
      createMockRequest({ method: "POST", body: { lessonId: LESSON_ID, completed: true } })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("Forbidden");
    expect(mockFindCompletedOrder).toHaveBeenCalledWith({
      userId: USER_ID,
      productId: PRODUCT_ID,
    });
    expect(mockPrisma.lessonProgress.upsert).not.toHaveBeenCalled();
  });

  it("customer with pending order: returns 403 Forbidden", async () => {
    // Same as "no order" — pending doesn't satisfy the findCompletedOrder helper
    // (helper returns null for non-completed orders).
    mockCustomer();
    mockPrisma.lesson.findUnique.mockResolvedValueOnce({ productId: PRODUCT_ID });
    mockFindCompletedOrder.mockResolvedValueOnce(null);
    const { POST } = await import("./route");
    const response = await POST(
      createMockRequest({ method: "POST", body: { lessonId: LESSON_ID, completed: true } })
    );

    expect(response.status).toBe(403);
  });

  // ── Admin (NO order needed) — bypass inline ─────────────
  it("admin with NO completed order: returns 200 success (admin bypass inline)", async () => {
    mockAdmin();
    mockPrisma.lesson.findUnique.mockResolvedValueOnce({ productId: PRODUCT_ID });
    mockPrisma.lessonProgress.upsert.mockResolvedValueOnce({
      id: "lp1", userId: ADMIN_ID, lessonId: LESSON_ID, completed: true,
    });
    const { POST } = await import("./route");
    const response = await POST(
      createMockRequest({ method: "POST", body: { lessonId: LESSON_ID, completed: true } })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    // Admin bypass: helper MUST NOT have been called.
    expect(mockFindCompletedOrder).not.toHaveBeenCalled();
    expect(mockPrisma.lessonProgress.upsert).toHaveBeenCalledOnce();
  });

  // ── Customer with completed order: 200 success ────────
  it("customer with completed order: returns 200 success", async () => {
    mockCustomer();
    mockPrisma.lesson.findUnique.mockResolvedValueOnce({ productId: PRODUCT_ID });
    mockFindCompletedOrder.mockResolvedValueOnce(fakeOrder());
    mockPrisma.lessonProgress.upsert.mockResolvedValueOnce({
      id: "lp1", userId: USER_ID, lessonId: LESSON_ID, completed: true,
    });
    const { POST } = await import("./route");
    const response = await POST(
      createMockRequest({ method: "POST", body: { lessonId: LESSON_ID, completed: true } })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockFindCompletedOrder).toHaveBeenCalledWith({
      userId: USER_ID,
      productId: PRODUCT_ID,
    });
    expect(mockPrisma.lessonProgress.upsert).toHaveBeenCalledOnce();
  });
});
