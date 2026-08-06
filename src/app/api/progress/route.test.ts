import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockRequest } from "@/app/api/__test-helpers__/mock-request";

// ─── Mock SSOT resolver ─────────────────────────────────────
//
// V2 cutover — AccessGrant SSOT: the POST handler now reads from
// `resolveProductAccess` (AccessGrant.status="active" + non-expired,
// sourceType-agnostic). The legacy `findCompletedOrder`
// (Order.status="completed") mock contract is gone.
//
// Critical invariant — GET /api/progress DOES NOT check access (it
// returns the *authenticated* user's own lessonProgress rows). POST
// /api/progress DOES check access (admin bypass + resolveProductAccess).
const mockResolveProductAccess = vi.fn();

vi.mock("@/domains/identity", () => ({
  resolveProductAccess: mockResolveProductAccess,
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

// ─── fakeOrder factory → @/app/api/__test-helpers__/fake-order (V3.3.2) ─────

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
    const response = await GET(createMockRequest("/api/progress", { query: { productId: PRODUCT_ID } }));

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
    expect(mockResolveProductAccess).not.toHaveBeenCalled();
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
    const response = await GET(createMockRequest("/api/progress", { query: { productId: PRODUCT_ID } }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.progress).toHaveLength(1);
    expect(body.lessons).toHaveLength(1);
    // GET has no access gate — admin bypass not invoked.
    expect(mockResolveProductAccess).not.toHaveBeenCalled();
  });

  it("authenticated customer with KNOWN productSlug: resolves to productId and returns progress", async () => {
    mockCustomer();
    mockPrisma.product.findUnique.mockResolvedValueOnce({ id: PRODUCT_ID });
    mockPrisma.lessonProgress.findMany.mockResolvedValueOnce([]);
    mockPrisma.lesson.findMany.mockResolvedValueOnce([]);

    const { GET } = await import("./route");
    const response = await GET(createMockRequest("/api/progress", { query: { productSlug: SLUG } }));
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
      createMockRequest("/api/progress", { query: { productSlug: "unknown-product" } })
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
    const response = await GET(createMockRequest("/api/progress", { query: { productId: PRODUCT_ID } }));
    expect(response.status).toBe(200);
    // GET has no access gate — verified independently of role.
    expect(mockResolveProductAccess).not.toHaveBeenCalled();
  });
});

