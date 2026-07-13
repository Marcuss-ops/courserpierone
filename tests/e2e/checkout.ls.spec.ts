import { test, expect } from "@playwright/test";
import { prisma, cleanupTestUser } from "./fixtures/db";
import { requireLsEnvVars } from "./fixtures/ls-env-guard";
import {
  createLemonCheckout,
  generateLemonWebhookPayload,
  signLemonWebhookPayload,
} from "./fixtures/ls-helpers";

// Fail-fast no-skip guard: if any required LS env var is missing,
// throw at module-load so Playwright reports a HARD FAILURE (not a
// silent skip). See tests/e2e/fixtures/ls-env-guard.ts for rationale.
requireLsEnvVars();

const TEST_EMAIL = "ls-e2e@example.com";

// (The previous test.skip(!hasLsCreds, ...) pattern is removed —
//  replaced by the requireLsEnvVars() throw at module-load above.
test.beforeEach(async () => {
  await cleanupTestUser(TEST_EMAIL);
});

// Questo test richiede LEMONSQUEEZY_API_KEY, LEMON_VARIANT_ID e
// LEMONSQUEEZY_WEBHOOK_SECRET validi. Per stabilità in CI il webhook viene
// simulato con firma valida invece di attendere il webhook reale.
test.describe("LemonSqueezy purchase flow", () => {
  test("completes checkout and grants access", async ({ page, request }) => {
    const product = await prisma.product.findUnique({
      where: { slug: "test-course-e2e" },
    });

    if (!product?.lemonVariantId) {
      test.skip(true, "TEST_LEMON_VARIANT_ID non configurato");
      return;
    }

    // 1. Crea un checkout reale tramite API LemonSqueezy
    const orderId = `ls-order-${Date.now()}`;
    const customData = {
      courseSlug: product.slug,
      locale: "en-us",
      variantId: product.lemonVariantId,
    };

    const checkout = await createLemonCheckout(product.lemonVariantId, customData);
    expect(checkout?.data?.attributes?.url).toBeTruthy();

    // 2. Simula il webhook order_created con firma valida
    const payload = generateLemonWebhookPayload(orderId, {
      ...customData,
      email: TEST_EMAIL,
    });
    const { signature, body } = signLemonWebhookPayload(payload);

    const webhookResponse = await request.post("/api/webhooks/lemonsqueezy", {
      headers: { "x-signature": signature },
      data: body,
    });

    expect(webhookResponse.status()).toBe(200);

    // 3. Verifica che l'ordine sia stato creato nel database
    await expect.poll(() => prisma.order.count({ where: { user: { email: TEST_EMAIL } } })).toBe(1);

    const order = await prisma.order.findFirst({
      where: { user: { email: TEST_EMAIL } },
      include: { user: true },
    });

    expect(order).toBeTruthy();
    expect(order?.status).toBe("completed");
    expect(order?.paymentProvider).toBe("lemonsqueezy");

    // 4. Verifica accesso alla pagina di download
    await page.goto(`/en-us/test-course-e2e/download`);
    await expect(page.locator("body")).not.toContainText(/buy|purchase|acquista/i);
    await expect(page.locator("body")).toContainText(/download|scarica|access|portal/i);
  });
});
