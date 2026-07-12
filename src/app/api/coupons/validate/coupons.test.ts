import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockRequest } from "@/app/api/__test-helpers__/mock-request";

// ─── Mock prisma BEFORE importing the route ─────────────────────
// Pattern: inline the mock object inside the vi.mock factory to avoid
// TDZ issues when vitest hoists vi.mock above top-level const declarations.
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    coupon: {
      findUnique: vi.fn(),
    },
  },
}));

import { GET } from "./route";
import { prisma } from "@/lib/db/prisma";

// ─── Helpers ─────────────────────────────────────────────────────
function buildCoupon(overrides: Partial<{
  id: string;
  code: string;
  type: "percent" | "fixed";
  value: number;
  minAmount: number | null;
  maxUses: number | null;
  usedCount: number;
  productId: string | null;
  expiresAt: Date | null;
  isActive: boolean;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}> = {}) {
  const now = new Date();
  return {
    id: "coupon_123",
    code: "SUMMER2026",
    type: "percent",
    value: 20,
    minAmount: null,
    maxUses: null,
    usedCount: 0,
    productId: null,
    expiresAt: null,
    isActive: true,
    description: "Summer sale",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: a valid percent coupon is found
  vi.mocked(prisma.coupon.findUnique).mockResolvedValue(buildCoupon());
});

