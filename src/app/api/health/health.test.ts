/**
 * Unit tests for GET /api/health endpoint.
 *
 * Mock strategy:
 *   - Mock `@/lib/db/prisma` → control Prisma $queryRaw behavior
 *   - Mock `@/lib/redis` → control getRedis() return value (redis client or null)
 *   - Test all states: healthy, DB down, Redis down, Redis not configured, degraded
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock Prisma ─────────────────────────────────────────────
const mockPrisma = {
  $queryRaw: vi.fn(),
};

vi.mock("@/lib/db/prisma", () => ({
  prisma: mockPrisma,
}));

// ─── Mock Redis ──────────────────────────────────────────────
const mockGetRedis = vi.fn();

vi.mock("@/lib/redis", () => ({
  getRedis: mockGetRedis,
}));

function createMockRedisClient(shouldFail = false) {
  return {
    async ping() {
      if (shouldFail) throw new Error("Redis connection lost");
      return "PONG";
    },
  };
}

// ─── Tests ───────────────────────────────────────────────────
describe("GET /api/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset env vars
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  it("returns healthy when DB and Redis are up", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    mockGetRedis.mockReturnValue(createMockRedisClient(false));

    const { GET } = await import("./route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("healthy");
    expect(body.services.database.status).toBe("up");
    expect(body.services.redis.status).toBe("up");
    expect(body.services.database.latencyMs).toBeGreaterThanOrEqual(0);
    expect(body.services.redis.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("returns unhealthy when database is down", async () => {
    mockPrisma.$queryRaw.mockRejectedValue(new Error("DB connection refused"));
    mockGetRedis.mockReturnValue(createMockRedisClient(false));

    const { GET } = await import("./route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.status).toBe("unhealthy");
    expect(body.services.database.status).toBe("down");
    expect(body.services.database.latencyMs).toBe(0);
    expect(body.services.redis.status).toBe("up");
  });

  it("returns degraded when Redis is down but DB is up", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    mockGetRedis.mockReturnValue(createMockRedisClient(true)); // Redis fails

    const { GET } = await import("./route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("degraded");
    expect(body.services.database.status).toBe("up");
    expect(body.services.redis.status).toBe("down");
  });

  it("returns not_configured when Redis is not set up", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    mockGetRedis.mockReturnValue(null); // Redis not configured

    const { GET } = await import("./route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("healthy"); // Redis not required
    expect(body.services.redis.status).toBe("not_configured");
    expect(body.services.redis.latencyMs).toBe(0);
  });

  it("returns unhealthy when both DB and Redis are down", async () => {
    mockPrisma.$queryRaw.mockRejectedValue(new Error("DB down"));
    mockGetRedis.mockReturnValue(createMockRedisClient(true));

    const { GET } = await import("./route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.status).toBe("unhealthy");
    expect(body.services.database.status).toBe("down");
    expect(body.services.redis.status).toBe("down");
  });

  // ─── Response structure ────────────────────────────────────
  it("includes system info in the response", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    mockGetRedis.mockReturnValue(createMockRedisClient(false));

    const { GET } = await import("./route");
    const response = await GET();
    const body = await response.json();

    expect(body.timestamp).toBeDefined();
    expect(typeof body.timestamp).toBe("string");
    expect(body.uptime).toBeGreaterThanOrEqual(0);
    expect(body.system.nodeVersion).toBeDefined();
    expect(body.system.platform).toBeDefined();
    expect(body.system.memory.rss).toMatch(/\d+MB/);
    expect(body.system.memory.heapUsed).toMatch(/\d+MB/);
    expect(body.system.memory.heapTotal).toMatch(/\d+MB/);
  });

  it("includes cache-control no-store header", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    mockGetRedis.mockReturnValue(createMockRedisClient(false));

    const { GET } = await import("./route");
    const response = await GET();

    expect(response.headers.get("Cache-Control")).toBe(
      "no-store, no-cache, must-revalidate, proxy-revalidate"
    );
  });

  it("includes X-Response-Time header", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    mockGetRedis.mockReturnValue(createMockRedisClient(false));

    const { GET } = await import("./route");
    const response = await GET();

    expect(response.headers.get("X-Response-Time")).toMatch(/^\d+ms$/);
  });

  // ─── Edge cases ────────────────────────────────────────────
  it("reports DB latency even when Redis is unavailable", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    mockGetRedis.mockReturnValue(null);

    const { GET } = await import("./route");
    const response = await GET();
    const body = await response.json();

    expect(body.services.database.latencyMs).toBeGreaterThanOrEqual(0);
    expect(body.services.redis.latencyMs).toBe(0);
    expect(body.services.redis.status).toBe("not_configured");
  });

  it("handles DB query returning empty array gracefully", async () => {
    // SELECT 1 returns a row, but even empty array shouldn't crash
    mockPrisma.$queryRaw.mockResolvedValue([]);
    mockGetRedis.mockReturnValue(createMockRedisClient(false));

    const { GET } = await import("./route");
    const response = await GET();
    const body = await response.json();

    // DB didn't throw → considered up
    expect(body.services.database.status).toBe("up");
    expect(response.status).toBe(200);
  });
});
