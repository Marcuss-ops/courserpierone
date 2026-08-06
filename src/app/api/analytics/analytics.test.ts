import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

// ─── Mock prisma ────────────────────────────────────────────
const mockPrisma = {
  analyticEvent: {
    create: vi.fn(),
    count: vi.fn(),
    findMany: vi.fn(),
  },
  visitorSession: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
};

vi.mock("@/lib/db/prisma", () => ({
  prisma: mockPrisma,
}));

// ─── Helpers ─────────────────────────────────────────────────
function createMockRequest(options: {
  body?: unknown;
  searchParams?: Record<string, string>;
  headers?: Record<string, string>;
}) {
  const url = new URL("http://localhost:3000/api/analytics");
  if (options.searchParams) {
    Object.entries(options.searchParams).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  return {
    json: () => Promise.resolve(options.body ?? {}),
    nextUrl: url,
    headers: {
      get: (name: string) => options.headers?.[name] ?? null,
    },
  } as unknown as NextRequest;
}

// ─── Tests ───────────────────────────────────────────────────
describe("POST /api/analytics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records a pageview event", async () => {
    mockPrisma.analyticEvent.create.mockResolvedValue({ id: "evt1", eventType: "pageview" });

    const { POST } = await import("./route");
    const req = createMockRequest({
      body: { eventType: "pageview", productSlug: "course-1" },
    });
    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockPrisma.analyticEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: "pageview",
          productId: null,
          productSlug: "course-1",
          providerProductId: null,
        }),
      }),
    );
  });

  it("records a purchase event with metadata", async () => {
    mockPrisma.analyticEvent.create.mockResolvedValue({ id: "evt2" });

    const { POST } = await import("./route");
    const req = createMockRequest({
      body: {
        eventType: "purchase",
        productId: "clxyz1234567890abcdefghij",
        productSlug: "course-1",
        providerProductId: "variant-1",
        userId: "u1",
        metadata: { amount: 4900, currency: "eur" },
      },
    });
    const response = await POST(req);

    expect(response.status).toBe(200);
    expect(mockPrisma.analyticEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "u1",
          productId: "clxyz1234567890abcdefghij",
          productSlug: "course-1",
          providerProductId: "variant-1",
          metadata: expect.stringContaining("4900"),
        }),
      }),
    );
  });

  it("creates a visitor session when sessionId is new", async () => {
    mockPrisma.visitorSession.findUnique.mockResolvedValue(null);
    mockPrisma.visitorSession.create.mockResolvedValue({ id: "sess-new" });
    mockPrisma.analyticEvent.create.mockResolvedValue({ id: "evt3" });

    const { POST } = await import("./route");
    const req = createMockRequest({
      body: {
        eventType: "pageview",
        sessionId: "sess-new",
        metadata: { referrer: "https://youtube.com", utm_source: "youtube" },
      },
    });
    const response = await POST(req);

    expect(response.status).toBe(200);
    expect(mockPrisma.visitorSession.create).toHaveBeenCalledOnce();
    expect(mockPrisma.visitorSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          id: "sess-new",
          referrer: "https://youtube.com",
          utmSource: "youtube",
        }),
      }),
    );
  });

  it("tracks existing visitor session", async () => {
    mockPrisma.visitorSession.findUnique.mockResolvedValue({ id: "sess-existing" });
    mockPrisma.visitorSession.update.mockResolvedValue({ id: "sess-existing" });
    mockPrisma.analyticEvent.create.mockResolvedValue({ id: "evt4" });

    const { POST } = await import("./route");
    const req = createMockRequest({
      body: { eventType: "pageview", sessionId: "sess-existing" },
    });
    const response = await POST(req);

    expect(response.status).toBe(200);
    expect(mockPrisma.visitorSession.update).toHaveBeenCalledOnce();
  });

  it("returns 400 for invalid eventType", async () => {
    const { POST } = await import("./route");
    const req = createMockRequest({
      body: { eventType: "invalid_event" },
    });
    const response = await POST(req);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Invalid event data");
  });

  it("handles server error gracefully", async () => {
    mockPrisma.analyticEvent.create.mockRejectedValue(new Error("DB error"));

    const { POST } = await import("./route");
    const req = createMockRequest({
      body: { eventType: "pageview" },
    });
    const response = await POST(req);

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe("Failed to record event");
  });
});

