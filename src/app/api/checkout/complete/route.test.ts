import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockRequest } from "@/app/api/__test-helpers__/mock-request";

const mockProductFindUnique = vi.fn();
const mockOrderFindFirst = vi.fn();
const mockIssueCheckoutToken = vi.fn();
const mockConsumeCheckoutToken = vi.fn();
const mockSetCheckoutSessionCookie = vi.fn();
const mockRedisSet = vi.fn();
const mockGetRedis = vi.fn();

vi.mock("@/lib/redis", () => ({
  getRedis: mockGetRedis,
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    product: { findUnique: mockProductFindUnique },
    order: { findFirst: mockOrderFindFirst },
  },
}));

vi.mock("@/lib/commerce/access/checkout-token", () => ({
  CheckoutTokenError: class CheckoutTokenError extends Error {
    code = "CHECKOUT_TOKEN_INVALID";
    status = 401;
  },
  issueCheckoutToken: mockIssueCheckoutToken,
  consumeCheckoutToken: mockConsumeCheckoutToken,
  setCheckoutSessionCookie: mockSetCheckoutSessionCookie,
}));

beforeEach(() => {
  vi.resetAllMocks();
  mockProductFindUnique.mockResolvedValue({ id: "product-1", slug: "course-one" });
  mockOrderFindFirst.mockResolvedValue({ id: "order-internal-1" });
  mockIssueCheckoutToken.mockReturnValue("signed-token");
  mockConsumeCheckoutToken.mockResolvedValue({ jti: "jti-1" });
  mockGetRedis.mockReturnValue({ set: mockRedisSet });
  mockRedisSet.mockResolvedValue("OK");
});

describe("GET /api/checkout/complete", () => {
  it("requires productSlug and providerOrderId", async () => {
    const { GET } = await import("./route");
    const response = await GET(createMockRequest("/api/checkout/complete"));
    expect(response.status).toBe(400);
    expect(mockProductFindUnique).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown product", async () => {
    mockProductFindUnique.mockResolvedValueOnce(null);
    const { GET } = await import("./route");
    const response = await GET(createMockRequest("/api/checkout/complete", {
      query: { productSlug: "missing", providerOrderId: "ls-1" },
    }));
    expect(response.status).toBe(404);
  });

  it("returns 409 until the verified completed order exists", async () => {
    mockOrderFindFirst.mockResolvedValue(null);
    const { GET } = await import("./route");
    const response = await GET(createMockRequest("/api/checkout/complete", {
      query: { productSlug: "course-one", providerOrderId: "ls-1" },
    }));
    expect(response.status).toBe(409);
    expect(mockIssueCheckoutToken).not.toHaveBeenCalled();
  });

  it("issues and atomically consumes a product-bound token, then redirects with an HttpOnly session", async () => {
    const { GET } = await import("./route");
    const response = await GET(createMockRequest("/api/checkout/complete", {
      query: {
        lang: "en-us",
        productSlug: "course-one",
        providerOrderId: "ls-1",
      },
    }));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/en-us/course-one/download?lang=en-us",
    );
    expect(mockRedisSet).toHaveBeenCalledWith(
      "checkout-callback:lemonsqueezy:product-1:ls-1",
      "1",
      { ex: 600, nx: true },
    );
    expect(mockIssueCheckoutToken).toHaveBeenCalledWith({
      productId: "product-1",
      productSlug: "course-one",
      provider: "lemonsqueezy",
      providerOrderId: "ls-1",
    });
    expect(mockConsumeCheckoutToken).toHaveBeenCalledWith("signed-token", {
      productId: "product-1",
      productSlug: "course-one",
    });
    expect(mockSetCheckoutSessionCookie).toHaveBeenCalledWith(response, "jti-1");
  });

  it("rejects a replayed callback before issuing another token", async () => {
    mockRedisSet.mockResolvedValueOnce(null);
    const { GET } = await import("./route");
    const response = await GET(createMockRequest("/api/checkout/complete", {
      query: { productSlug: "course-one", providerOrderId: "ls-1" },
    }));
    expect(response.status).toBe(409);
    expect(mockIssueCheckoutToken).not.toHaveBeenCalled();
  });

  it("fails closed when callback replay storage is unavailable", async () => {
    mockGetRedis.mockReturnValue(null);
    const { GET } = await import("./route");
    const response = await GET(createMockRequest("/api/checkout/complete", {
      query: { productSlug: "course-one", providerOrderId: "ls-1" },
    }));
    expect(response.status).toBe(503);
    expect(mockIssueCheckoutToken).not.toHaveBeenCalled();
  });
});
