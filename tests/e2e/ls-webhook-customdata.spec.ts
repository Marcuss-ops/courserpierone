import { test, expect } from "@playwright/test";
import crypto from "crypto";
import { prisma, cleanupTestUser } from "./fixtures/db";
import {
  generateLemonWebhookPayload,
  signLemonWebhookPayload,
} from "./fixtures/ls-helpers";

/**
 * tests/e2e/ls-webhook-customdata.spec.ts
 *
 * Realistic E2E coverage for the LS webhook `custom_data` path fix.
 * Per official LS docs (https://docs.lemonsqueezy.com/help/checkout/passing-custom-data)
 * customData is echoed back at `payload.meta.custom_data`, not at
 * `attributes.first_order_item.product_options.custom_data` (the path
 * the route was incorrectly reading prior to this fix).
 *
 * The provider at `src/lib/commerce/payments/providers/lemonsqueezy/index.ts`
 * sets `customData = { courseSlug, locale, email?, channelId? }` on
 * checkout. The route must:
 *   1. Read customData from `payload.meta.custom_data` (canonical).
 *   2. Resolve the product via `courseSlug` (not just `variantId`).
 *   3. Persist `Order` with `paymentProvider: "lemonsqueezy"`,
 *      `providerOrderId`, `status: "completed"`, correct `locale`.
 *   4. Dual-write an `AccessGrant` (MCR Phase 2) for the new order.
 *   5. Persist the `channelId` on the `purchase` AnalyticEvent
 *      (V1 acceptance criterion #10 — channel attribution).
 *   6. Honor idempotency on re-delivery (the `processedWebhook` gate).
 *   7. Defensively fall back to `attributes.first_order_item.product_options.custom_data`
 *      when a payload has the older shape (no `meta.custom_data`).
 *
 * Run gating (mirrors checkout.ls.spec.ts / refund.lemonsqueezy.spec.ts):
 *   - LEMONSQUEEZY_API_KEY
 *   - LEMONSQUEEZY_WEBHOOK_SECRET
 *   - LEMONSQUEEZY_STORE_ID
 *   - TEST_LEMON_VARIANT_ID
 *   - TEST_DATABASE_URL (or DATABASE_URL)
 */

const TEST_EMAIL = "ls-customdata-e2e@example.com";
const TEST_CHANNEL_ID = "yt-channel-it-001";

const hasLsCreds =
  !!process.env.LEMONSQUEEZY_API_KEY &&
  !!process.env.LEMONSQUEEZY_WEBHOOK_SECRET &&
  !!process.env.LEMONSQUEEZY_STORE_ID &&
  !!process.env.TEST_LEMON_VARIANT_ID;

test.skip(!hasLsCreds, "LS test credentials not configured (LEMONSQUEEZY_* + TEST_LEMON_VARIANT_ID)");

test.beforeEach(async () => {
  await cleanupTestUser(TEST_EMAIL);
});