describe("POST /api/progress — admin bypass + customer AccessGrant gate", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // ── Anonymous ────────────────────────────────────────────
  it("anonymous: returns 401 Unauthorized", async () => {
    mockAnon();
    const { POST } = await import("./route");
    const response = await POST(
      createMockRequest("/api/progress", { method: "POST", body: { lessonId: LESSON_ID, completed: true } })
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
      createMockRequest("/api/progress", { method: "POST", body: { wrongField: "x" } })
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
      createMockRequest("/api/progress", { method: "POST", body: { completed: true } })
    );

    expect(response.status).toBe(400);
  });

  // ── Unknown lessonId ────────────────────────────────────
  it("unknown lessonId: returns 404 Lesson not found", async () => {
    mockCustomer();
    mockPrisma.lesson.findUnique.mockResolvedValueOnce(null);
    const { POST } = await import("./route");
    const response = await POST(
      createMockRequest("/api/progress", { method: "POST", body: { lessonId: "ghost-lesson", completed: true } })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe("Lesson not found");
    expect(mockResolveProductAccess).not.toHaveBeenCalled();
    expect(mockPrisma.lessonProgress.upsert).not.toHaveBeenCalled();
  });

  // ── Customer no grant → 403 ─────────────────────────────
  it("customer no active grant: returns 403 Forbidden", async () => {
    mockCustomer();
    mockPrisma.lesson.findUnique.mockResolvedValueOnce({ productId: PRODUCT_ID });
    mockDeniedGrant();
    const { POST } = await import("./route");
    const response = await POST(
      createMockRequest("/api/progress", { method: "POST", body: { lessonId: LESSON_ID, completed: true } })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("Forbidden");
    expect(mockResolveProductAccess).toHaveBeenCalledWith({
      userId: USER_ID,
      userRole: "student",
      productId: PRODUCT_ID,
    });
    expect(mockPrisma.lessonProgress.upsert).not.toHaveBeenCalled();
  });

  it("customer with revoked grant: returns 403 Forbidden", async () => {
    // V2 — AccessGrant.status="revoked" → resolver denies. Same shape
    // as the "no grant at all" branch — the resolver's SQL filter
    // (status="active") blocks revoked rows at the WHERE clause.
    mockCustomer();
    mockPrisma.lesson.findUnique.mockResolvedValueOnce({ productId: PRODUCT_ID });
    mockDeniedGrant();
    const { POST } = await import("./route");
    const response = await POST(
      createMockRequest("/api/progress", { method: "POST", body: { lessonId: LESSON_ID, completed: true } })
    );

    expect(response.status).toBe(403);
  });

  // ── Admin (NO order needed) — bypass inline ─────────────
  it("admin: resolver is called with userRole=admin and grants access", async () => {
    mockAdmin();
    mockPrisma.lesson.findUnique.mockResolvedValueOnce({ productId: PRODUCT_ID });
    // The canonical resolver short-circuits on userRole === "admin" —
    // no inline role check anymore.
    mockResolveProductAccess.mockResolvedValueOnce({
      hasAccess: true,
      reason: "active_purchase",
      productId: PRODUCT_ID,
      orderId: null,
    });
    mockPrisma.lessonProgress.upsert.mockResolvedValueOnce({
      id: "lp1", userId: ADMIN_ID, lessonId: LESSON_ID, completed: true,
    });
    const { POST } = await import("./route");
    const response = await POST(
      createMockRequest("/api/progress", { method: "POST", body: { lessonId: LESSON_ID, completed: true } })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockResolveProductAccess).toHaveBeenCalledWith({
      userId: ADMIN_ID,
      userRole: "admin",
      productId: PRODUCT_ID,
    });
    expect(mockPrisma.lessonProgress.upsert).toHaveBeenCalledOnce();
  });

  // ── Customer with active grant: 200 success ───────────────
  it("customer with active grant: returns 200 success", async () => {
    mockCustomer();
    mockPrisma.lesson.findUnique.mockResolvedValueOnce({ productId: PRODUCT_ID });
    mockAllowedGrant("order");
    mockPrisma.lessonProgress.upsert.mockResolvedValueOnce({
      id: "lp1", userId: USER_ID, lessonId: LESSON_ID, completed: true,
    });
    const { POST } = await import("./route");
    const response = await POST(
      createMockRequest("/api/progress", { method: "POST", body: { lessonId: LESSON_ID, completed: true } })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockResolveProductAccess).toHaveBeenCalledWith({
      userId: USER_ID,
      userRole: "student",
      productId: PRODUCT_ID,
    });
    expect(mockPrisma.lessonProgress.upsert).toHaveBeenCalledOnce();
  });

  // ── sourceType-uniform matrix ──────────────────────────
  // V2 — AccessGrant SSOT honors ALL grant sourceTypes. A student
  // with free_enrollment / admin / bundle grant can equally save
  // progress (admin grant is the V2 manual-grant milestone; bundle
  // grant is the V2 bundles milestone; free_enrollment is the free
  // course access path).
  it.each([
    ["order", "grant-order-1"],
    ["free_enrollment", "grant-free-1"],
    ["admin", "grant-admin-1"],
    ["bundle", "grant-bundle-1"],
  ] as const)(
    "customer with sourceType='%s' grant + lesson: returns 200 success",
    async (sourceType, _grantId) => {
      mockCustomer();
      mockPrisma.lesson.findUnique.mockResolvedValueOnce({ productId: PRODUCT_ID });
      mockAllowedGrant(sourceType);
      mockPrisma.lessonProgress.upsert.mockResolvedValueOnce({
        id: "lp1", userId: USER_ID, lessonId: LESSON_ID, completed: true,
      });

      const { POST } = await import("./route");
      const response = await POST(
        createMockRequest("/api/progress", { method: "POST", body: { lessonId: LESSON_ID, completed: true } })
      );
      expect(response.status).toBe(200);
    },
  );
});
