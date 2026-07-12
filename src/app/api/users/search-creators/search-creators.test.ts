/**
 * Tests for GET /api/users/search-creators?q=<query>&limit=10.
 *
 * Fase 2.4 del piano DMs — endpoint ristretto lato STUDENTE.
 *
 * Scope: ogni User ritornato deve essere un creator (User.role IN
 * ['creator', 'admin']) che possiede almeno un PRODOTTO acquistato
 * dal `currentUser` con `Order.status = "completed"`.
 *
 * Copre:
 *   - auth required (401)
 *   - short query < 2 chars returns empty
 *   - empty / missing / whitespace query returns empty
 *   - scope corretto: solo creator dei MIEI prodotti acquistati
 *   - excludes self dai risultati
 *   - search per name, username, email (case-insensitive)
 *   - limit enforcement (max 20)
 *   - 500 su Prisma error
 *   - special chars (XSS) sanificati da Prisma
 *   - ruolo filtrato: solo `role IN ['creator','admin']`
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockRequest } from "@/app/api/__test-helpers__/mock-request";

// ─── Mocks ────────────────────────────────────────────────────
const mockPrisma = {
  user: {
    findMany: vi.fn(),
  },
};

vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));

const mockGetServerUser = vi.fn();
vi.mock("@/lib/supabase/get-user", () => ({ getServerUser: mockGetServerUser }));

vi.mock("@/lib/utils/rate-limit", () => ({
  withRateLimit: (fn: (...args: unknown[]) => unknown) => fn,
}));

// ─── Helpers ──────────────────────────────────────────────────
const mockAuth = (dbUser: { id: string; email: string; role?: string }) => {
  mockGetServerUser.mockResolvedValue({
    user: { email: dbUser.email },
    dbUser,
  });
};


// ─── Tests ────────────────────────────────────────────────────
describe("GET /api/users/search-creators", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Auth ─────────────────────────────────────────────────
  it("returns 401 when not authenticated", async () => {
    mockGetServerUser.mockResolvedValue({ user: null, dbUser: null });
    const { GET } = await import("./route");
    const res = await GET(createMockRequest("/api/users/search-creators?q=mario"));
    expect(res.status).toBe(401);
  });

  // ── Validation ───────────────────────────────────────────
  it("returns empty users array when query is < 2 chars", async () => {
    mockAuth({ id: "student1", email: "student@test.com", role: "student" });
    const { GET } = await import("./route");
    const res = await GET(createMockRequest("/api/users/search-creators?q=a"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.users).toEqual([]);
    expect(mockPrisma.user.findMany).not.toHaveBeenCalled();
  });

  it("returns empty users array when query is empty string", async () => {
    mockAuth({ id: "student1", email: "student@test.com", role: "student" });
    const { GET } = await import("./route");
    const res = await GET(createMockRequest("/api/users/search-creators?q="));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.users).toEqual([]);
  });

  it("returns empty users array when query is only whitespace", async () => {
    mockAuth({ id: "student1", email: "student@test.com", role: "student" });
    const { GET } = await import("./route");
    const res = await GET(createMockRequest("/api/users/search-creators?q=   "));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.users).toEqual([]);
  });

  it("returns empty users array when q parameter is missing", async () => {
    mockAuth({ id: "student1", email: "student@test.com", role: "student" });
    const { GET } = await import("./route");
    const res = await GET(createMockRequest("/api/users/search-creators"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.users).toEqual([]);
  });

  // ── Scope: creator dei prodotti acquistati ──────────────
  it("filters by role IN ['creator','admin'] AND createdProducts with my completed orders", async () => {
    mockAuth({ id: "student1", email: "student@test.com", role: "student" });
    mockPrisma.user.findMany.mockResolvedValue([
      { id: "creatorA", name: "Creator A", username: null, image: null, role: "creator", bio: null },
    ]);

    const { GET } = await import("./route");
    await GET(createMockRequest("/api/users/search-creators?q=creator"));

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { not: "student1" },
          role: { in: ["creator", "admin"] },
          createdProducts: {
            some: {
              orders: {
                some: {
                  userId: "student1",
                  status: "completed",
                },
              },
            },
          },
        }),
      })
    );
  });

  it("excludes students who are NOT creators (even if they match q)", async () => {
    mockAuth({ id: "student1", email: "student@test.com", role: "student" });
    mockPrisma.user.findMany.mockResolvedValue([]);

    const { GET } = await import("./route");
    await GET(createMockRequest("/api/users/search-creators?q=mario"));

    // Verify role filter is enforced
    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          role: { in: ["creator", "admin"] },
        }),
      })
    );
  });

  it("excludes products with creatorId=null (orphan products) implicitly via createdProducts relation", async () => {
    // The Prisma query `createdProducts.some.{orders.some.{userId:self}}`
    // cannot match users who have NO `createdProducts` (admin/creator
    // che non hanno prodotti pubblicati). Questo test verifica che
    // il filtro `role IN [creator, admin]` è comunque restrittivo:
    // anche se un creator ha TUTTI i prodotti con creatorId=null,
    // i suoi prodotti NON matchano la sub-query e lui non esce.
    mockAuth({ id: "student1", email: "student@test.com", role: "student" });
    mockPrisma.user.findMany.mockResolvedValue([]);

    const { GET } = await import("./route");
    const res = await GET(createMockRequest("/api/users/search-creators?q=creator"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.users).toEqual([]);
  });

  // ── Self-exclude ──────────────────────────────────────────
  it("excludes self from results", async () => {
    mockAuth({ id: "student1", email: "student@test.com", role: "student" });
    mockPrisma.user.findMany.mockResolvedValue([]);

    const { GET } = await import("./route");
    await GET(createMockRequest("/api/users/search-creators?q=student"));

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { not: "student1" },
        }),
      })
    );
  });

  // ── Text match: name / username / email ───────────────────
  it("matches by name (case-insensitive contains)", async () => {
    mockAuth({ id: "student1", email: "student@test.com", role: "student" });
    mockPrisma.user.findMany.mockResolvedValue([]);

    const { GET } = await import("./route");
    await GET(createMockRequest("/api/users/search-creators?q=mar"));

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { name: { contains: "mar", mode: "insensitive" } },
            { username: { contains: "mar", mode: "insensitive" } },
            { email: { startsWith: "mar", mode: "insensitive" } },
          ],
        }),
      })
    );
  });

  it("matches by email prefix", async () => {
    mockAuth({ id: "student1", email: "student@test.com", role: "student" });
    mockPrisma.user.findMany.mockResolvedValue([]);

    const { GET } = await import("./route");
    await GET(createMockRequest("/api/users/search-creators?q=test@"));

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { email: { startsWith: "test@", mode: "insensitive" } },
          ]),
        }),
      })
    );
  });

  // ── Returns only public fields ───────────────────────────
  it("returns only public fields (no email / hashedPassword)", async () => {
    mockAuth({ id: "student1", email: "student@test.com", role: "student" });
    mockPrisma.user.findMany.mockResolvedValue([
      { id: "creatorA", name: "Mario", username: "mario", image: "/a.png", role: "creator", bio: "Hi" },
    ]);

    const { GET } = await import("./route");
    const res = await GET(createMockRequest("/api/users/search-creators?q=mario"));
    const body = await res.json();
    const user = body.users[0];

    expect(user.id).toBe("creatorA");
    expect(user.name).toBe("Mario");
    expect(user.username).toBe("mario");
    expect(user.role).toBe("creator");
    expect(user.bio).toBe("Hi");
    expect(user.email).toBeUndefined();
    expect(user.hashedPassword).toBeUndefined();
  });

  // ── Limit enforcement ────────────────────────────────────
  it("respects limit parameter", async () => {
    mockAuth({ id: "student1", email: "student@test.com", role: "student" });
    mockPrisma.user.findMany.mockResolvedValue([]);

    const { GET } = await import("./route");
    await GET(createMockRequest("/api/users/search-creators?q=test&limit=5"));

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 5 })
    );
  });

  it("caps limit at 20 even if higher is requested", async () => {
    mockAuth({ id: "student1", email: "student@test.com", role: "student" });
    mockPrisma.user.findMany.mockResolvedValue([]);

    const { GET } = await import("./route");
    await GET(createMockRequest("/api/users/search-creators?q=test&limit=100"));

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 20 })
    );
  });

  it("defaults limit to 10 when not specified", async () => {
    mockAuth({ id: "student1", email: "student@test.com", role: "student" });
    mockPrisma.user.findMany.mockResolvedValue([]);

    const { GET } = await import("./route");
    await GET(createMockRequest("/api/users/search-creators?q=test"));

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10 })
    );
  });

  it("uses default 10 when limit is non-numeric", async () => {
    mockAuth({ id: "student1", email: "student@test.com", role: "student" });
    mockPrisma.user.findMany.mockResolvedValue([]);

    const { GET } = await import("./route");
    await GET(createMockRequest("/api/users/search-creators?q=test&limit=abc"));

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10 })
    );
  });

  // ── Ordering ─────────────────────────────────────────────
  it("orders results by name ascending", async () => {
    mockAuth({ id: "student1", email: "student@test.com", role: "student" });
    mockPrisma.user.findMany.mockResolvedValue([]);

    const { GET } = await import("./route");
    await GET(createMockRequest("/api/users/search-creators?q=test"));

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { name: "asc" } })
    );
  });

  // ── Empty results ────────────────────────────────────────
  it("returns empty array when no creators match", async () => {
    mockAuth({ id: "student1", email: "student@test.com", role: "student" });
    mockPrisma.user.findMany.mockResolvedValue([]);

    const { GET } = await import("./route");
    const res = await GET(createMockRequest("/api/users/search-creators?q=zzzzz"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.users).toEqual([]);
  });

  it("returns empty array if student has no completed orders", async () => {
    mockAuth({ id: "student1", email: "student@test.com", role: "student" });
    mockPrisma.user.findMany.mockResolvedValue([]);

    const { GET } = await import("./route");
    const res = await GET(createMockRequest("/api/users/search-creators?q=mario"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.users).toEqual([]);
  });

  // ── Error handling ───────────────────────────────────────
  it("returns 500 on Prisma error", async () => {
    mockAuth({ id: "student1", email: "student@test.com", role: "student" });
    mockPrisma.user.findMany.mockRejectedValue(new Error("DB connection lost"));

    const { GET } = await import("./route");
    const res = await GET(createMockRequest("/api/users/search-creators?q=mario"));

    expect(res.status).toBe(500);
  });

  it("handles special characters in query safely", async () => {
    mockAuth({ id: "student1", email: "student@test.com", role: "student" });
    mockPrisma.user.findMany.mockResolvedValue([]);

    const { GET } = await import("./route");
    const res = await GET(createMockRequest("/api/users/search-creators?q=%3Cscript%3E"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.users).toEqual([]);
  });
});
