import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

// ─── Mock prisma ────────────────────────────────────────────
const mockPrisma = {
  magicLink: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  product: {
    findUnique: vi.fn(),
  },
};

vi.mock("@/lib/db/prisma", () => ({
  prisma: mockPrisma,
}));

// ─── Mock email ─────────────────────────────────────────────
const mockSendMagicLinkEmail = vi.fn().mockResolvedValue(true);
vi.mock("@/lib/services/email", () => ({
  sendMagicLinkEmail: mockSendMagicLinkEmail,
}));

// ─── Mock crypto ────────────────────────────────────────────
vi.mock("crypto", () => ({
  randomBytes: () => ({
    toString: () => "mock-token-123456",
  }),
}));

// ─── Helpers ─────────────────────────────────────────────────
function createMockRequest(options: { body?: unknown; searchParams?: Record<string, string> }) {
  const url = new URL("http://localhost:3000/api/test");
  if (options.searchParams) {
    Object.entries(options.searchParams).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  return {
    json: () => Promise.resolve(options.body ?? {}),
    nextUrl: url,
    headers: { get: () => null },
  } as unknown as NextRequest;
}

// ─── Tests: POST /api/magic-link ────────────────────────────
describe("POST /api/magic-link", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  });

  it("generates a magic link for valid email", async () => {
    mockPrisma.magicLink.create.mockResolvedValue({ id: "ml1", token: "mock-token-123456" });

    const { POST } = await import("../magic-link/route");
    const req = createMockRequest({
      body: { email: "test@example.com" },
    });
    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.magicUrl).toContain("mock-token-123456");
    expect(mockSendMagicLinkEmail).toHaveBeenCalledWith(
      "test@example.com",
      expect.stringContaining("mock-token-123456"),
      undefined,
      "en",
    );
  });

  it("returns 400 for invalid email format", async () => {
    const { POST } = await import("../magic-link/route");
    const req = createMockRequest({
      body: { email: "not-an-email" },
    });
    const response = await POST(req);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Email non valida");
  });

  it("checks product access when productId is provided", async () => {
    mockPrisma.product.findUnique.mockResolvedValue({ id: "prod1", slug: "test-course" });
    mockPrisma.magicLink.create.mockResolvedValue({ id: "ml1" });
    // User has no completed orders → no access
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "u1",
      email: "test@example.com",
      orders: [],
    });

    const { POST } = await import("../magic-link/route");
    const req = createMockRequest({
      body: { email: "test@example.com", productId: "test-course" },
    });
    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.hasAccess).toBe(false);
    expect(mockPrisma.product.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { slug: "test-course" } }),
    );
  });

  it("detects user has access via completed order", async () => {
    mockPrisma.product.findUnique.mockResolvedValue({ id: "prod1", slug: "test-course" });
    mockPrisma.magicLink.create.mockResolvedValue({ id: "ml1" });
    // User has a completed order → has access
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "u1",
      email: "test@example.com",
      orders: [{ id: "o1", status: "completed" }],
    });

    const { POST } = await import("../magic-link/route");
    const req = createMockRequest({
      body: { email: "test@example.com", productId: "test-course" },
    });
    const response = await POST(req);
    const body = await response.json();

    expect(body.hasAccess).toBe(true);
  });

  it("handles server error gracefully", async () => {
    mockPrisma.magicLink.create.mockRejectedValue(new Error("DB error"));

    const { POST } = await import("../magic-link/route");
    const req = createMockRequest({
      body: { email: "test@example.com" },
    });
    const response = await POST(req);

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe("Failed to generate magic link");
  });
});

// ─── Tests: POST /api/auth/verify-magic-link ───────────────
describe("POST /api/auth/verify-magic-link", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("verifies a valid token and returns user", async () => {
    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    mockPrisma.magicLink.findUnique.mockResolvedValue({
      id: "ml1",
      token: "valid-token",
      email: "test@example.com",
      used: false,
      expiresAt: futureDate,
      productId: "prod1",
    });
    mockPrisma.magicLink.update.mockResolvedValue({});
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "u1",
      email: "test@example.com",
      name: "Test User",
      role: "student",
    });

    const { POST } = await import("./verify-magic-link/route");
    const req = createMockRequest({
      body: { token: "valid-token" },
    });
    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.user.email).toBe("test@example.com");
    expect(body.productId).toBe("prod1");
    expect(mockPrisma.magicLink.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ml1" },
        data: { used: true },
      }),
    );
  });

  it("returns 400 when token is missing", async () => {
    const { POST } = await import("./verify-magic-link/route");
    const req = createMockRequest({ body: {} });
    const response = await POST(req);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Missing token");
  });

  it("returns 404 for invalid token", async () => {
    mockPrisma.magicLink.findUnique.mockResolvedValue(null);

    const { POST } = await import("./verify-magic-link/route");
    const req = createMockRequest({ body: { token: "invalid" } });
    const response = await POST(req);

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe("Invalid token");
  });

  it("returns 400 for already used token", async () => {
    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    mockPrisma.magicLink.findUnique.mockResolvedValue({
      id: "ml1",
      token: "used-token",
      email: "test@example.com",
      used: true,
      expiresAt: futureDate,
      productId: null,
    });

    const { POST } = await import("./verify-magic-link/route");
    const req = createMockRequest({ body: { token: "used-token" } });
    const response = await POST(req);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Token already used");
  });

  it("returns 400 for expired token", async () => {
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    mockPrisma.magicLink.findUnique.mockResolvedValue({
      id: "ml1",
      token: "expired-token",
      email: "test@example.com",
      used: false,
      expiresAt: pastDate,
      productId: null,
    });

    const { POST } = await import("./verify-magic-link/route");
    const req = createMockRequest({ body: { token: "expired-token" } });
    const response = await POST(req);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Token expired");
  });

  it("creates a new user if not found", async () => {
    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    mockPrisma.magicLink.findUnique.mockResolvedValue({
      id: "ml1",
      token: "new-user-token",
      email: "newuser@example.com",
      used: false,
      expiresAt: futureDate,
      productId: null,
    });
    mockPrisma.magicLink.update.mockResolvedValue({});
    mockPrisma.user.findUnique.mockResolvedValue(null); // User doesn't exist
    mockPrisma.user.create.mockResolvedValue({
      id: "u-new",
      email: "newuser@example.com",
      name: "newuser",
      role: "student",
    });

    const { POST } = await import("./verify-magic-link/route");
    const req = createMockRequest({ body: { token: "new-user-token" } });
    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.user.id).toBe("u-new");
    expect(mockPrisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: "newuser@example.com" }),
      }),
    );
  });

  it("handles server error gracefully", async () => {
    mockPrisma.magicLink.findUnique.mockRejectedValue(new Error("DB error"));

    const { POST } = await import("./verify-magic-link/route");
    const req = createMockRequest({ body: { token: "any" } });
    const response = await POST(req);

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe("Verification failed");
  });
});
