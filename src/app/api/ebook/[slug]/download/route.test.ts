import { describe, it, expect, vi, beforeEach } from "vitest";
import { fakeOrder } from "@/app/api/__test-helpers__/fake-order";
import { createMockRequest } from "@/app/api/__test-helpers__/mock-request";

// ─── Mock SSOT helper ───────────────────────────────────────
const mockFindCompletedOrder = vi.fn();

vi.mock("@/lib/access", () => ({
  findCompletedOrder: mockFindCompletedOrder,
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

// ─── fakeOrder factory → @/app/api/__test-helpers__/fake-order (V3.3.2) ─────

// ─── Tests ───────────────────────────────────────────────────
describe("GET /api/ebook/[slug]/download — user-keyed access (NO admin bypass)", () => {
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
    expect(mockFindCompletedOrder).not.toHaveBeenCalled();
    expect(mockGetCourseConfig).not.toHaveBeenCalled();
  });

  // ── Admin WITHOUT order: NO admin bypass on this route ──
  it("admin with no completed order: returns 401 (no admin bypass)", async () => {
    mockAdmin();
    mockFindCompletedOrder.mockResolvedValueOnce(null);
    const { GET } = await import("./route");
    const response = await GET(createMockRequest(`/api/ebook/${SLUG}/download`), { params });

    expect(response.status).toBe(401);
    expect(mockFindCompletedOrder).toHaveBeenCalledWith({
      userId: ADMIN_ID,
      productSlug: SLUG,
    });
  });

  // ── Customer PENDING ─────────────────────────────────────
  it("customer pending order: returns 401 Unauthorized", async () => {
    mockCustomer();
    mockFindCompletedOrder.mockResolvedValueOnce(null);
    const { GET } = await import("./route");
    const response = await GET(createMockRequest(`/api/ebook/${SLUG}/download`), { params });

    expect(response.status).toBe(401);
  });

  // ── Customer NO order ever ───────────────────────────────
  it("customer no order: returns 401 Unauthorized", async () => {
    mockCustomer();
    mockFindCompletedOrder.mockResolvedValueOnce(null);
    const { GET } = await import("./route");
    const response = await GET(createMockRequest(`/api/ebook/${SLUG}/download`), { params });

    expect(response.status).toBe(401);
  });

  // ── Customer completed: BUT course config not found ─────
  it("customer completed but course config NOT found: returns 404", async () => {
    mockCustomer();
    mockFindCompletedOrder.mockResolvedValueOnce(fakeOrder());
    mockGetCourseConfig.mockResolvedValueOnce(null);

    const { GET } = await import("./route");
    const response = await GET(createMockRequest(`/api/ebook/${SLUG}/download`), { params });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Course not found");
  });

  // ── disposition=attachment honors the query param ────────
  it("customer completed with disposition=attachment: returns attachment-form", async () => {
    mockCustomer();
    mockFindCompletedOrder.mockResolvedValueOnce(fakeOrder());
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

  // ── Happy path: customer completed + static PDF present ──
  it("customer completed with static PDF present: returns 200 application/pdf", async () => {
    mockCustomer();
    mockFindCompletedOrder.mockResolvedValueOnce(fakeOrder());
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
});
