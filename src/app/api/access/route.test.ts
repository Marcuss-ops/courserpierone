import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const mockResolveProductReference = vi.fn();
const mockResolveProductAccess = vi.fn();
const mockGetServerUser = vi.fn();
const mockConsumeCheckoutToken = vi.fn();
const mockReadCheckoutSession = vi.fn();
const mockSetCheckoutSessionCookie = vi.fn();

vi.mock("@/domains/identity", () => ({
  resolveProductAccess: mockResolveProductAccess,
  resolveProductReference: mockResolveProductReference,
  CHECKOUT_SESSION_COOKIE: "courssy_checkout_session",
  consumeCheckoutToken: mockConsumeCheckoutToken,
  readCheckoutSession: mockReadCheckoutSession,
  setCheckoutSessionCookie: mockSetCheckoutSessionCookie,
  CheckoutTokenError: class CheckoutTokenError extends Error {
    code = "CHECKOUT_TOKEN_INVALID";
    status = 401;
  },
}));
vi.mock("@/lib/supabase/get-user", () => ({ getServerUser: mockGetServerUser }));
vi.mock("@/lib/utils/rate-limit", () => ({ withRateLimit: <T,>(fn: T) => fn }));

const PRODUCT_ID = "cp-product-1";
const PRODUCT_SLUG = "test-course";
const USER_ID = "cu-user-1";
const PROVIDER_ORDER_ID = "ls-order-1";

function createMockRequest(query: Record<string, string> = {}, sessionId?: string) {
  const url = new URL("http://localhost:3000/api/access");
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  return {
    nextUrl: { searchParams: url.searchParams },
    cookies: { get: vi.fn(() => sessionId ? { name: "courssy_checkout_session", value: sessionId } : undefined) },
  } as unknown as NextRequest;
}

function anonymous() {
  mockGetServerUser.mockResolvedValueOnce({ user: null, dbUser: null });
}

function customer() {
  mockGetServerUser.mockResolvedValueOnce({
    user: { email: "customer@example.com" },
    dbUser: { id: USER_ID, role: "student" },
  });
}

function allow() {
  mockResolveProductAccess.mockResolvedValueOnce({
    hasAccess: true,
    reason: "active_purchase",
    productId: PRODUCT_ID,
  });
}

function deny() {
  mockResolveProductAccess.mockResolvedValueOnce({
    hasAccess: false,
    reason: "not_purchased",
    productId: PRODUCT_ID,
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mockResolveProductReference.mockResolvedValue({ id: PRODUCT_ID, slug: PRODUCT_SLUG });
});

describe("GET /api/access — checkout token contract", () => {
  it("denies when productId is missing without any resolver call", async () => {
    anonymous();
    const { GET } = await import("./route");
    const response = await GET(createMockRequest());
    expect(response.status).toBe(200);
    expect((await response.json()).hasAccess).toBe(false);
    expect(mockResolveProductAccess).not.toHaveBeenCalled();
  });

  it("exchanges a signed checkoutToken once and sets the session cookie", async () => {
    anonymous();
    mockConsumeCheckoutToken.mockResolvedValueOnce({
      jti: "jti-1",
      provider: "lemonsqueezy",
      providerOrderId: PROVIDER_ORDER_ID,
    });
    allow();

    const { GET } = await import("./route");
    const response = await GET(createMockRequest({
      productId: PRODUCT_SLUG,
      checkoutToken: "signed-token",
    }));

    expect(response.status).toBe(200);
    expect((await response.json()).hasAccess).toBe(true);
    expect(mockConsumeCheckoutToken).toHaveBeenCalledWith("signed-token", {
      productId: PRODUCT_ID,
      productSlug: PRODUCT_SLUG,
    });
    expect(mockSetCheckoutSessionCookie).toHaveBeenCalled();
    expect(mockResolveProductAccess).toHaveBeenCalledWith({
      kind: "post_checkout",
      token: "jti-1",
      productId: PRODUCT_ID,
    });
  });

  it("uses the HttpOnly session for subsequent access checks", async () => {
    anonymous();
    mockReadCheckoutSession.mockResolvedValueOnce({
      jti: "jti-1",
      provider: "lemonsqueezy",
      providerOrderId: PROVIDER_ORDER_ID,
    });
    allow();

    const { GET } = await import("./route");
    const response = await GET(createMockRequest({ productId: PRODUCT_SLUG }, "jti-1"));

    expect(response.status).toBe(200);
    expect(mockReadCheckoutSession).toHaveBeenCalledWith("jti-1", {
      productId: PRODUCT_ID,
      productSlug: PRODUCT_SLUG,
    });
    expect(mockResolveProductAccess).toHaveBeenCalledWith({
      kind: "post_checkout",
      token: "jti-1",
      productId: PRODUCT_ID,
    });
  });

  it("ignores public providerOrderId and orderId parameters", async () => {
    anonymous();
    deny();

    const { GET } = await import("./route");
    const response = await GET(createMockRequest({
      productId: PRODUCT_SLUG,
      provider: "lemonsqueezy",
      providerOrderId: PROVIDER_ORDER_ID,
      orderId: "internal-order-1",
    }));

    expect(response.status).toBe(200);
    expect((await response.json()).hasAccess).toBe(false);
    expect(mockReadCheckoutSession).not.toHaveBeenCalled();
    expect(mockResolveProductAccess).not.toHaveBeenCalled();
  });

  it("keeps authenticated session access independent of checkout tokens", async () => {
    customer();
    allow();

    const { GET } = await import("./route");
    const response = await GET(createMockRequest({ productId: PRODUCT_SLUG }));

    expect(response.status).toBe(200);
    expect((await response.json()).userId).toBe(USER_ID);
    expect(mockResolveProductAccess).toHaveBeenCalledWith({
      kind: "authenticated",
      userId: USER_ID,
      productId: PRODUCT_ID,
    });
  });
});
