/**
 * Tests for GET /api/users/search?q=<query>&limit=10.
 *
 * Covers:
 *   - auth required (401)
 *   - short query < 2 chars returns empty
 *   - search by name, username, email prefix
 *   - excludes self from results
 *   - limit enforcement (max 20)
 *   - empty string query
 *   - Prisma error handling (500)
 *   - case-insensitive search via 'mode: insensitive'
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
const mockAuth = (dbUser: { id: string; email: string }) => {
  mockGetServerUser.mockResolvedValue({
    user: { email: dbUser.email },
    dbUser,
  });
};

const createRequest = (url: string): NextRequest =>
  new Request(`http://localhost${url}`) as unknown as NextRequest;

// ─── Tests ────────────────────────────────────────────────────
describe("GET /api/users/search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Auth ─────────────────────────────────────────────────
  it("returns 401 when not authenticated", async () => {
    mockGetServerUser.mockResolvedValue({ user: null, dbUser: null });
    const { GET } = await import("./route");
    const res = await GET(createRequest("/api/users/search?q=mario"));
    expect(res.status).toBe(401);
  });

  // ── Validation ───────────────────────────────────────────
  it("returns empty users array when query is < 2 chars", async () => {
    mockAuth({ id: "user1", email: "a@test.com" });
    const { GET } = await import("./route");
    const res = await GET(createRequest("/api/users/search?q=a"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.users).toEqual([]);
    expect(mockPrisma.user.findMany).not.toHaveBeenCalled();
  });

  it("returns empty users array when query is empty string", async () => {
    mockAuth({ id: "user1", email: "a@test.com" });
    const { GET } = await import("./route");
    const res = await GET(createRequest("/api/users/search?q="));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.users).toEqual([]);
  });

  it("returns empty users array when query is only whitespace", async () => {
    mockAuth({ id: "user1", email: "a@test.com" });
    const { GET } = await import("./route");
    const res = await GET(createRequest("/api/users/search?q=   "));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.users).toEqual([]);
  });

  it("returns empty users array when q parameter is missing entirely", async () => {
    mockAuth({ id: "user1", email: "a@test.com" });
    const { GET } = await import("./route");
    const res = await GET(createRequest("/api/users/search"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.users).toEqual([]);
  });

  // ── Search by name ───────────────────────────────────────
  it("searches users by name (case-insensitive)", async () => {
    mockAuth({ id: "user1", email: "a@test.com" });
    const mockUsers = [
      { id: "user2", name: "Mario Rossi", username: "mrossi", image: null, role: "student", bio: null },
      { id: "user3", name: "Maria Bianchi", username: "mbianchi", image: null, role: "student", bio: "Ciao!" },
    ];
    mockPrisma.user.findMany.mockResolvedValue(mockUsers);

    const { GET } = await import("./route");
    const res = await GET(createRequest("/api/users/search?q=mar"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.users).toHaveLength(2);
    expect(body.users[0].name).toBe("Mario Rossi");
    expect(body.users[1].name).toBe("Maria Bianchi");

    // Verify prisma was called with the right query
    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { not: "user1" },
          OR: [
            { name: { contains: "mar", mode: "insensitive" } },
            { username: { contains: "mar", mode: "insensitive" } },
            { email: { startsWith: "mar", mode: "insensitive" } },
          ],
        }),
      })
    );
  });

  it("searches users by username", async () => {
    mockAuth({ id: "user1", email: "a@test.com" });
    mockPrisma.user.findMany.mockResolvedValue([
      { id: "user2", name: "Test User", username: "teuser", image: null, role: "student", bio: null },
    ]);

    const { GET } = await import("./route");
    const res = await GET(createRequest("/api/users/search?q=teuser"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.users).toHaveLength(1);
  });

  it("searches users by email prefix", async () => {
    mockAuth({ id: "user1", email: "a@test.com" });
    mockPrisma.user.findMany.mockResolvedValue([
      { id: "user2", name: null, username: null, image: null, role: "student", bio: null },
    ]);

    const { GET } = await import("./route");
    const res = await GET(createRequest("/api/users/search?q=test@"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.users).toHaveLength(1);
  });

  // ── Excludes self ────────────────────────────────────────
  it("excludes the authenticated user from results", async () => {
    mockAuth({ id: "user1", email: "a@test.com" });
    mockPrisma.user.findMany.mockResolvedValue([]);

    const { GET } = await import("./route");
    await GET(createRequest("/api/users/search?q=user1"));

    // Verify `id: { not: dbUser.id }` is always passed
    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { not: "user1" },
        }),
      })
    );
  });

  // ── Returns only public fields ───────────────────────────
  it("returns only public fields (no email, hashedPassword)", async () => {
    mockAuth({ id: "user1", email: "a@test.com" });
    const mockUsers = [
      { id: "user2", name: "Jane", username: "jane", image: "/avatar.png", role: "admin", bio: "Creator" },
    ];
    mockPrisma.user.findMany.mockResolvedValue(mockUsers);

    const { GET } = await import("./route");
    const res = await GET(createRequest("/api/users/search?q=jane"));
    const body = await res.json();

    const user = body.users[0];
    expect(user.id).toBe("user2");
    expect(user.name).toBe("Jane");
    expect(user.username).toBe("jane");
    expect(user.image).toBe("/avatar.png");
    expect(user.role).toBe("admin");
    expect(user.bio).toBe("Creator");
    // These should never be in the response
    expect(user.email).toBeUndefined();
    expect(user.hashedPassword).toBeUndefined();
  });

  // ── Limit enforcement ────────────────────────────────────
  it("respects the limit parameter", async () => {
    mockAuth({ id: "user1", email: "a@test.com" });
    mockPrisma.user.findMany.mockResolvedValue([]);

    const { GET } = await import("./route");
    await GET(createRequest("/api/users/search?q=test&limit=5"));

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 5 })
    );
  });

  it("caps limit at 20 even if higher is requested", async () => {
    mockAuth({ id: "user1", email: "a@test.com" });
    mockPrisma.user.findMany.mockResolvedValue([]);

    const { GET } = await import("./route");
    await GET(createRequest("/api/users/search?q=test&limit=100"));

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 20 })
    );
  });

  it("defaults limit to 10 when not specified", async () => {
    mockAuth({ id: "user1", email: "a@test.com" });
    mockPrisma.user.findMany.mockResolvedValue([]);

    const { GET } = await import("./route");
    await GET(createRequest("/api/users/search?q=test"));

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10 })
    );
  });

  it("uses limit=10 when limit param is not a number", async () => {
    mockAuth({ id: "user1", email: "a@test.com" });
    mockPrisma.user.findMany.mockResolvedValue([]);

    const { GET } = await import("./route");
    await GET(createRequest("/api/users/search?q=test&limit=abc"));

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10 })
    );
  });

  // ── Edge cases ───────────────────────────────────────────
  it("orders results by name ascending", async () => {
    mockAuth({ id: "user1", email: "a@test.com" });
    mockPrisma.user.findMany.mockResolvedValue([]);

    const { GET } = await import("./route");
    await GET(createRequest("/api/users/search?q=test"));

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { name: "asc" } })
    );
  });

  it("returns empty array when no users match", async () => {
    mockAuth({ id: "user1", email: "a@test.com" });
    mockPrisma.user.findMany.mockResolvedValue([]);

    const { GET } = await import("./route");
    const res = await GET(createRequest("/api/users/search?q=zzzzz"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.users).toEqual([]);
  });

  // ── Error handling ───────────────────────────────────────
  it("returns 500 on Prisma error", async () => {
    mockAuth({ id: "user1", email: "a@test.com" });
    mockPrisma.user.findMany.mockRejectedValue(new Error("DB connection lost"));

    const { GET } = await import("./route");
    const res = await GET(createRequest("/api/users/search?q=mario"));

    expect(res.status).toBe(500);
  });

  it("handles special characters in query safely", async () => {
    mockAuth({ id: "user1", email: "a@test.com" });
    mockPrisma.user.findMany.mockResolvedValue([]);

    const { GET } = await import("./route");
    const res = await GET(createRequest("/api/users/search?q=%3Cscript%3E"));

    // Should not crash — Prisma handles the raw string
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.users).toEqual([]);
  });
});