// ─── Tests ───────────────────────────────────────────────────────
describe("GET /api/coupons/validate — input validation", () => {
  it("returns 400 when code parameter is missing", async () => {
    const response = await GET(createMockRequest("/api/coupons/validate", { query: {} }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/missing code/i);
  });

  it("passes the code to findUnique (after normalization)", async () => {
    await GET(createMockRequest("/api/coupons/validate", { query: { code: "summer 2026" } }));
    expect(vi.mocked(prisma.coupon.findUnique)).toHaveBeenCalledWith({
      where: { code: "SUMMER2026" },
    });
  });

  it("normalizes code: lowercase + whitespace collapses", async () => {
    await GET(createMockRequest("/api/coupons/validate", { query: { code: "  summer   2026  " } }));
    expect(vi.mocked(prisma.coupon.findUnique)).toHaveBeenCalledWith({
      where: { code: "SUMMER2026" },
    });
  });
});

describe("GET /api/coupons/validate — rejection paths", () => {
  it("returns 404 valid:false when coupon does not exist", async () => {
    vi.mocked(prisma.coupon.findUnique).mockResolvedValueOnce(null);

    const response = await GET(createMockRequest("/api/coupons/validate", { query: { code: "GHOST" } }));
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.valid).toBe(false);
    expect(body.error).toMatch(/non trovato/i);
  });

  it("returns 400 valid:false when coupon is inactive", async () => {
    vi.mocked(prisma.coupon.findUnique).mockResolvedValueOnce(
      buildCoupon({ isActive: false })
    );

    const response = await GET(createMockRequest("/api/coupons/validate", { query: { code: "SUMMER2026" } }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.valid).toBe(false);
    expect(body.error).toMatch(/disattivato/i);
  });

  it("returns 400 valid:false when coupon has expired", async () => {
    vi.mocked(prisma.coupon.findUnique).mockResolvedValueOnce(
      buildCoupon({ expiresAt: new Date("2020-01-01") })
    );

    const response = await GET(createMockRequest("/api/coupons/validate", { query: { code: "SUMMER2026" } }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.valid).toBe(false);
    expect(body.error).toMatch(/scaduto/i);
  });

  it("returns 400 valid:false when coupon is exhausted (usedCount >= maxUses)", async () => {
    vi.mocked(prisma.coupon.findUnique).mockResolvedValueOnce(
      buildCoupon({ maxUses: 5, usedCount: 5 })
    );

    const response = await GET(createMockRequest("/api/coupons/validate", { query: { code: "SUMMER2026" } }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.valid).toBe(false);
    expect(body.error).toMatch(/esaurito/i);
  });

  it("returns 200 valid:true when usedCount is BELOW maxUses", async () => {
    vi.mocked(prisma.coupon.findUnique).mockResolvedValueOnce(
      buildCoupon({ maxUses: 100, usedCount: 42, type: "fixed", value: 1000 })
    );

    const response = await GET(
      createMockRequest("/api/coupons/validate", { query: { code: "REMAINING", amount: "4900" } })
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.valid).toBe(true);
  });

  it("returns 400 valid:false when coupon.productId does not match", async () => {
    vi.mocked(prisma.coupon.findUnique).mockResolvedValueOnce(
      buildCoupon({
        productId: "prod_specific_course",
        type: "percent",
        value: 30,
      })
    );

    const response = await GET(
      createMockRequest("/api/coupons/validate", {
        query: {
          code: "COURSEA",
          productId: "prod_other_course",
          amount: "4900",
        },
      })
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.valid).toBe(false);
    expect(body.error).toMatch(/non valido per questo prodotto/i);
  });

  it("returns 200 valid:true when coupon.productId DOES match requested product", async () => {
    vi.mocked(prisma.coupon.findUnique).mockResolvedValueOnce(
      buildCoupon({
        productId: "prod_specific_course",
        type: "percent",
        value: 30,
      })
    );

    const response = await GET(
      createMockRequest("/api/coupons/validate", {
        query: {
          code: "COURSEA",
          productId: "prod_specific_course",
          amount: "4900",
        },
      })
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.valid).toBe(true);
    expect(body.discountAmount).toBe(Math.round(4900 * 30 / 100));
  });

  it("returns 400 valid:false when amount below minAmount", async () => {
    vi.mocked(prisma.coupon.findUnique).mockResolvedValueOnce(
      buildCoupon({ minAmount: 5000, type: "percent", value: 10 })
    );

    const response = await GET(
      createMockRequest("/api/coupons/validate", { query: { code: "BIGONLY", amount: "4900" } })
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.valid).toBe(false);
    expect(body.error).toMatch(/importo minimo/i);
  });

  it("returns 200 valid:true when amount >= minAmount", async () => {
    vi.mocked(prisma.coupon.findUnique).mockResolvedValueOnce(
      buildCoupon({ minAmount: 4000, type: "percent", value: 10 })
    );

    const response = await GET(
      createMockRequest("/api/coupons/validate", { query: { code: "BIGONLY", amount: "4900" } })
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.valid).toBe(true);
    expect(body.discountAmount).toBe(Math.round(4900 * 10 / 100)); // 490
  });

  it("skips minAmount check when coupon.minAmount is null", async () => {
    vi.mocked(prisma.coupon.findUnique).mockResolvedValueOnce(
      buildCoupon({ minAmount: null, type: "percent", value: 20 })
    );

    // amount is below any hypothetical minAmount but check is null → should still validate
    const response = await GET(
      createMockRequest("/api/coupons/validate", { query: { code: "ANYAMOUNT", amount: "100" } })
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.valid).toBe(true);
  });

  it("skips minAmount check when amount parameter is missing", async () => {
    vi.mocked(prisma.coupon.findUnique).mockResolvedValueOnce(
      buildCoupon({ minAmount: 5000, type: "percent", value: 20 })
    );

    const response = await GET(createMockRequest("/api/coupons/validate", { query: { code: "NOAMOUNT" } }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.valid).toBe(true);
  });
});

describe("GET /api/coupons/validate — discount math", () => {
  it("percent coupon: discountAmount = round(amount * value / 100)", async () => {
    vi.mocked(prisma.coupon.findUnique).mockResolvedValueOnce(
      buildCoupon({ type: "percent", value: 20 })
    );

    const response = await GET(
      createMockRequest("/api/coupons/validate", { query: { code: "PCT20", amount: "4900" } })
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.valid).toBe(true);
    expect(body.discountAmount).toBe(980); // 4900 * 20 / 100
  });

  it("percent coupon: rounds half-even amounts correctly", async () => {
    vi.mocked(prisma.coupon.findUnique).mockResolvedValueOnce(
      buildCoupon({ type: "percent", value: 33 })
    );

    const response = await GET(
      createMockRequest("/api/coupons/validate", { query: { code: "WEIRD", amount: "1000" } })
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.discountAmount).toBe(Math.round(1000 * 33 / 100)); // 330
  });

  it("fixed coupon: discountAmount = coupon.value (cents)", async () => {
    vi.mocked(prisma.coupon.findUnique).mockResolvedValueOnce(
      buildCoupon({ type: "fixed", value: 1000 })
    );

    const response = await GET(
      createMockRequest("/api/coupons/validate", { query: { code: "FLAT10", amount: "4900" } })
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.valid).toBe(true);
    expect(body.discountAmount).toBe(1000);
  });

  it("fixed coupon: works even when amount is missing", async () => {
    vi.mocked(prisma.coupon.findUnique).mockResolvedValueOnce(
      buildCoupon({ type: "fixed", value: 500 })
    );

    const response = await GET(createMockRequest("/api/coupons/validate", { query: { code: "FLAT5" } }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.discountAmount).toBe(500);
  });

  it("percent coupon: discountAmount is 0 when amount is missing", async () => {
    vi.mocked(prisma.coupon.findUnique).mockResolvedValueOnce(
      buildCoupon({ type: "percent", value: 20 })
    );

    const response = await GET(createMockRequest("/api/coupons/validate", { query: { code: "PCTNEEDSAMT" } }));
    expect(response.status).toBe(200);
    const body = await response.json();
    // No amount → percent calculation cannot compute → 0
    expect(body.discountAmount).toBe(0);
  });
});

describe("GET /api/coupons/validate — response shape", () => {
  it("returns valid:true and the full coupon metadata on success", async () => {
    vi.mocked(prisma.coupon.findUnique).mockResolvedValueOnce(
      buildCoupon({
        id: "coupon_xyz",
        code: "FULLMETA",
        type: "percent",
        value: 15,
        description: "Spring promo 15%",
      })
    );

    const response = await GET(
      createMockRequest("/api/coupons/validate", { query: { code: "FULLMETA", amount: "9900" } })
    );
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.valid).toBe(true);
    expect(body.coupon).toMatchObject({
      id: "coupon_xyz",
      code: "FULLMETA",
      type: "percent",
      value: 15,
      description: "Spring promo 15%",
    });
    expect(body.discountAmount).toBe(Math.round(9900 * 15 / 100));
  });

  it("does NOT leak coupon internals (only sanitized surface)", async () => {
    vi.mocked(prisma.coupon.findUnique).mockResolvedValueOnce(
      buildCoupon({
        usedCount: 42,
        isActive: true,
        expiresAt: new Date("2099-12-31"),
      })
    );

    const response = await GET(
      createMockRequest("/api/coupons/validate", { query: { code: "CHECKLEAK", amount: "4900" } })
    );
    const body = await response.json();
    // usedCount and expiresAt are NOT internal-but-handled fields in the response
    expect(body.coupon).toBeDefined();
    expect(body.coupon).not.toHaveProperty("usedCount");
    expect(body.coupon).not.toHaveProperty("expiresAt");
  });
});