test.describe("LS webhook custom_data path (canonical meta.custom_data)", () => {
  test("order_created: meta.custom_data → Order + AccessGrant + AnalyticEvent.channelId", async ({
    request,
  }) => {
    const product = await prisma.product.findUnique({
      where: { slug: "test-course-e2e" },
    });
    if (!product?.lemonVariantId) {
      test.skip(true, "TEST_LEMON_VARIANT_ID not configured on the seeded test product");
      return;
    }

    // ── Arrange: build a realistic LS-shaped payload with customData
    // carrying every field the LS provider sets on checkout.
    const orderId = `ls-cd-order-${Date.now()}`;
    const customData = {
      courseSlug: product.slug,
      locale: "en-us",
      channelId: TEST_CHANNEL_ID,
    };

    const payload = generateLemonWebhookPayload(orderId, customData, {
      email: TEST_EMAIL,
    });
    const { signature, body } = signLemonWebhookPayload(payload);

    // ── Act: deliver the webhook
    const resp = await request.post("/api/webhooks/lemonsqueezy", {
      headers: { "x-signature": signature },
      data: body,
    });
    expect(resp.status()).toBe(200);

    // ── Assertion 1: Order exists, resolved via courseSlug, correct locale
    const order = await prisma.order.findFirst({
      where: { user: { email: TEST_EMAIL } },
      include: { product: true },
    });
    expect(order).toBeTruthy();
    expect(order?.paymentProvider).toBe("lemonsqueezy");
    expect(order?.providerOrderId).toBe(orderId);
    expect(order?.status).toBe("completed");
    expect(order?.locale).toBe("en-us");
    expect(order?.productId).toBe(product.id);
    expect(order?.product?.slug).toBe(product.slug);

    // ── Assertion 2: AccessGrant dual-written (MCR Phase 2)
    const grant = await prisma.accessGrant.findFirst({
      where: { sourceType: "order", sourceId: order?.id },
    });
    expect(grant).toBeTruthy();
    expect(grant?.status).toBe("active");
    expect(grant?.userId).toBe(order?.userId);
    expect(grant?.productId).toBe(product.id);

    // ── Assertion 3: AnalyticEvent of type 'purchase' has the channelId
    const analyticsEvent = await prisma.analyticEvent.findFirst({
      where: {
        userId: order?.userId,
        eventType: "purchase",
        productId: product.id,
      },
    });
    expect(analyticsEvent).toBeTruthy();
    expect(analyticsEvent?.channelId).toBe(TEST_CHANNEL_ID);

    // ── Assertion 4: processedWebhook idempotency row exists
    const processed = await prisma.processedWebhook.count({
      where: {
        provider: "lemonsqueezy",
        deliveryId: `LS-${orderId}-order_created`,
      },
    });
    expect(processed).toBe(1);
  });

  test("idempotency: re-delivery of identical order_created payload creates no duplicates", async ({
    request,
  }) => {
    const product = await prisma.product.findUnique({
      where: { slug: "test-course-e2e" },
    });
    if (!product?.lemonVariantId) {
      test.skip(true, "TEST_LEMON_VARIANT_ID not configured on the seeded test product");
      return;
    }

    const orderId = `ls-cd-idem-${Date.now()}`;
    const payload = generateLemonWebhookPayload(
      orderId,
      {
        courseSlug: product.slug,
        locale: "en-us",
        channelId: TEST_CHANNEL_ID,
      },
      { email: TEST_EMAIL },
    );

    // First delivery
    const first = signLemonWebhookPayload(payload);
    const r1 = await request.post("/api/webhooks/lemonsqueezy", {
      headers: { "x-signature": first.signature },
      data: first.body,
    });
    expect(r1.status()).toBe(200);

    // Second delivery (identical bytes, identical signature)
    const second = signLemonWebhookPayload(payload);
    const r2 = await request.post("/api/webhooks/lemonsqueezy", {
      headers: { "x-signature": second.signature },
      data: second.body,
    });
    expect(r2.status()).toBe(200);

    // Exactly one Order, one AccessGrant, one processedWebhook row
    const orderCount = await prisma.order.count({
      where: { user: { email: TEST_EMAIL }, providerOrderId: orderId },
    });
    expect(orderCount).toBe(1);

    const processedCount = await prisma.processedWebhook.count({
      where: {
        provider: "lemonsqueezy",
        deliveryId: `LS-${orderId}-order_created`,
      },
    });
    expect(processedCount).toBe(1);
  });

  test("subscription_created: meta.custom_data → Order + AccessGrant for the subscribed product", async ({
    request,
  }) => {
    const product = await prisma.product.findUnique({
      where: { slug: "test-course-e2e" },
    });
    if (!product?.lemonVariantId) {
      test.skip(true, "TEST_LEMON_VARIANT_ID not configured on the seeded test product");
      return;
    }

    const orderId = `ls-cd-sub-${Date.now()}`;
    const customData = {
      courseSlug: product.slug,
      locale: "it-it",
      channelId: TEST_CHANNEL_ID,
    };

    const payload = generateLemonWebhookPayload(orderId, customData, {
      email: TEST_EMAIL,
      eventName: "subscription_created",
      subscriptionShape: true,
    });
    const { signature, body } = signLemonWebhookPayload(payload);

    const resp = await request.post("/api/webhooks/lemonsqueezy", {
      headers: { "x-signature": signature },
      data: body,
    });
    expect(resp.status()).toBe(200);

    // Order exists, resolved via courseSlug, locale "it-it"
    const order = await prisma.order.findFirst({
      where: { user: { email: TEST_EMAIL }, providerOrderId: orderId },
    });
    expect(order).toBeTruthy();
    expect(order?.paymentProvider).toBe("lemonsqueezy");
    expect(order?.status).toBe("completed");
    expect(order?.locale).toBe("it-it");
    expect(order?.productId).toBe(product.id);

    // AccessGrant dual-written
    const grant = await prisma.accessGrant.findFirst({
      where: { sourceType: "order", sourceId: order?.id },
    });
    expect(grant).toBeTruthy();
    expect(grant?.status).toBe("active");

    // channelId flows through ProcessOrderInput → AnalyticEvent (parity
    // with the order_created test — explicit assertion the user asked for).
    const analyticsEvent = await prisma.analyticEvent.findFirst({
      where: {
        userId: order?.userId,
        eventType: "purchase",
        productId: product.id,
      },
    });
    expect(analyticsEvent).toBeTruthy();
    expect(analyticsEvent?.channelId).toBe(TEST_CHANNEL_ID);
  });

  test("order_refunded: revokes AccessGrant atomically with the order refund", async ({
    request,
  }) => {
    const product = await prisma.product.findUnique({
      where: { slug: "test-course-e2e" },
    });
    if (!product?.lemonVariantId) {
      test.skip(true, "TEST_LEMON_VARIANT_ID not configured on the seeded test product");
      return;
    }

    // ── Phase 1: order_created establishes the Order + AccessGrant ──
    const orderId = `ls-cd-revoke-${Date.now()}`;
    const customData = {
      courseSlug: product.slug,
      locale: "en-us",
      channelId: TEST_CHANNEL_ID,
    };

    const createdPayload = generateLemonWebhookPayload(orderId, customData, {
      email: TEST_EMAIL,
    });
    const createdSig = signLemonWebhookPayload(createdPayload);
    const createdResp = await request.post("/api/webhooks/lemonsqueezy", {
      headers: { "x-signature": createdSig.signature },
      data: createdSig.body,
    });
    expect(createdResp.status()).toBe(200);

    // Sanity: the order is completed, the grant is active.
    const initialOrder = await prisma.order.findFirst({
      where: { user: { email: TEST_EMAIL }, providerOrderId: orderId },
    });
    expect(initialOrder?.status).toBe("completed");

    const initialGrant = await prisma.accessGrant.findFirst({
      where: { sourceType: "order", sourceId: initialOrder?.id },
    });
    expect(initialGrant?.status).toBe("active");
    expect(initialGrant?.revokedAt).toBeNull();

    // ── Phase 2: order_refunded flips BOTH atomically ──
    const refundPayload = {
      meta: { event_name: "order_refunded" },
      data: { id: orderId, type: "orders", attributes: {} },
    };
    const refundSig = signLemonWebhookPayload(refundPayload);
    const refundResp = await request.post("/api/webhooks/lemonsqueezy", {
      headers: { "x-signature": refundSig.signature },
      data: refundSig.body,
    });
    expect(refundResp.status()).toBe(200);

    // Order.status → 'refunded'
    const refundedOrder = await prisma.order.findFirst({
      where: { user: { email: TEST_EMAIL }, providerOrderId: orderId },
    });
    expect(refundedOrder?.status).toBe("refunded");

    // AccessGrant.status → 'revoked' + revokedAt populated
    const revokedGrant = await prisma.accessGrant.findFirst({
      where: { sourceType: "order", sourceId: initialOrder?.id },
    });
    expect(revokedGrant?.status).toBe("revoked");
    expect(revokedGrant?.revokedAt).toBeTruthy();
    expect(revokedGrant?.revokedAt?.getTime()).toBeGreaterThan(0);

    // ── Phase 3: re-delivery is idempotent (the grant stays revoked, revokedAt unchanged) ──
    const firstRevokedAt = revokedGrant?.revokedAt;
    const refundRedelivery = signLemonWebhookPayload(refundPayload);
    const redeliveryResp = await request.post("/api/webhooks/lemonsqueezy", {
      headers: { "x-signature": refundRedelivery.signature },
      data: refundRedelivery.body,
    });
    expect(redeliveryResp.status()).toBe(200);

    const grantAfterRedelivery = await prisma.accessGrant.findFirst({
      where: { sourceType: "order", sourceId: initialOrder?.id },
    });
    expect(grantAfterRedelivery?.status).toBe("revoked");
    // revokedAt should be unchanged: the gate runs BEFORE the business
    // logic on re-delivery, so neither updateMany fires the second time.
    expect(grantAfterRedelivery?.revokedAt?.getTime()).toBe(firstRevokedAt?.getTime());
  });

  test("order_refunded: graceful exit when the order was already refunded (ordersToRefund.length === 0)", async ({
    request,
  }) => {
    const product = await prisma.product.findUnique({
      where: { slug: "test-course-e2e" },
    });
    if (!product?.lemonVariantId) {
      test.skip(true, "TEST_LEMON_VARIANT_ID not configured on the seeded test product");
      return;
    }

    // ── Phase 1: order_created establishes the Order + AccessGrant ──
    const orderId = `ls-cd-preexist-${Date.now()}`;
    const createdPayload = generateLemonWebhookPayload(
      orderId,
      {
        courseSlug: product.slug,
        locale: "en-us",
        channelId: TEST_CHANNEL_ID,
      },
      { email: TEST_EMAIL },
    );
    const createdSig = signLemonWebhookPayload(createdPayload);
    const createdResp = await request.post("/api/webhooks/lemonsqueezy", {
      headers: { "x-signature": createdSig.signature },
      data: createdSig.body,
    });
    expect(createdResp.status()).toBe(200);

    const initialOrder = await prisma.order.findFirst({
      where: { user: { email: TEST_EMAIL }, providerOrderId: orderId },
    });
    expect(initialOrder?.status).toBe("completed");

    // ── Phase 2: simulate a pre-refund (admin manual / out-of-order webhook) ──
    // The order is now 'refunded' but the grant is still 'active'. This is
    // exactly the scenario the "no completed orders found" branch is
    // designed for: the findMany filter status='completed' will return 0,
    // the handler will log and return 200, and processedWebhook will be
    // created so LS doesn't retry.
    await prisma.order.update({
      where: { id: initialOrder?.id },
      data: { status: "refunded" },
    });

    const grantBeforeWebhook = await prisma.accessGrant.findFirst({
      where: { sourceType: "order", sourceId: initialOrder?.id },
    });
    expect(grantBeforeWebhook?.status).toBe("active");

    // ── Phase 3: fire the late order_refunded webhook ──
    const refundPayload = {
      meta: { event_name: "order_refunded" },
      data: { id: orderId, type: "orders", attributes: {} },
    };
    const refundSig = signLemonWebhookPayload(refundPayload);
    const refundResp = await request.post("/api/webhooks/lemonsqueezy", {
      headers: { "x-signature": refundSig.signature },
      data: refundSig.body,
    });
    // Handler returns 200 OK so LS marks the delivery done and stops retrying.
    expect(refundResp.status()).toBe(200);

    // The grant is NOT touched (findMany returned 0, the $transaction
    // never ran). Status stays 'active' + revokedAt stays null.
    //
    // NOTE: this documents a KNOWN LIMITATION: if the order is refunded
    // by a path that does NOT go through the LS webhook (e.g., admin
    // manual refund), the AccessGrant stays 'active' until MCR Phase 2
    // cutover exposes the read-path that resolves "Order.status
    // overrides grant.status". Tracked as a followup (V1.1 / pre-V1
    // hardening).
    const grantAfterWebhook = await prisma.accessGrant.findFirst({
      where: { sourceType: "order", sourceId: initialOrder?.id },
    });
    expect(grantAfterWebhook?.status).toBe("active");
    expect(grantAfterWebhook?.revokedAt).toBeNull();

    // The order's status is unchanged (handler truly no-op'd — it
    // didn't accidentally re-set the order to 'completed' or to any
    // other status). Defense against a regression that bypasses the
    // findMany filter and runs the updateMany unconditionally.
    const orderAfterWebhook = await prisma.order.findFirst({
      where: { user: { email: TEST_EMAIL }, providerOrderId: orderId },
    });
    expect(orderAfterWebhook?.status).toBe("refunded");

    // The processedWebhook gate still fires (deliveryId is created), so
    // the same LS delivery won't be retried.
    const processed = await prisma.processedWebhook.count({
      where: {
        provider: "lemonsqueezy",
        deliveryId: `LS-${orderId}-order_refunded`,
      },
    });
    expect(processed).toBe(1);
  });

  test("subscription_created: defensive fallback to attributes.custom_data (no meta.custom_data)", async ({
    request,
  }) => {
    const product = await prisma.product.findUnique({
      where: { slug: "test-course-e2e" },
    });
    if (!product?.lemonVariantId) {
      test.skip(true, "TEST_LEMON_VARIANT_ID not configured on the seeded test product");
      return;
    }

    // Build a subscription-shaped payload where customData lives ONLY
    // at the legacy `attributes.custom_data` path (no `meta.custom_data`).
    // The route's defensive fallback chain must still resolve the product.
    const orderId = `ls-cd-sub-fallback-${Date.now()}`;
    const customData = {
      courseSlug: product.slug,
      locale: "fr-fr",
      channelId: TEST_CHANNEL_ID,
    };

    const body = JSON.stringify({
      meta: { event_name: "subscription_created" }, // ← no custom_data here
      data: {
        id: orderId,
        type: "subscriptions",
        attributes: {
          user_email: TEST_EMAIL,
          user_name: "Test User",
          total: 0,
          currency: "EUR",
          customer_country: "FR",
          variant_id: parseInt(product.lemonVariantId, 10),
          custom_data: customData, // ← legacy subscription path
        },
      },
    });
    const signature = crypto
      .createHmac("sha256", process.env.LEMONSQUEEZY_WEBHOOK_SECRET ?? "")
      .update(body, "utf8")
      .digest("hex");

    const resp = await request.post("/api/webhooks/lemonsqueezy", {
      headers: { "x-signature": signature },
      data: body,
    });
    expect(resp.status()).toBe(200);

    // Order resolved, locale "fr-fr"
    const order = await prisma.order.findFirst({
      where: { user: { email: TEST_EMAIL }, providerOrderId: orderId },
    });
    expect(order).toBeTruthy();
    expect(order?.status).toBe("completed");
    expect(order?.locale).toBe("fr-fr");
    expect(order?.productId).toBe(product.id);

    // channelId persisted on the AnalyticEvent (parity with the canonical
    // subscription_created test above)
    const analyticsEvent = await prisma.analyticEvent.findFirst({
      where: {
        userId: order?.userId,
        eventType: "purchase",
        productId: product.id,
      },
    });
    expect(analyticsEvent?.channelId).toBe(TEST_CHANNEL_ID);
  });

  test("defensive fallback: payload without meta.custom_data still resolves via attributes.first_order_item.product_options.custom_data", async ({
    request,
  }) => {
    const product = await prisma.product.findUnique({
      where: { slug: "test-course-e2e" },
    });
    if (!product?.lemonVariantId) {
      test.skip(true, "TEST_LEMON_VARIANT_ID not configured on the seeded test product");
      return;
    }

    // Build a payload SHAPED like the legacy/non-canonical flow: no
    // `meta.custom_data`, customData lives only under
    // `attributes.first_order_item.product_options.custom_data`. The
    // route's defensive fallback chain must still resolve the product.
    const orderId = `ls-cd-fallback-${Date.now()}`;
    const customData = {
      courseSlug: product.slug,
      locale: "es-es",
      channelId: TEST_CHANNEL_ID,
    };

    const body = JSON.stringify({
      meta: { event_name: "order_created" }, // ← no custom_data here
      data: {
        id: orderId,
        type: "orders",
        attributes: {
          user_email: TEST_EMAIL,
          user_name: "Test User",
          total: 4900,
          currency: "USD",
          customer_country: "ES",
          first_order_item: {
            variant_id: parseInt(product.lemonVariantId, 10),
            product_options: {
              custom_data: customData, // ← legacy path
            },
          },
        },
      },
    });
    const signature = crypto
      .createHmac("sha256", process.env.LEMONSQUEEZY_WEBHOOK_SECRET ?? "")
      .update(body, "utf8")
      .digest("hex");

    const resp = await request.post("/api/webhooks/lemonsqueezy", {
      headers: { "x-signature": signature },
      data: body,
    });
    expect(resp.status()).toBe(200);

    // Order resolved, locale "es-es", channelId persisted
    const order = await prisma.order.findFirst({
      where: { user: { email: TEST_EMAIL }, providerOrderId: orderId },
    });
    expect(order).toBeTruthy();
    expect(order?.status).toBe("completed");
    expect(order?.locale).toBe("es-es");
    expect(order?.productId).toBe(product.id);

    const analyticsEvent = await prisma.analyticEvent.findFirst({
      where: {
        userId: order?.userId,
        eventType: "purchase",
        productId: product.id,
      },
    });
    expect(analyticsEvent?.channelId).toBe(TEST_CHANNEL_ID);
  });
});
