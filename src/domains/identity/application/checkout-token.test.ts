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
  deriveCheckoutJti,
  issueCheckoutToken,
  readCheckoutSession,
  registerCheckoutToken,
  verifyCheckoutToken,
} from "./checkout-token";

const SECRET = "checkout-token-test-secret-which-is-at-least-32-chars";
const PRODUCT = { productId: "product-1", productSlug: "course-one" };
const NOW = new Date("2026-08-06T12:00:00.000Z");

function token(now = NOW, jti?: string) {
  return issueCheckoutToken({
    ...PRODUCT,
    provider: "lemonsqueezy",
    providerOrderId: "ls-order-1",
    ...(jti ? { jti } : {}),
    now,
  });
}

beforeEach(() => {
  process.env.CHECKOUT_TOKEN_SECRET = SECRET;
  vi.clearAllMocks();
  mockGetRedis.mockReturnValue(mockRedis);
  mockRedis.get.mockResolvedValue(null);
  mockRedis.set.mockResolvedValue("OK");
  mockSetIfAbsent.mockResolvedValue(true);
});

describe("checkout token signing", () => {
  it("issues a signed token with the expected short lifetime", () => {
    const issued = token();
    const payload = verifyCheckoutToken(issued, NOW);

    expect(payload.productId).toBe(PRODUCT.productId);
    expect(payload.productSlug).toBe(PRODUCT.productSlug);
    expect(payload.providerOrderId).toBe("ls-order-1");
    expect(payload.exp - payload.iat).toBe(CHECKOUT_TOKEN_TTL_SECONDS);
  });

  it("derives the same jti for the same provider order and product", () => {
    expect(deriveCheckoutJti("lemonsqueezy", "ls-order-1", PRODUCT.productId))
      .toBe(deriveCheckoutJti("lemonsqueezy", "ls-order-1", PRODUCT.productId));
    expect(deriveCheckoutJti("lemonsqueezy", "ls-order-1", PRODUCT.productId))
      .not.toBe(deriveCheckoutJti("lemonsqueezy", "ls-order-2", PRODUCT.productId));
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
    expect(() => verifyCheckoutToken(
      issued,
      new Date(NOW.getTime() + (CHECKOUT_TOKEN_TTL_SECONDS + 1) * 1000),
    )).toThrowError(expect.objectContaining({ code: "CHECKOUT_TOKEN_EXPIRED" }));
  });

  it("rejects product and slug mismatch before Redis access", async () => {
    await expect(consumeCheckoutToken(token(), { productId: "other-product" }, NOW))
      .rejects.toThrowError(expect.objectContaining({ code: "CHECKOUT_TOKEN_PRODUCT_MISMATCH" }));
    await expect(consumeCheckoutToken(token(), {
      productId: PRODUCT.productId,
      productSlug: "other-slug",
    }, NOW)).rejects.toThrowError(expect.objectContaining({
      code: "CHECKOUT_TOKEN_PRODUCT_MISMATCH",
    }));
    expect(mockRedis.get).not.toHaveBeenCalled();
    expect(mockSetIfAbsent).not.toHaveBeenCalled();
  });
});

describe("checkout token jti registration and one-time consumption", () => {
  it("registers the jti without consuming the browser exchange", async () => {
    const issued = token();
    const payload = await registerCheckoutToken(issued, PRODUCT, NOW);

    expect(payload.jti).toBeTruthy();
    expect(mockRedis.set).toHaveBeenCalledWith(
      expect.stringContaining(payload.jti),
      issued,
      { nx: true },
    );
    expect(mockSetIfAbsent).not.toHaveBeenCalled();
  });

  it("rejects duplicate registration of the same jti", async () => {
    mockRedis.set.mockResolvedValueOnce(null);
    await expect(registerCheckoutToken(token(), PRODUCT, NOW))
      .rejects.toThrowError(expect.objectContaining({
        code: "CHECKOUT_TOKEN_REPLAYED",
        status: 409,
      }));
  });

  it("consumes a registered token exactly once", async () => {
    const issued = token();
    const payload = verifyCheckoutToken(issued, NOW);
    mockRedis.get.mockResolvedValue(issued);

    await expect(consumeCheckoutToken(issued, PRODUCT, NOW)).resolves.toMatchObject({
      jti: payload.jti,
    });
    expect(mockSetIfAbsent).toHaveBeenCalledWith(
      expect.stringContaining(payload.jti),
      issued,
      CHECKOUT_TOKEN_TTL_SECONDS,
    );

    mockSetIfAbsent.mockResolvedValueOnce(false);
    await expect(consumeCheckoutToken(issued, PRODUCT, NOW))
      .rejects.toThrowError(expect.objectContaining({
        code: "CHECKOUT_TOKEN_REPLAYED",
        status: 409,
      }));
  });

  it("rejects a token registered with a different signed payload", async () => {
    const original = token(NOW, "stable-jti");
    const forged = token(new Date(NOW.getTime() + 1000), "stable-jti");
    mockRedis.get.mockResolvedValue(original);

    await expect(consumeCheckoutToken(forged, PRODUCT, NOW))
      .rejects.toThrowError(expect.objectContaining({ code: "CHECKOUT_TOKEN_REPLAYED" }));
    expect(mockSetIfAbsent).not.toHaveBeenCalled();
  });

  it("reads a registered, product-bound session", async () => {
    const issued = token();
    const payload = verifyCheckoutToken(issued, NOW);
    mockRedis.get.mockResolvedValue(issued);

    await expect(readCheckoutSession(payload.jti, PRODUCT, NOW)).resolves.toMatchObject({
      productId: PRODUCT.productId,
      providerOrderId: "ls-order-1",
    });
  });

  it("rejects an expired registered session", async () => {
    const issued = token();
    const payload = verifyCheckoutToken(issued, NOW);
    mockRedis.get.mockResolvedValue(issued);

    await expect(readCheckoutSession(
      payload.jti,
      PRODUCT,
      new Date(NOW.getTime() + (CHECKOUT_TOKEN_TTL_SECONDS + 1) * 1000),
    )).rejects.toThrowError(expect.objectContaining({ code: "CHECKOUT_TOKEN_EXPIRED" }));
  });

  it("fails closed when Redis is unavailable", async () => {
    mockGetRedis.mockReturnValue(null);
    await expect(registerCheckoutToken(token(), PRODUCT, NOW))
      .rejects.toThrowError(expect.objectContaining({
        code: "CHECKOUT_TOKEN_REDIS_UNAVAILABLE",
        status: 503,
      }));
    await expect(consumeCheckoutToken(token(), PRODUCT, NOW))
      .rejects.toThrowError(expect.objectContaining({
        code: "CHECKOUT_TOKEN_REDIS_UNAVAILABLE",
        status: 503,
      }));
  });

  it("preserves the dedicated error type for mismatched sessions", async () => {
    const issued = token();
    const payload = verifyCheckoutToken(issued, NOW);
    mockRedis.get.mockResolvedValue(issued);

    await expect(readCheckoutSession(payload.jti, { productId: "other-product" }, NOW))
      .rejects.toEqual(new CheckoutTokenError(
        "CHECKOUT_TOKEN_PRODUCT_MISMATCH",
        "Checkout token is bound to a different product",
      ));
  });
});
