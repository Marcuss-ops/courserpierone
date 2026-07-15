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
import { PAYMENT_PROVIDER_SLUGS } from "./types";
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
    translateEvent: vi.fn(),
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

  // SSoT lock: extends the array ⇒ extends the derived union (compile-time
  // guarantee); deletes the baseline literal ⇒ this test fails (runtime
  // guarantee). Cheap to maintain, locks both directions of drift.
  it("PAYMENT_PROVIDER_SLUGS contains the baseline provider (SSoT baseline guard)", () => {
    expect(PAYMENT_PROVIDER_SLUGS).toContain("lemonsqueezy");
  });

  // Step 7 typo-guard: a register() call with a slug not in
  // PAYMENT_PROVIDER_SLUGS must WARN (not throw) outside test runtime.
  // Inside test runtime (the OTHER tests above) the guard is silent;
  // here we explicitly simulate production runtime to verify the warn.
  it("warns on unknown-slug register outside test runtime", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubEnv("VITEST", "");
    vi.stubEnv("NODE_ENV", "");
    try {
      paymentProviderRegistry.register(fakeProvider("typo-lmeonsqeezy"));
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("typo-lmeonsqeezy"),
      );
    } finally {
      warnSpy.mockRestore();
      vi.unstubAllEnvs();
    }
  });
});

// ─── Stub-method surface ───────────────────────────────────────────
//
// These tests verify the NOT_IMPLEMENTED contract for the only
// registered provider (Lemon Squeezy) so that callers predicting
// "Phase 2 / Phase 4 will fill these in" are not surprised by runtime
// crashes mid-transition. Uses NotImplementedError (501), which is
// distinct from 502 (upstream provider failure) so monitors don't
// conflate "feature not yet built" with "provider upstream down".
//
// C1a cleanup: only LemonSqueezy is registered for new sessions.

describe("payment providers — stub methods (Phase 2/4 follow-up)", () => {
  beforeEach(() => {
    paymentProviderRegistry.__test_only_clearAll();
    paymentProviderRegistry.register(lemonSqueezyProvider);
  });

  // parseWebhook is now implemented (post-webhook extraction refactor).
  // Full contract coverage lives in:
  //   src/lib/commerce/webhooks/__tests__/provider-lemonsqueezy.test.ts
  // The 5 supported LS events pass through to a normalized PaymentEvent;
  // invalid HMAC / signature-missing throws HmacVerificationError;
  // missing meta.event_name throws WebhookAckError. retrievePayment
  // alone remains a Phase 4 stub.

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
});
