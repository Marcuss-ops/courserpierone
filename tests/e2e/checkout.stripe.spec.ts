import { test, expect } from "@playwright/test";
import type Stripe from "stripe";
import { prisma, cleanupTestUser } from "./fixtures/db";
import {
  generateStripeWebhookPayload,
  signStripeWebhookPayload,
} from "./fixtures/stripe-helpers";

/**
 * tests/e2e/checkout.stripe.spec.ts — legacy Stripe webhook regression
 *
 * V1.5 LS-primary mandate: this file is NOT a Stripe checkout test.
 * It is a regression safety-net for the legacy Stripe webhook handler
 * (`src/app/api/webhooks/stripe/route.ts`) which remains in production
 * for backward compatibility with historical Stripe purchases. The
 * primary customer journey now uses LemonSqueezy (see
 * checkout.ls.spec.ts and journey.spec.ts).
 *
 * Scope discipline:
 *   - NO real Stripe Checkout session is created in this test
 *     (createStripeCheckoutSession is intentionally NOT called — the
 *     prod-side provider's createCheckout is rejected if
 *     ENABLE_STRIPE_CHECKOUT !== "true" since Phase 7).
 *   - The test synthesizes a minimal Stripe.Checkout.Session-shaped
 *     object in-memory, then runs generateStripeWebhookPayload +
 *     signStripeWebhookPayload + a POST to the legacy handler. This
 *     exercises the verified-signature path only — no Stripe API
 *     dependency, only STRIPE_WEBHOOK_SECRET for HMAC signing.
 *
 * Activation:
 *   - Gated by ENABLE_STRIPE_CHECKOUT (legacy activation signal). When
 *     the flag is off, this file is skipped — aligning with the
 *     V1.5 mandate that LS is the primary provider and the legacy
 *     Stripe path is opt-in.
 */

const TEST_EMAIL = "stripe-legacy-e2e@example.com";

// V1.5+: only the legacy webhook handler is exercised here,
// not new-session creation. ENABLE_STRIPE_CHECKOUT was REMOVED
// from env.ts in C1b cleanup — the legacy webhook is now active
// whenever STRIPE_WEBHOOK_SECRET is configured (default for V1.x
// during the drain window). The single `test.skip` below is the
// only gate, ensuring the legacy webhook logic is actually tested
// in CI when creds are present.
test.skip(!process.env.STRIPE_WEBHOOK_SECRET, "STRIPE_WEBHOOK_SECRET not configured");

test.beforeEach(async () => {
  await cleanupTestUser(TEST_EMAIL);
});

test.describe("Stripe legacy webhook regression (V1.5 LS-primary)", () => {
  test("signed checkout.session.completed webhook creates Order + grants access", async ({
    page,
    request,
  }) => {
    const product = await prisma.product.findUnique({
      where: { slug: "test-course-e2e" },
    });

    if (!product?.id) {
      test.skip(
        true,
        "test product not seeded (run a test that calls seedTestProduct first, or seed via global.setup)"
      );
      return;
    }

    // 1. Synthesize a minimal Stripe.Checkout.Session in-memory.
    //
    // We DO NOT call createStripeCheckoutSession here: the V1.5 prod-side
    // provider rejects new-session creation when ENABLE_STRIPE_CHECKOUT
    // is unset, so creating a real session from this test would either
    // 401/403 against the legacy provider OR fail the LS-primary mandate
    // by depending on prod-side Stripe. Instead, we hand-craft the
    // minimal session-shape that the legacy handler reads (id +
    // metadata + customer_email + amount_total).
    const syntheticSession = {
      id: `cs_test_synth_${Date.now()}`,
      object: "checkout.session",
      amount_total: 4900,
      currency: "eur",
      customer_email: TEST_EMAIL,
      payment_status: "paid",
      status: "complete",
      metadata: {
        userId: "guest",
        productId: product.id,
        locale: "en-us",
        customer_country: "US",
        email: TEST_EMAIL,
      },
    } as unknown as Stripe.Checkout.Session;

    // 2. Build + sign the legacy Stripe webhook event with HMAC scheme
    //    (t=<unix_ts>,v1=<hmac_sha256(timestamp.body)>).
    const event = generateStripeWebhookPayload(syntheticSession);
    const { signature, body } = signStripeWebhookPayload(event);

    // 3. POST the signed payload to the legacy handler. The handler
    //    verifies the signature against STRIPE_WEBHOOK_SECRET and
    //    dual-writes User + Order + (legacy) AccessGrant on match.
    const webhookResponse = await request.post("/api/webhooks/stripe", {
      headers: { "stripe-signature": signature },
      data: body,
    });

    expect(webhookResponse.status()).toBe(200);

    // 4. Verify Order row was created in the database, with the legacy
    //    Stripe metadata surfaced.
    await expect
      .poll(
        () => prisma.order.count({ where: { user: { email: TEST_EMAIL } } }),
        { timeout: 10_000 }
      )
      .toBe(1);

    const order = await prisma.order.findFirst({
      where: { user: { email: TEST_EMAIL } },
      include: { user: true },
    });

    expect(order).toBeTruthy();
    expect(order?.status).toBe("completed");
    expect(order?.paymentProvider).toBe("stripe");
    expect(order?.providerOrderId).toBe(syntheticSession.id);

    // 5. Verify access to the (LS/LS-or-Stripe-agnostic) download page.
    //    The legacy path still routes through the same AccessGate, so
    //    a completed Order (regardless of paymentProvider) grants access.
    await page.goto(`/en-us/test-course-e2e/download`);
    await expect(page.locator("body")).not.toContainText(/buy|purchase|acquista/i);
    await expect(page.locator("body")).toContainText(/download|scarica|access|portal/i);
  });
});
