import { test, expect } from "@playwright/test";
import { prisma, cleanupTestUser } from "./fixtures/db";
import {
  stripe,
  createStripeCheckoutSession,
  generateStripeWebhookPayload,
  signStripeWebhookPayload,
} from "./fixtures/stripe-helpers";

const TEST_EMAIL = "stripe-e2e@example.com";

const hasStripeCreds =
  !!process.env.STRIPE_SECRET_KEY &&
  !!process.env.STRIPE_WEBHOOK_SECRET &&
  !!process.env.TEST_STRIPE_PRICE_ID;

test.skip(!hasStripeCreds, "Stripe test credentials not configured");

test.beforeEach(async () => {
  await cleanupTestUser(TEST_EMAIL);
});

// Questo test richiede STRIPE_SECRET_KEY e STRIPE_WEBHOOK_SECRET validi.
// Per stabilità in CI il webhook viene simulato con firma valida invece di
// attendere il webhook reale da Stripe.
test.describe("Stripe purchase flow", () => {
  test("completes checkout and grants access", async ({ page, request }) => {
    const product = await prisma.product.findUnique({
      where: { slug: "test-course-e2e" },
    });

    if (!product?.stripePriceId) {
      test.skip(true, "TEST_STRIPE_PRICE_ID non configurato");
      return;
    }

    // 1. Crea una sessione di checkout reale tramite API Stripe
    const session = await createStripeCheckoutSession(product.stripePriceId, {
      userId: "guest",
      productId: product.id,
      locale: "en-us",
      customer_country: "US",
      email: TEST_EMAIL,
    });

    expect(session.url).toBeTruthy();

    // 2. Simula il webhook checkout.session.completed con firma valida
    const payload = generateStripeWebhookPayload(session);
    const { signature, body } = signStripeWebhookPayload(payload);

    const webhookResponse = await request.post("/api/webhooks/stripe", {
      headers: { "stripe-signature": signature },
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
    expect(order?.paymentProvider).toBe("stripe");

    // 4. Verifica accesso alla pagina di download
    await page.goto(`/en-us/test-course-e2e/download`);
    await expect(page.locator("body")).not.toContainText(/buy|purchase|acquista/i);
    await expect(page.locator("body")).toContainText(/download|scarica|access|portal/i);
  });
});
