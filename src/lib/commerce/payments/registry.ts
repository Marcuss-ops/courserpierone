/**
 * src/lib/commerce/payments/registry.ts
 *
 * Phase 1 of MCR — in-process payment provider registry.
 *
 * The registry is a deliberately-thin `Map<slug, PaymentProvider>`.
 * Providers register themselves on module-load; consumers look them up
 * by slug. There is no async init, no plugin discovery, no DI — it's a
 * plain singleton.
 *
 * Production registration (set in src/lib/services/checkout-service.ts):
 *   - lemonsqueezy  → `LemonSqueezyPaymentProvider` (sole new-session MoR)
 *
 * Tests can use `clearAll()` between cases (the method is marked
 * `__test_only_*` to discourage production use — the call sites in
 * CheckoutService assume a one-time registration at boot).
 */

import type { PaymentProvider, PaymentProviderSlug } from "./types";
import { PAYMENT_PROVIDER_SLUGS } from "./types";

// Step 7 collapser: derive the runtime list from `PAYMENT_PROVIDER_SLUGS`
// so the type alias + the runtime warning stay in sync without manual
// duplication. New provider = 1-line edit on the array in types.ts.
const KNOWN_PROVIDER_SLUGS: readonly PaymentProviderSlug[] = PAYMENT_PROVIDER_SLUGS;

/**
 * Test-runtime detection. `process.env.VITEST` is the canonical vitest
 * marker (always set during vitest runs, regardless of `NODE_ENV` in
 * CI configurations). Falling back to `NODE_ENV === "test"` covers
 * Jest-style runners that don't set VITEST. The two together cover
 * common CI setups; the warning will fire ONLY when an actual
 * production / dev-server register() happens with a typo'd slug.
 */
function isTestRuntime(): boolean {
  return Boolean(process.env.VITEST) || process.env.NODE_ENV === "test";
}

class PaymentProviderRegistry {
  private readonly providers = new Map<string, PaymentProvider>();

  /**
   * Register a provider. Throws on duplicate slug — this is a
   * programmer error (two providers claiming the same namespace),
   * caught loudly at module-load if it ever happens.
   */
  register(provider: PaymentProvider): void {
    if (this.providers.has(provider.slug)) {
      throw new Error(
        `[paymentProviderRegistry] Duplicate registration for slug "${provider.slug}".`,
      );
    }
    // Step 7 lightweight typo-guard: surface unknown-slug warnings at
    // registration-time, not lazily at first `.get()`. A typo'd slug
    // here would 500 on the next webhook call — better to log a one-
    // liner at boot. NOT a throw: adding Stripe later means a one-line
    // addition to `PAYMENT_PROVIDER_SLUGS` in types.ts — both the type
    // union and the runtime list are auto-derived. Test stubs (alpha/
    // beta/test-only slugs in registry.test.ts) are exempted via
    // `isTestRuntime()` so vitest CI runs don't false-positive.
    if (
      !isTestRuntime() &&
      !KNOWN_PROVIDER_SLUGS.includes(provider.slug as PaymentProviderSlug)
    ) {
      console.warn(
        `[paymentProviderRegistry] registering unknown slug "${provider.slug}". ` +
          `Add it to PAYMENT_PROVIDER_SLUGS in src/lib/commerce/payments/types.ts ` +
          `if this is intentional.`,
      );
    }
    this.providers.set(provider.slug, provider);
  }

  /**
   * Retrieve a registered provider by slug. Throws when no provider
   * matches — this is a programmer/registration error, not a runtime
   * condition (production registrations are exhaustive at boot).
   */
  get(slug: string): PaymentProvider {
    const provider = this.providers.get(slug);
    if (!provider) {
      throw new Error(
        `[paymentProviderRegistry] No provider registered for slug "${slug}". ` +
          `Registered: ${[...this.providers.keys()].join(", ") || "(none)"}.`,
      );
    }
    return provider;
  }

  has(slug: string): boolean {
    return this.providers.has(slug);
  }

  slugs(): string[] {
    return [...this.providers.keys()];
  }

  /**
   * Test-only hook. Allows test setup to reset registry state between
   * isolated cases. Production code MUST NOT call this — providers
   * are intended to register exactly once at module-load.
   *
   * Marked with the `__test_only_` prefix by convention (see also
   * `__test_only_*` patterns in src/lib/env.ts and
   * src/lib/utils/rate-limit.ts).
   *
   * NOTE on test isolation: vitest's `vi.mock` does NOT propagate the
   * module-level `paymentProviderRegistry.register(...)` side-effect
   * from `payments/init.ts` into the test file's module graph. Tests
   * that mock `@/lib/commerce/payments/providers/lemonsqueezy` MUST
   * call `__test_only_clearAll()` AND `register(lemonSqueezyProvider)`
   * themselves in `beforeEach` — otherwise `get("lemonsqueezy")` throws.
   * The same pattern applies for any future provider stub registered
   * behind a `vi.mock(...)` factory.
   */
  __test_only_clearAll(): void {
    this.providers.clear();
  }
}

export const paymentProviderRegistry = new PaymentProviderRegistry();
