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
 *   - lemonsqueezy  → `LemonSqueezyPaymentProvider` (primary MoR)
 *   - stripe        → `LegacyStripePaymentProvider` (gated, fallback)
 *
 * Tests can use `clearAll()` between cases (the method is marked
 * `__test_only_*` to discourage production use — the call sites in
 * CheckoutService assume a one-time registration at boot).
 */

import type { PaymentProvider } from "./types";

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
   */
  __test_only_clearAll(): void {
    this.providers.clear();
  }
}

export const paymentProviderRegistry = new PaymentProviderRegistry();
