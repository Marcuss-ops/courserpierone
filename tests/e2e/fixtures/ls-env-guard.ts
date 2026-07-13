/**
 * tests/e2e/fixtures/ls-env-guard.ts
 *
 * Fail-fast no-skip guard for the Lemon Squeezy E2E test env vars.
 *
 * The previous pattern was:
 *
 *   const hasLsCreds = !!process.env.LEMONSQUEEZY_API_KEY && ...;
 *   test.skip(!hasLsCreds, "LS test credentials not configured");
 *
 * That silently let CI pass without exercising the LS code path —
 * exactly the "test skipped" failure mode that masks regressions in
 * the payment-webhook handler (the canonical example being the
 * `payload.meta.custom_data` path fix at commit c362ad7 — which would
 * have been silently skipped under the old pattern).
 *
 * This guard throws at module-load time. Playwright's worker catches
 * the error, marks ALL tests in the file as failed, and reports a
 * non-zero exit code. The error message is actionable: it lists the
 * exact missing env vars + points at the docs.
 *
 * Usage (at the top of any LS-touching spec file, AFTER all imports):
 *
 *   import { requireLsEnvVars } from "./fixtures/ls-env-guard";
 *   requireLsEnvVars();
 *
 * The guard is idempotent + side-effect-free beyond the throw.
 */

export const REQUIRED_LS_ENV_VARS = [
  "LEMONSQUEEZY_API_KEY",
  "LEMONSQUEEZY_WEBHOOK_SECRET",
  "LEMONSQUEEZY_STORE_ID",
  "TEST_LEMON_VARIANT_ID",
] as const;

/**
 * Throws if any required LS env var is missing.
 *
 * @throws {Error} with a multi-line message listing the missing vars
 *   + a pointer to docs/ops/staging-bootstrap.md §3.1 (LS test-mode
 *   credentials) + a clear statement that the test will NOT be skipped.
 */
export function requireLsEnvVars(): void {
  const missing = REQUIRED_LS_ENV_VARS.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(
      `❌ Missing required Lemon Squeezy env vars: ${missing.join(", ")}\n` +
        `   The LS E2E tests require these env vars to run. They will NOT be skipped.\n` +
        `   Set them in your shell or CI.\n` +
        `   See docs/ops/staging-bootstrap.md §3.1 (LS test mode setup) for how to obtain test credentials.\n` +
        `   Once set, re-run: npx playwright test tests/e2e/${"<spec-name>"}.spec.ts`
    );
  }
}
