/**
 * Unit tests for POST /api/webhooks/lemonsqueezy.
 *
 * Covers:
 *   - Signature verification (missing/invalid secret, missing signature, invalid signature)
 *   - JSON parsing errors
 *   - Early ack for malformed payloads
 *   - Idempotency guard
 *   - order_created / subscription_created dispatch to processOrder
 *   - order_refunded / subscription_cancelled / subscription_payment_failed revocation
 *   - Error handling (NotFoundError/ValidationError ack, transient errors retry, generic errors 500)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";
import { createMockRequest } from "@/app/api/__test-helpers__/mock-request";
import { NotFoundError, ValidationError } from "@/lib/errors";

// ─── Environment ────────────────────────────────────────────
const WEBHOOK_SECRET = "test-webhook-secret";

// ─── Mocks ────────────────────────────────────────────────────
vi.mock("@/lib/commerce/orders/complete-order", () => ({
  processOrder: vi.fn(),
}));

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    processedWebhook: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    order: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    accessGrant: {
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));

// Import route AFTER mocks are registered
import { POST } from "./route";
import { processOrder } from "@/lib/commerce/orders/complete-order";

const mockProcessOrder = vi.mocked(processOrder);

// ─── Helpers ──────────────────────────────────────────────────
function signPayload(payload: unknown, secret = WEBHOOK_SECRET) {
  const body = JSON.stringify(payload);
  const signature = crypto.createHmac("sha256", secret).update(body).digest("hex");
  return { body, signature };
}

function createWebhookRequest(
  payload: unknown,
  options: { signature?: string; secret?: string; invalidJson?: boolean } = {}
) {
  const { signature, secret, invalidJson } = options;

  let body: string;
  let finalSignature: string | undefined;

  if (invalidJson) {
    body = "not-json";
    finalSignature = crypto.createHmac("sha256", secret ?? WEBHOOK_SECRET).update(body).digest("hex");
  } else {
    const signed = signPayload(payload, secret ?? WEBHOOK_SECRET);
    body = signed.body;
    finalSignature = signed.signature;
  }

  if (signature !== undefined) {
    finalSignature = signature;
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (finalSignature !== undefined) {
    headers["x-signature"] = finalSignature;
  }

  return createMockRequest("/api/webhooks/lemonsqueezy", {
    method: "POST",
    body,
    headers,
  });
}

function buildOrderPayload(eventName = "order_created") {
  return {
    meta: {
      event_name: eventName,
      custom_data: {
        courseSlug: "test-course",
        locale: "en-us",
        variantId: "12345",
      },
    },
    data: {
      id: "ls-order-123",
      type: "orders",
      attributes: {
        user_email: "buyer@example.com",
        customer_email: "buyer@example.com",
        user_name: "Test Buyer",
        total: 4900,
        currency: "eur",
        customer_country: "IT",
        first_order_item: {
          variant_id: 12345,
          product_options: {
            custom_data: {
              courseSlug: "test-course",
              locale: "en-us",
            },
          },
        },
      },
    },
  };
}

function buildSubscriptionPayload(eventName = "subscription_created") {
  return {
    meta: {
      event_name: eventName,
      custom_data: {
        courseSlug: "test-course",
        locale: "en-us",
        variantId: "12345",
      },
    },
    data: {
      id: "ls-sub-123",
      type: "subscriptions",
      attributes: {
        user_email: "buyer@example.com",
        customer_email: "buyer@example.com",
        user_name: "Test Buyer",
        variant_id: 12345,
        total: 4900,
        currency: "eur",
        customer_country: "IT",
      },
    },
  };
}

// ─── Tests ────────────────────────────────────────────────────
describe("POST /api/webhooks/lemonsqueezy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.LEMONSQUEEZY_WEBHOOK_SECRET = WEBHOOK_SECRET;

    // Default: no previously processed webhook
    mockPrisma.processedWebhook.findUnique.mockResolvedValue(null);
    mockPrisma.processedWebhook.create.mockResolvedValue({ id: "pw-1" });
    mockPrisma.order.findMany.mockResolvedValue([]);
    // Run the transaction promises so inner updateMany calls are exercised.
    mockPrisma.$transaction.mockImplementation((promises: Promise<unknown>[]) =>
      Promise.all(promises),
    );

    // Default: processOrder succeeds
    mockProcessOrder.mockResolvedValue(undefined);
  });

  // ─── Signature verification ─────────────────────────────────
  describe("signature verification", () => {
    it("returns 500 when webhook secret is not configured", async () => {
      delete process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
      const req = createWebhookRequest(buildOrderPayload());
      const res = await POST(req);
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toContain("Webhook secret not configured");
    });

    it("returns 400 when x-signature header is missing", async () => {
      const payload = buildOrderPayload();
      const { body } = signPayload(payload);
      const req = createMockRequest("/api/webhooks/lemonsqueezy", {
        method: "POST",
        body,
        headers: { "Content-Type": "application/json" },
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("Missing x-signature");
    });

    it("returns 400 when signature is invalid", async () => {
      const req = createWebhookRequest(buildOrderPayload(), { signature: "invalid" });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("Invalid signature");
    });

    it("returns 400 when body is not valid JSON", async () => {
      const req = createWebhookRequest({}, { invalidJson: true });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("Invalid JSON");
    });
  });

  // ─── Payload validation ───────────────────────────────────
  describe("payload validation", () => {
    it("returns 200 when event_name or data is missing", async () => {
      const req = createWebhookRequest({ meta: {} });
      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.received).toBe(true);
      expect(mockProcessOrder).not.toHaveBeenCalled();
    });
  });

  // ─── Idempotency ────────────────────────────────────────────
  describe("idempotency", () => {
    it("returns 200 without processing when webhook was already processed", async () => {
      mockPrisma.processedWebhook.findUnique.mockResolvedValue({ id: "existing" });
      const req = createWebhookRequest(buildOrderPayload());
      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(mockProcessOrder).not.toHaveBeenCalled();
      expect(mockPrisma.processedWebhook.create).not.toHaveBeenCalled();
    });

    it("records processed webhook after successful processing", async () => {
      const payload = buildOrderPayload();
      const req = createWebhookRequest(payload);
      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(mockPrisma.processedWebhook.create).toHaveBeenCalledWith({
        data: {
          provider: "lemonsqueezy",
          deliveryId: `LS-${payload.data.id}-${payload.meta.event_name}`,
          eventType: payload.meta.event_name,
        },
      });
    });

    it("returns 200 when processedWebhook.create throws P2002 (concurrent delivery)", async () => {
      const error = {
        name: "PrismaClientKnownRequestError",
        code: "P2002",
        message: "Unique constraint",
      };
      mockPrisma.processedWebhook.create.mockRejectedValue(error);
      const req = createWebhookRequest(buildOrderPayload());
      const res = await POST(req);
      expect(res.status).toBe(200);
    });
  });

  // ─── Order / Subscription created ───────────────────────────
  describe("order_created", () => {
    it("processes order_created and calls processOrder with mapped data", async () => {
      const payload = buildOrderPayload();
      const req = createWebhookRequest(payload);
      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(mockProcessOrder).toHaveBeenCalledWith({
        email: "buyer@example.com",
        customerName: "Test Buyer",
        productSlug: "test-course",
        variantId: "12345",
        providerOrderId: "ls-order-123",
        paymentProvider: "lemonsqueezy",
        amount: 4900,
        currency: "eur",
        locale: "en-us",
        customerCountry: "IT",
        channelId: null,
      });
    });

    it("falls back to first_order_item.product_options.custom_data when meta.custom_data is absent", async () => {
      const payload = buildOrderPayload();
      payload.meta.custom_data = undefined as unknown as typeof payload.meta.custom_data;
      const req = createWebhookRequest(payload);
      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(mockProcessOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          productSlug: "test-course",
          locale: "en-us",
          variantId: "12345",
        }),
      );
    });

    it("skips processing when customer email is missing", async () => {
      const payload = buildOrderPayload();
      const { user_email: _u, customer_email: _c, ...restAttributes } = payload.data.attributes;
      payload.data.attributes = restAttributes as typeof payload.data.attributes;
      const req = createWebhookRequest(payload);
      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(mockProcessOrder).not.toHaveBeenCalled();
    });
  });

  describe("subscription_created", () => {
    it("processes subscription_created and calls processOrder with mapped data", async () => {
      const payload = buildSubscriptionPayload();
      const req = createWebhookRequest(payload);
      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(mockProcessOrder).toHaveBeenCalledWith({
        email: "buyer@example.com",
        customerName: "Test Buyer",
        productSlug: "test-course",
        variantId: "12345",
        providerOrderId: "ls-sub-123",
        paymentProvider: "lemonsqueezy",
        amount: 4900,
        currency: "eur",
        locale: "en-us",
        customerCountry: "IT",
        channelId: null,
      });
    });
  });

  // ─── Revocation events ──────────────────────────────────────
  describe("revocation events", () => {
    beforeEach(() => {
      mockPrisma.order.findMany.mockResolvedValue([{ id: "order-1" }, { id: "order-2" }]);
    });

    it("revokes completed orders and access grants on order_refunded", async () => {
      const payload = buildOrderPayload("order_refunded");
      const req = createWebhookRequest(payload);
      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(mockPrisma.order.findMany).toHaveBeenCalledWith({
        where: {
          paymentProvider: "lemonsqueezy",
          providerOrderId: "ls-order-123",
          status: "completed",
        },
        select: { id: true },
      });
      expect(mockPrisma.order.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ["order-1", "order-2"] } },
        data: { status: "refunded" },
      });
      expect(mockPrisma.accessGrant.updateMany).toHaveBeenCalledWith({
        where: {
          sourceType: "order",
          sourceId: { in: ["order-1", "order-2"] },
          status: "active",
        },
        data: {
          status: "revoked",
          revokedAt: expect.any(Date),
        },
      });
    });

    it("revokes completed orders and access grants on subscription_cancelled", async () => {
      const payload = buildSubscriptionPayload("subscription_cancelled");
      const req = createWebhookRequest(payload);
      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(mockPrisma.order.findMany).toHaveBeenCalledWith({
        where: {
          paymentProvider: "lemonsqueezy",
          providerOrderId: "ls-sub-123",
          status: "completed",
        },
        select: { id: true },
      });
      expect(mockPrisma.order.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ["order-1", "order-2"] } },
        data: { status: "failed" },
      });
      expect(mockPrisma.accessGrant.updateMany).toHaveBeenCalledWith({
        where: {
          sourceType: "order",
          sourceId: { in: ["order-1", "order-2"] },
          status: "active",
        },
        data: {
          status: "revoked",
          revokedAt: expect.any(Date),
        },
      });
    });

    it("revokes completed orders and access grants on subscription_payment_failed", async () => {
      const payload = buildSubscriptionPayload("subscription_payment_failed");
      const req = createWebhookRequest(payload);
      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(mockPrisma.order.findMany).toHaveBeenCalledWith({
        where: {
          paymentProvider: "lemonsqueezy",
          providerOrderId: "ls-sub-123",
          status: "completed",
        },
        select: { id: true },
      });
      expect(mockPrisma.order.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ["order-1", "order-2"] } },
        data: { status: "failed" },
      });
      expect(mockPrisma.accessGrant.updateMany).toHaveBeenCalledWith({
        where: {
          sourceType: "order",
          sourceId: { in: ["order-1", "order-2"] },
          status: "active",
        },
        data: {
          status: "revoked",
          revokedAt: expect.any(Date),
        },
      });
    });

    it("does nothing when no completed orders are found", async () => {
      mockPrisma.order.findMany.mockResolvedValue([]);
      const payload = buildOrderPayload("order_refunded");
      const req = createWebhookRequest(payload);
      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
  });

  // ─── Error handling ─────────────────────────────────────────
  describe("error handling", () => {
    it("returns 200 and acks when processOrder throws NotFoundError", async () => {
      mockProcessOrder.mockRejectedValue(new NotFoundError("Product not found"));
      const req = createWebhookRequest(buildOrderPayload());
      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.error).toContain("Product not found");
    });

    it("returns 200 and acks when processOrder throws ValidationError", async () => {
      mockProcessOrder.mockRejectedValue(new ValidationError("Invalid metadata"));
      const req = createWebhookRequest(buildOrderPayload());
      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.error).toContain("Invalid metadata");
    });

    it("returns 503 when processOrder throws a transient error", async () => {
      const error = new Error("ECONNREFUSED");
      mockProcessOrder.mockRejectedValue(error);
      const req = createWebhookRequest(buildOrderPayload());
      const res = await POST(req);
      expect(res.status).toBe(503);
    });

    it("returns 500 when processOrder throws a generic error", async () => {
      mockProcessOrder.mockRejectedValue(new Error("boom"));
      const req = createWebhookRequest(buildOrderPayload());
      const res = await POST(req);
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toContain("Processing failed");
    });
  });
});
