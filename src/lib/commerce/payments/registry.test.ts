import { describe, it, expect, beforeEach, vi } from "vitest";

// ─── Mock the @lemonsqueezy SDK before importing the LS provider ──────
vi.mock("@lemonsqueezy/lemonsqueezy.js", () => ({
  createCheckout: vi.fn(),
  lemonSqueezySetup: vi.fn(),
}));

vi.mock("@/lib/payment/lemonsqueezy", () => ({
  initLS: vi.fn(),
  getStoreId: vi.fn(() => "store-123"),
  getWebhookSecret: vi.fn(() => "whsec_test"),
}));

import { NotImplementedError } from "@/lib/errors";
import { paymentProviderRegistry } from "./registry";
import { lemonSqueezyProvider } from "./providers/lemonsqueezy";
import { legacyStripeProvider } from "./providers/legacy/stripe";
import type { PaymentProvider } from "./types";

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Stub for a generic provider — does NOT satisfy PaymentProvider fully
 * (missing implementation of methods), but registered providers in
 * tests don't need to be functional; only the slugs matter.
 */
function fakeProvider(slug: string): PaymentProvider {
  return {
    slug,
    createCheckout: vi.fn(),
    parseWebhook: vi.fn(),
    retrievePayment: vi.fn(),
  };
}

// ─── Registry tests ────────────────────────────────────────────────

describe("paymentProviderRegistry", () => {
  beforeEach(() => {
    paymentProviderRegistry.__test_only_clearAll();
  });

  it("registers and retrieves by slug", () => {
    const p = fakeProvider("test-only");
    paymentProviderRegistry.register(p);

    expect(paymentProviderRegistry.get("test-only")).toBe(p);
    expect(paymentProviderRegistry.has("test-only")).toBe(true);
  });

  it("throws on duplicate slug registration", () => {
    paymentProviderRegistry.register(fakeProvider("dup"));

    expect(() =>
      paymentProviderRegistry.register(fakeProvider("dup")),
    ).toThrow(/Duplicate registration/i);
  });

  it("throws on get(unknown) with the list of registered slugs", () => {
    paymentProviderRegistry.register(fakeProvider("alpha"));
    paymentProviderRegistry.register(fakeProvider("beta"));

    expect(() => paymentProviderRegistry.get("gamma")).toThrow(
      /No provider registered.*alpha.*beta/i,
    );
  });

  it("has() returns false for missing slugs without throwing", () => {
    expect(paymentProviderRegistry.has("ghost")).toBe(false);
  });

  it("slugs() returns the registered slugs", () => {
    paymentProviderRegistry.register(fakeProvider("a"));
    paymentProviderRegistry.register(fakeProvider("b"));

    expect(paymentProviderRegistry.slugs().sort()).toEqual(["a", "b"]);
  });

  it("__test_only_clearAll resets state", () => {
    paymentProviderRegistry.register(fakeProvider("ephemeral"));
    expect(paymentProviderRegistry.has("ephemeral")).toBe(true);

    paymentProviderRegistry.__test_only_clearAll();
    expect(paymentProviderRegistry.has("ephemeral")).toBe(false);
  });
});

// ─── Stub-method surface ───────────────────────────────────────────
//
// These tests verify the NOT_IMPLEMENTED contracts so that callers
// predicting "Phase 2 / Phase 4 will fill these in" are not surprised
// by runtime crashes mid-transition. Uses NotImplementedError (501),
// `NotImplementedError` è 501 (feature deferred to a future MCR phase),
// distinct from 502 (upstream provider failure) so monitors don't
// conflate "feature not yet built" with "provider upstream down".

describe("payment providers — stub methods (Phase 2/4 follow-up)", () => {
  beforeEach(() => {
    paymentProviderRegistry.__test_only_clearAll();
    paymentProviderRegistry.register(lemonSqueezyProvider);
    paymentProviderRegistry.register(legacyStripeProvider);
  });

  it("lemonsqueezy.parseWebhook throws 501 NOT_IMPLEMENTED_PHASE_2", async () => {
    let caught: unknown;
    try {
      await paymentProviderRegistry.get("lemonsqueezy").parseWebhook({
        provider: "lemonsqueezy",
        deliveryId: "x",
        rawBody: "",
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(NotImplementedError);
    expect((caught as NotImplementedError).code).toBe(
      "NOT_IMPLEMENTED_PHASE_2",
    );
    expect((caught as NotImplementedError).statusCode).toBe(501);
  });

  it("stripe.parseWebhook throws 501 NOT_IMPLEMENTED_PHASE_2", async () => {
    let caught: unknown;
    try {
      await paymentProviderRegistry.get("stripe").parseWebhook({
        provider: "stripe",
        deliveryId: "x",
        rawBody: "",
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(NotImplementedError);
    expect((caught as NotImplementedError).code).toBe(
      "NOT_IMPLEMENTED_PHASE_2",
    );
  });

  it("lemonsqueezy.retrievePayment throws 501 NOT_IMPLEMENTED_PHASE_4", async () => {
    let caught: unknown;
    try {
      await paymentProviderRegistry.get("lemonsqueezy").retrievePayment("ref");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(NotImplementedError);
    expect((caught as NotImplementedError).code).toBe(
      "NOT_IMPLEMENTED_PHASE_4",
    );
  });

  it("stripe.retrievePayment throws 501 NOT_IMPLEMENTED_PHASE_4", async () => {
    let caught: unknown;
    try {
      await paymentProviderRegistry.get("stripe").retrievePayment("ref");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(NotImplementedError);
    expect((caught as NotImplementedError).code).toBe(
      "NOT_IMPLEMENTED_PHASE_4",
    );
  });
});