describe("GET /api/analytics/funnel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("counts anonymous events alongside identified visitors", async () => {
    mockPrisma.analyticEvent.findMany.mockResolvedValue([
      { eventType: "pageview", sessionId: "session-1", metadata: null, createdAt: new Date() },
      { eventType: "pageview", sessionId: null, metadata: null, createdAt: new Date() },
      { eventType: "pageview", sessionId: "session-2", metadata: null, createdAt: new Date() },
    ]);

    const { GET } = await import("./funnel/route");
    const req = createMockRequest({ searchParams: { productSlug: "course-1" } });
    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.funnelSteps[0]).toMatchObject({
      step: "pageview",
      uniqueVisitors: 3,
      totalEvents: 3,
    });
    expect(body.summary.totalVisitors).toBe(3);
  });
});

describe("GET /api/analytics/dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns dashboard stats with computed metrics", async () => {
    // Mock counts
    mockPrisma.analyticEvent.count
      .mockResolvedValueOnce(100) // pageviews
      .mockResolvedValueOnce(20) // clicks
      .mockResolvedValueOnce(5); // purchases

    // Mock revenue events
    mockPrisma.analyticEvent.findMany.mockResolvedValueOnce([
      { metadata: JSON.stringify({ amount: 4900 }) },
      { metadata: JSON.stringify({ amount: 2900 }) },
      { metadata: JSON.stringify({ amount: 9900 }) },
    ]);

    // Mock daily stats
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    mockPrisma.analyticEvent.findMany.mockResolvedValueOnce([
      { createdAt: yesterday, eventType: "pageview" },
      { createdAt: yesterday, eventType: "click_buy" },
      { createdAt: today, eventType: "pageview" },
      { createdAt: today, eventType: "purchase" },
    ]);

    const { GET } = await import("./dashboard/route");
    const req = createMockRequest({ searchParams: { days: "30", productId: "p1" } });
    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.pageviews).toBe(100);
    expect(body.clicks).toBe(20);
    expect(body.purchases).toBe(5);
    expect(body.totalRevenue).toBe((4900 + 2900 + 9900) / 100);
    expect(body.ctr).toBe("20.0"); // (20/100)*100
    expect(body.conversion).toBe("25.0"); // (5/20)*100
    expect(body.chartData.length).toBeGreaterThan(0);
  });

  it("returns zero stats when no events exist", async () => {
    mockPrisma.analyticEvent.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);

    mockPrisma.analyticEvent.findMany
      .mockResolvedValueOnce([]) // revenue
      .mockResolvedValueOnce([]); // daily

    const { GET } = await import("./dashboard/route");
    const req = createMockRequest({});
    const response = await GET(req);
    const body = await response.json();

    expect(body.pageviews).toBe(0);
    expect(body.clicks).toBe(0);
    expect(body.purchases).toBe(0);
    expect(body.totalRevenue).toBe(0);
    expect(body.ctr).toBe("0.0");
    expect(body.cr).toBe("0.0");
  });

  it("handles malformed revenue metadata gracefully", async () => {
    mockPrisma.analyticEvent.count
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(3);

    mockPrisma.analyticEvent.findMany
      .mockResolvedValueOnce([
        { metadata: "{invalid json}" },
        { metadata: null },
        { metadata: JSON.stringify({ amount: 9900 }) },
      ])
      .mockResolvedValueOnce([]);

    const { GET } = await import("./dashboard/route");
    const req = createMockRequest({});
    const response = await GET(req);
    const body = await response.json();

    // Only the valid metadata should count
    expect(body.totalRevenue).toBe(9900 / 100);
  });

  it("returns error on prisma failure", async () => {
    mockPrisma.analyticEvent.count.mockRejectedValue(new Error("DB down"));

    const { GET } = await import("./dashboard/route");
    const req = createMockRequest({});
    const response = await GET(req);

    expect(response.status).toBe(500);
  });
});
