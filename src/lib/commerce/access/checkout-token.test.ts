import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CHECKOUT_TOKEN_TTL_SECONDS, issueCheckoutToken, verifyCheckoutToken } from "@/domains/identity";

const originalCheckoutTokenSecret = process.env.CHECKOUT_TOKEN_SECRET;

beforeEach(() => {
  process.env.CHECKOUT_TOKEN_SECRET = "checkout-token-test-secret-which-is-at-least-32-chars";
});

afterEach(() => {
  if (originalCheckoutTokenSecret === undefined) {
    delete process.env.CHECKOUT_TOKEN_SECRET;
  } else {
    process.env.CHECKOUT_TOKEN_SECRET = originalCheckoutTokenSecret;
  }
});

const NOW = new Date("2026-08-06T12:00:00.000Z");

describe("legacy checkout-token compatibility shim", () => {
  it("re-exports the canonical Identity token contract", () => {
    const token = issueCheckoutToken({
      productId: "product-1",
      productSlug: "course-one",
      provider: "lemonsqueezy",
      providerOrderId: "order-1",
      now: NOW,
    });
    const payload = verifyCheckoutToken(token, NOW);

    expect(payload.productId).toBe("product-1");
    expect(payload.exp - payload.iat).toBe(CHECKOUT_TOKEN_TTL_SECONDS);
  });
});
