/**
 * src/lib/commerce/payments/init.ts
 *
 * Single source of truth for payment-provider registration.
 *
 * Importing this module runs the top-level side-effect: every concrete
 * adapter (currently just LemonSqueezy; future PRs add Stripe/PayPal
 * etc.) registers itself with the in-process `paymentProviderRegistry`.
 *
 *   import { paymentProviderRegistry } from "@/lib/commerce/payments/init";
 *   paymentProviderRegistry.get("lemonsqueezy").parseWebhook(...);
 *
 * Why centralization matters
 * ─────────────────────────
 *   1. **One importer, one side-effect**: any module that pulls the
 *      registry (routes, processors, orchestrators) triggers registration
 *      once. Modules that use it WITHOUT importing this file risk an
 *      empty registry (throw on get()).
 *   2. **No business-logic → provider direct import**: business logic
 *      only ever talks to the registry through the abstract
 *      `PaymentProvider` port. Direct `import { lemonSqueezyProvider }`
 *      would couple caller code to the concrete adapter and defeat
 *      the port (Step 7 of the audit).
 *   3. **Tests bypass init** intentionally: they want to control
 *      `__test_only_clearAll()` and re-register stubs. Tests import
 *      from `"@/lib/commerce/payments/registry"` directly so the
 *      registration side-effect doesn't run.
 *
 * Future additions
 * ───────────────
 * When a second provider (e.g. Stripe) is added:
 *   1. Implement `class StripePaymentProvider implements PaymentProvider` in
 *      `src/lib/commerce/payments/providers/stripe/index.ts`.
 *   2. Extend `PaymentProviderSlug` in `types.ts` (currently `"lemonsqueezy"`)
 *      to include `"stripe"`.
 *   3. Add `paymentProviderRegistry.register(new StripePaymentProvider())` here.
 *   4. No changes to consumer code (webhooks/processor, orders/*, etc.) —
 *      they pick the provider via `event.provider` already.
 */

import { paymentProviderRegistry } from "./registry";
import { lemonSqueezyProvider } from "./providers/lemonsqueezy";

// ─── Provider registration (Phase 7 C1a: LS-only new-session MoR) ───────────
paymentProviderRegistry.register(lemonSqueezyProvider);

export { paymentProviderRegistry };
