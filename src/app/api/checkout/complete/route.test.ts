import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockRequest } from "@/app/api/__test-helpers__/mock-request";

const mockResolveProductReference = vi.fn();
const mockFindCompletedProviderOrder = vi.fn();
const mockIssueCheckoutToken = vi.fn();
const mockRegisterCheckoutToken = vi.fn();
const mockSetCheckoutSessionCookie = vi.fn();

class MockCheckoutTokenError extends Error {
  code: string;
  status: number;

  constructor(code: string, status: number) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

vi.mock("@/domains/identity", () => ({
  CheckoutTokenError: MockCheckoutTokenError,
  resolveProductReference: mockResolveProductReference,
  findCompletedProviderOrder: mockFindCompletedProviderOrder,
  issueCheckoutToken: mockIssueCheckoutToken,
  deriveCheckoutJti: vi.fn((provider: string, orderId: string, productId: string) => `${provider}:${orderId}:${productId}`),
  registerCheckoutToken: mockRegisterCheckoutToken,
  setCheckoutSessionCookie: mockSetCheckoutSessionCookie,
}));

beforeEach(() => {
  vi.resetAllMocks();
  mockResolveProductReference.mockResolvedValue({ id: "product-1", slug: "course-one" });
  mockFindCompletedProviderOrder.mockResolvedValue({ id: "order-internal-1", status: "completed", userId: null });
  mockIssueCheckoutToken.mockReturnValue("signed-token");
  mockRegisterCheckoutToken.mockResolvedValue({ jti: "jti-1" });
});

describe("GET /api/checkout/complete", () => {
  it("requires productSlug and providerOrderId", async () => {
    const { GET } = await import("./route");
    const response = await GET(createMockRequest("/api/checkout/complete"));
    expect(response.status).toBe(400);
    expect(mockResolveProductReference).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown product", async () => {
    mockResolveProductReference.mockResolvedValueOnce(null);
    const { GET } = await import("./route");
    const response = await GET(createMockRequest("/api/checkout/complete", {
      query: { productSlug: "missing", providerOrderId: "ls-1" },
    }));
    expect(response.status).toBe(404);
  });

  it("returns 409 until the verified completed order exists", async () => {
    mockFindCompletedProviderOrder.mockResolvedValue(null);
    const { GET } = await import("./route");
    const response = await GET(createMockRequest("/api/checkout/complete", {
      query: { productSlug: "course-one", providerOrderId: "ls-1" },
    }));
    expect(response.status).toBe(409);
    expect(mockIssueCheckoutToken).not.toHaveBeenCalled();
  });

  it("registers a product-bound token, then redirects with an HttpOnly session", async () => {
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
    expect(mockRegisterCheckoutToken).toHaveBeenCalledWith("signed-token", {
      productId: "product-1",
      productSlug: "course-one",
    });
    expect(mockIssueCheckoutToken).toHaveBeenCalledWith({
      productId: "product-1",
      productSlug: "course-one",
      provider: "lemonsqueezy",
      providerOrderId: "ls-1",
      jti: "lemonsqueezy:ls-1:product-1",
    });
    expect(mockSetCheckoutSessionCookie).toHaveBeenCalledWith(response, "jti-1");
  });

  it("rejects a replayed callback before issuing another token", async () => {
    mockRegisterCheckoutToken.mockRejectedValueOnce(new MockCheckoutTokenError("CHECKOUT_TOKEN_REPLAYED", 409));
    const { GET } = await import("./route");
    const response = await GET(createMockRequest("/api/checkout/complete", {
      query: { productSlug: "course-one", providerOrderId: "ls-1" },
    }));
    expect(response.status).toBe(409);
    expect(mockIssueCheckoutToken).toHaveBeenCalledOnce();
    expect(mockSetCheckoutSessionCookie).not.toHaveBeenCalled();
  });

  it("fails closed when callback jti storage is unavailable", async () => {
    mockRegisterCheckoutToken.mockRejectedValueOnce(new MockCheckoutTokenError("CHECKOUT_TOKEN_REDIS_UNAVAILABLE", 503));
    const { GET } = await import("./route");
    const response = await GET(createMockRequest("/api/checkout/complete", {
      query: { productSlug: "course-one", providerOrderId: "ls-1" },
    }));
    expect(response.status).toBe(503);
    expect(mockIssueCheckoutToken).toHaveBeenCalledOnce();
    expect(mockSetCheckoutSessionCookie).not.toHaveBeenCalled();
  });
});
