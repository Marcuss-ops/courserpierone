// @vitest-environment node

/**
 * Real-DB integration test for the complete post-checkout path:
 *
 *   POST /api/webhooks/lemonsqueezy
 *     → provider.parseWebhook + translateEvent
 *     → processOrder
 *     → Order + AccessGrant transaction
 *   GET /api/access?provider&providerOrderId
 *     → hasAccess: true
 *   GET /api/access?orderId=<internal Order.id>
 *     → hasAccess: true
 *
 * The test uses the repository's TEST_DATABASE_URL/DATABASE_URL harness.
 * It skips when no database is configured, matching the existing real-DB
 * integration suites. Email delivery and rate limiting are mocked because
 * they are external/non-essential side effects; Prisma, webhook parsing,
 * webhook processing, Order, AccessGrant, and both API route handlers are
 * real.
 */

import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockRequest } from "@/app/api/__test-helpers__/mock-request";

const { mockGetServerUser, mockSendPurchaseConfirmation } = vi.hoisted(() => ({
  mockGetServerUser: vi.fn(),
  mockSendPurchaseConfirmation: vi.fn(),
}));

vi.mock("@/lib/supabase/get-user", () => ({
  getServerUser: mockGetServerUser,
}));

vi.mock("@/lib/commerce/shared/email", () => ({
  sendPurchaseConfirmation: mockSendPurchaseConfirmation,
}));

vi.mock("@/lib/utils/rate-limit", () => ({
  withRateLimit: <T,>(handler: T) => handler,
}));

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
// The application Prisma singleton reads DATABASE_URL. Always point it at
// the same database selected by this fixture, including when both
// TEST_DATABASE_URL and DATABASE_URL are present but differ.
if (databaseUrl) {
  process.env.DATABASE_URL = databaseUrl;
}

const webhookSecret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET ?? "integration-test-secret";
if (!process.env.LEMONSQUEEZY_WEBHOOK_SECRET) {
  process.env.LEMONSQUEEZY_WEBHOOK_SECRET = webhookSecret;
}

const realPrisma = databaseUrl
  ? new PrismaClient({ datasources: { db: { url: databaseUrl } } })
  : null;
const describeIfDb = realPrisma ? describe : describe.skip;
const unique = `webhook-access-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const testEmail = `${unique}@example.com`;
const providerOrderId = `ls-${unique}`;
const productSlug = `integration-${unique}`;

let productId = "";
let userId = "";
let internalOrderId = "";

function signPayload(payload: unknown): { body: string; signature: string } {
  const body = JSON.stringify(payload);
  const signature = crypto
    .createHmac("sha256", webhookSecret)
    .update(body, "utf8")
    .digest("hex");
  return { body, signature };
}

function createOrderCreatedPayload() {
  return {
    meta: {
      event_name: "order_created",
      custom_data: {
        courseSlug: productSlug,
        locale: "en-us",
      },
    },
    data: {
      id: providerOrderId,
      type: "orders",
      attributes: {
        user_email: testEmail,
        user_name: "Webhook Access Integration Test",
        total: 4900,
        currency: "USD",
        customer_country: "US",
      },
    },
  };
}

async function accessResponse(query: Record<string, string>) {
  const { GET } = await import("@/app/api/access/route");
  const response = await GET(
    createMockRequest("/api/access", {
      query: { productId, ...query },
    }),
  );
  return {
    status: response.status,
    body: await response.json(),
  };
}

describeIfDb("webhook → Order → AccessGrant → GET /api/access", () => {
  beforeAll(async () => {
    if (!realPrisma) return;

    const user = await realPrisma.user.create({
      data: {
        email: testEmail,
        name: "Webhook Access Integration Test",
        role: "student",
      },
    });
    userId = user.id;

    const product = await realPrisma.product.create({
      data: {
        slug: productSlug,
        creatorId: userId,
        status: "published",
        price: 4900,
        currency: "usd",
        defaultLanguage: "en",
      },
    });
    productId = product.id;
  });

  beforeEach(() => {
    mockGetServerUser.mockResolvedValue({
      supabase: null,
      user: null,
      dbUser: null,
    });
    mockSendPurchaseConfirmation.mockResolvedValue(undefined);
  });

  afterAll(async () => {
    if (!realPrisma) return;

    try {
      // Delete by the stable fixture identities rather than by values
      // populated only after assertions. This keeps cleanup effective even
      // when the test fails between the webhook write and the Order lookup.
      if (productId) {
        await realPrisma.accessGrant.deleteMany({ where: { productId } });
        await realPrisma.order.deleteMany({ where: { productId } });
        await realPrisma.abandonedCheckout.deleteMany({ where: { productId } });
      }
      if (userId) {
        await realPrisma.analyticEvent.deleteMany({ where: { userId } });
      }
      await realPrisma.processedWebhook.deleteMany({
        where: { deliveryId: { contains: providerOrderId } },
      });
      if (productId) {
        await realPrisma.product.delete({ where: { id: productId } });
      }
      if (userId) {
        await realPrisma.user.delete({ where: { id: userId } });
      }
    } finally {
      await realPrisma.$disconnect();
    }
  });

  it("creates the Order and AccessGrant from a real webhook, then grants access by both IDs", async () => {
    if (!realPrisma) throw new Error("realPrisma is required in this suite");

    const { POST } = await import("./route");
    const { body, signature } = signPayload(createOrderCreatedPayload());
    const webhookResponse = await POST(
      createMockRequest("/api/webhooks/lemonsqueezy", {
        method: "POST",
        body,
        headers: {
          "content-type": "application/json",
          "x-signature": signature,
        },
      }),
    );

    expect(webhookResponse.status).toBe(200);
    expect(await webhookResponse.json()).toEqual({ received: true });

    const order = await realPrisma.order.findUnique({
      where: {
        paymentProvider_providerOrderId: {
          paymentProvider: "lemonsqueezy",
          providerOrderId,
        },
      },
    });
    expect(order).not.toBeNull();
    expect(order?.productId).toBe(productId);
    expect(order?.userId).toBe(userId);
    expect(order?.status).toBe("completed");
    expect(order?.providerOrderId).toBe(providerOrderId);
    internalOrderId = order?.id ?? "";
    expect(internalOrderId).not.toBe("");

    const grant = await realPrisma.accessGrant.findUnique({
      where: {
        sourceType_sourceId_productId: {
          sourceType: "order",
          sourceId: internalOrderId,
          productId,
        },
      },
    });
    expect(grant).not.toBeNull();
    expect(grant?.status).toBe("active");
    expect(grant?.userId).toBe(userId);
    expect(grant?.sourceType).toBe("order");
    expect(grant?.sourceId).toBe(order?.id);

    const processed = await realPrisma.processedWebhook.findUnique({
      where: { deliveryId: `LS-${providerOrderId}-order_created` },
    });
    expect(processed?.provider).toBe("lemonsqueezy");

    const externalAccess = await accessResponse({
      provider: "lemonsqueezy",
      providerOrderId,
    });
    expect(externalAccess.status).toBe(200);
    expect(externalAccess.body).toEqual({ hasAccess: true });

    const internalAccess = await accessResponse({ orderId: internalOrderId });
    expect(internalAccess.status).toBe(200);
    expect(internalAccess.body).toEqual({ hasAccess: true });
  });
});
