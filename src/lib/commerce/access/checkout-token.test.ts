import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRedis, mockGetRedis, mockSetIfAbsent } = vi.hoisted(() => ({
  mockRedis: { get: vi.fn(), set: vi.fn() },
  mockGetRedis: vi.fn(),
  mockSetIfAbsent: vi.fn(),
}));

vi.mock("@/lib/redis", () => ({
  getRedis: mockGetRedis,
  setIfAbsent: mockSetIfAbsent,
}));

import {
  CHECKOUT_TOKEN_TTL_SECONDS,
  CheckoutTokenError,
  consumeCheckoutToken,
  issueCheckoutToken,
  readCheckoutSession,
  verifyCheckoutToken,
} from "./checkout-token";

const SECRET = "checkout-token-test-secret-which-is-at-least-32-chars";
const PRODUCT = { productId: "product-1", productSlug: "course-one" };
const NOW = new Date("2026-08-06T12:00:00.000Z");

function token(now = NOW) {
  return issueCheckoutToken({
    ...PRODUCT,
    provider: "lemonsqueezy",
    providerOrderId: "ls-order-1",
    now,
  });
}

beforeEach(() => {
  process.env.CHECKOUT_TOKEN_SECRET = SECRET;
  vi.clearAllMocks();
  mockGetRedis.mockReturnValue(mockRedis);
  mockSetIfAbsent.mockResolvedValue(true);
});

describe("checkout token signing", () => {
  it("issues a token with the expected short lifetime and verifies it", () => {
    const issued = token();
    const payload = verifyCheckoutToken(issued, NOW);

    expect(payload.productId).toBe(PRODUCT.productId);
    expect(payload.productSlug).toBe(PRODUCT.productSlug);
    expect(payload.provider).toBe("lemonsqueezy");
    expect(payload.providerOrderId).toBe("ls-order-1");
    expect(payload.exp - payload.iat).toBe(CHECKOUT_TOKEN_TTL_SECONDS);
  });

  it("rejects a modified signature", () => {
    const issued = token();
    const modified = `${issued.slice(0, -1)}${issued.endsWith("a") ? "b" : "a"}`;
    expect(() => verifyCheckoutToken(modified, NOW)).toThrowError(
      expect.objectContaining({ code: "CHECKOUT_TOKEN_INVALID" }),
    );
  });

  it("rejects an expired token", () => {
    const issued = token();
    expect(() => verifyCheckoutToken(issued, new Date(NOW.getTime() + (CHECKOUT_TOKEN_TTL_SECONDS + 1) * 1000)))
      .toThrowError(expect.objectContaining({ code: "CHECKOUT_TOKEN_EXPIRED" }));
  });

  it("rejects product mismatch before touching Redis", async () => {
    await expect(consumeCheckoutToken(token(), { productId: "other-product" }, NOW))
      .rejects.toThrowError(expect.objectContaining({ code: "CHECKOUT_TOKEN_PRODUCT_MISMATCH" }));
    expect(mockSetIfAbsent).not.toHaveBeenCalled();
  });

  it("requires both product id and slug when both are supplied", async () => {
    await expect(consumeCheckoutToken(token(), {
      productId: PRODUCT.productId,
      productSlug: "other-slug",
    }, NOW)).rejects.toThrowError(expect.objectContaining({
      code: "CHECKOUT_TOKEN_PRODUCT_MISMATCH",
    }));
  });

  it("keeps provider and order binding integrity under a signed payload", () => {
    const payload = verifyCheckoutToken(token(), NOW);
    expect(payload.provider).toBe("lemonsqueezy");
    expect(payload.providerOrderId).toBe("ls-order-1");
  });
});

describe("checkout token atomic consumption", () => {
  it("stores the jti exactly once with NX semantics delegated to Redis", async () => {
    const issued = token();
    const payload = await consumeCheckoutToken(issued, PRODUCT, NOW);

    expect(payload.providerOrderId).toBe("ls-order-1");
    expect(mockSetIfAbsent).toHaveBeenCalledWith(
      expect.stringContaining(payload.jti),
      issued,
      CHECKOUT_TOKEN_TTL_SECONDS,
    );
  });

  it("rejects replay when the atomic SET NX loses the race", async () => {
    mockSetIfAbsent.mockResolvedValue(false);
    await expect(consumeCheckoutToken(token(), PRODUCT, NOW))
      .rejects.toThrowError(expect.objectContaining({
        code: "CHECKOUT_TOKEN_REPLAYED",
        status: 409,
      }));
  });

  it("fails closed when Redis is unavailable", async () => {
    mockGetRedis.mockReturnValue(null);
    await expect(consumeCheckoutToken(token(), PRODUCT, NOW))
      .rejects.toThrowError(expect.objectContaining({
        code: "CHECKOUT_TOKEN_REDIS_UNAVAILABLE",
        status: 503,
      }));
  });

  it("reads a product-bound session without exposing provider ids to the caller", async () => {
    const issued = token();
    const payload = verifyCheckoutToken(issued, NOW);
    mockRedis.get.mockResolvedValue(issued);

    const session = await readCheckoutSession(payload.jti, PRODUCT, NOW);
    expect(session?.productId).toBe(PRODUCT.productId);
    expect(session?.provider).toBe("lemonsqueezy");
  });

  it("does not accept a session for another product", async () => {
    const issued = token();
    const payload = verifyCheckoutToken(issued, NOW);
    mockRedis.get.mockResolvedValue(issued);

    await expect(readCheckoutSession(payload.jti, { productId: "other-product" }, NOW))
      .rejects.toThrowError(new CheckoutTokenError(
        "CHECKOUT_TOKEN_PRODUCT_MISMATCH",
        "Checkout token is bound to a different product",
      ));
  });
});
