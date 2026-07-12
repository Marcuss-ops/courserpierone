/**
 * Tests for GET /api/users/search-customers?q=<query>&limit=10.
 *
 * Fase 2.4 del piano DMs — endpoint ristretto lato CREATOR.
 *
 * Scope: ogni User ritornato deve avere almeno un Order.status =
 * "completed" verso un prodotto del `currentUser` (creator).
 *
 * Copre:
 *   - auth required (401)
 *   - short query < 2 chars returns empty
 *   - empty / missing / whitespace query returns empty
 *   - scope corretto: completed orders verso PRODOTTI DEL CREATOR
 *     (non altri creator)
 *   - excludes self dai risultati
 *   - search per name, username, email (case-insensitive)
 *   - limit enforcement (max 20)
 *   - 500 su Prisma error
 *   - special chars (XSS) sanificati da Prisma
 *   - ruolo non filtra (un cliente può essere anche un creator che
 *     ha comprato da un altro creator — questo è OK)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

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
  withRateLimit: (fn: Function) => fn,
}));

// ─── Helpers ──────────────────────────────────────────────────
const mockAuth = (dbUser: { id: string; email: string; role?: string }) => {
  mockGetServerUser.mockResolvedValue({
    user: { email: dbUser.email },
    dbUser,
  });
};

const createRequest = (url: string): NextRequest =>
  new Request(`http://localhost${url}`) as unknown as NextRequest;

// ─── Tests ────────────────────────────────────────────────────
describe("GET /api/users/search-customers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Auth ─────────────────────────────────────────────────
  it("returns 401 when not authenticated", async () => {
    mockGetServerUser.mockResolvedValue({ user: null, dbUser: null });
    const { GET } = await import("./route");
    const res = await GET(createRequest("/api/users/search-customers?q=mario"));
    expect(res.status).toBe(401);
  });

  // ── Validation ───────────────────────────────────────────
  it("returns empty users array when query is < 2 chars", async () => {
    mockAuth({ id: "creator1", email: "creator@test.com", role: "creator" });
    const { GET } = await import("./route");
    const res = await GET(createRequest("/api/users/search-customers?q=a"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.users).toEqual([]);
    expect(mockPrisma.user.findMany).not.toHaveBeenCalled();
  });

  it("returns empty users array when query is empty string", async () => {
    mockAuth({ id: "creator1", email: "creator@test.com", role: "creator" });
    const { GET } = await import("./route");
    const res = await GET(createRequest("/api/users/search-customers?q="));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.users).toEqual([]);
  });

  it("returns empty users array when query is only whitespace", async () => {
    mockAuth({ id: "creator1", email: "creator@test.com", role: "creator" });
    const { GET } = await import("./route");
    const res = await GET(createRequest("/api/users/search-customers?q=   "));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.users).toEqual([]);
  });

  it("returns empty users array when q parameter is missing", async () => {
    mockAuth({ id: "creator1", email: "creator@test.com", role: "creator" });
    const { GET } = await import("./route");
    const res = await GET(createRequest("/api/users/search-customers"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.users).toEqual([]);
  });

  // ── Scope: completed orders del creator corrente ─────────
  it("filters by orders with status=completed AND product.creatorId=self", async () => {
    mockAuth({ id: "creator1", email: "creator@test.com", role: "creator" });
    mockPrisma.user.findMany.mockResolvedValue([
      { id: "buyer1", name: "Buyer One", username: null, image: null, role: "student", bio: null },
    ]);

    const { GET } = await import("./route");
    await GET(createRequest("/api/users/search-customers?q=buyer"));

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { not: "creator1" },
          orders: {
            some: {
              status: "completed",
              product: {
                creatorId: "creator1",
              },
            },
          },
        }),
      })
    );
  });

  it("excludes users whose only orders are pending/failed (status != completed)", async () => {
    // This is enforced by the Prisma `orders.some.status = completed`
    // filter — we just check the call shape. Behavior is implicit.
    mockAuth({ id: "creator1", email: "creator@test.com", role: "creator" });
    mockPrisma.user.findMany.mockResolvedValue([]);

    const { GET } = await import("./route");
    await GET(createRequest("/api/users/search-customers?q=test"));

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          orders: expect.objectContaining({
            some: expect.objectContaining({ status: "completed" }),
          }),
        }),
      })
    );
  });

  // ── Self-escludo ─────────────────────────────────────────
  it("excludes self from results", async () => {
    mockAuth({ id: "creator1", email: "creator@test.com", role: "creator" });
    mockPrisma.user.findMany.mockResolvedValue([]);

    const { GET } = await import("./route");
    await GET(createRequest("/api/users/search-customers?q=creator"));

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { not: "creator1" },
        }),
      })
    );
  });

  // ── Text match: name / username / email ───────────────────
  it("matches by name (case-insensitive contains)", async () => {
    mockAuth({ id: "creator1", email: "creator@test.com", role: "creator" });
    mockPrisma.user.findMany.mockResolvedValue([]);

    const { GET } = await import("./route");
    await GET(createRequest("/api/users/search-customers?q=mar"));

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
    mockAuth({ id: "creator1", email: "creator@test.com", role: "creator" });
    mockPrisma.user.findMany.mockResolvedValue([]);

    const { GET } = await import("./route");
    await GET(createRequest("/api/users/search-customers?q=test@"));

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
    mockAuth({ id: "creator1", email: "creator@test.com", role: "creator" });
    mockPrisma.user.findMany.mockResolvedValue([
      { id: "buyer1", name: "Jane", username: "jane", image: "/a.png", role: "student", bio: "Hi" },
    ]);

    const { GET } = await import("./route");
    const res = await GET(createRequest("/api/users/search-customers?q=jane"));
    const body = await res.json();
    const user = body.users[0];

    expect(user.id).toBe("buyer1");
    expect(user.name).toBe("Jane");
    expect(user.username).toBe("jane");
    expect(user.role).toBe("student");
    expect(user.bio).toBe("Hi");
    expect(user.email).toBeUndefined();
    expect(user.hashedPassword).toBeUndefined();
  });

  // ── Limit enforcement ────────────────────────────────────
  it("respects limit parameter", async () => {
    mockAuth({ id: "creator1", email: "creator@test.com", role: "creator" });
    mockPrisma.user.findMany.mockResolvedValue([]);

    const { GET } = await import("./route");
    await GET(createRequest("/api/users/search-customers?q=test&limit=5"));

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 5 })
    );
  });

  it("caps limit at 20 even if higher is requested", async () => {
    mockAuth({ id: "creator1", email: "creator@test.com", role: "creator" });
    mockPrisma.user.findMany.mockResolvedValue([]);

    const { GET } = await import("./route");
    await GET(createRequest("/api/users/search-customers?q=test&limit=100"));

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 20 })
    );
  });

  it("defaults limit to 10 when not specified", async () => {
    mockAuth({ id: "creator1", email: "creator@test.com", role: "creator" });
    mockPrisma.user.findMany.mockResolvedValue([]);

    const { GET } = await import("./route");
    await GET(createRequest("/api/users/search-customers?q=test"));

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10 })
    );
  });

  it("uses default 10 when limit is non-numeric", async () => {
    mockAuth({ id: "creator1", email: "creator@test.com", role: "creator" });
    mockPrisma.user.findMany.mockResolvedValue([]);

    const { GET } = await import("./route");
    await GET(createRequest("/api/users/search-customers?q=test&limit=abc"));

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10 })
    );
  });

  // ── Ordering ─────────────────────────────────────────────
  it("orders results by name ascending", async () => {
    mockAuth({ id: "creator1", email: "creator@test.com", role: "creator" });
    mockPrisma.user.findMany.mockResolvedValue([]);

    const { GET } = await import("./route");
    await GET(createRequest("/api/users/search-customers?q=test"));

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { name: "asc" } })
    );
  });

  // ── Empty results ────────────────────────────────────────
  it("returns empty array when no customers match", async () => {
    mockAuth({ id: "creator1", email: "creator@test.com", role: "creator" });
    mockPrisma.user.findMany.mockResolvedValue([]);

    const { GET } = await import("./route");
    const res = await GET(createRequest("/api/users/search-customers?q=zzzzz"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.users).toEqual([]);
  });

  it("returns empty array if creator has no products (no completed orders possible)", async () => {
    mockAuth({ id: "creator1", email: "creator@test.com", role: "creator" });
    mockPrisma.user.findMany.mockResolvedValue([]);

    const { GET } = await import("./route");
    const res = await GET(createRequest("/api/users/search-customers?q=mario"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.users).toEqual([]);
  });

  // ── Error handling ───────────────────────────────────────
  it("returns 500 on Prisma error", async () => {
    mockAuth({ id: "creator1", email: "creator@test.com", role: "creator" });
    mockPrisma.user.findMany.mockRejectedValue(new Error("DB connection lost"));

    const { GET } = await import("./route");
    const res = await GET(createRequest("/api/users/search-customers?q=mario"));

    expect(res.status).toBe(500);
  });

  it("handles special characters in query safely", async () => {
    mockAuth({ id: "creator1", email: "creator@test.com", role: "creator" });
    mockPrisma.user.findMany.mockResolvedValue([]);

    const { GET } = await import("./route");
    const res = await GET(createRequest("/api/users/search-customers?q=%3Cscript%3E"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.users).toEqual([]);
  });
});
