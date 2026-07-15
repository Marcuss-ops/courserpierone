import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockProcessOrder, mockRevokeOrder } = vi.hoisted(() => ({
  mockProcessOrder: vi.fn(),
  mockRevokeOrder: vi.fn(),
}));

vi.mock("@/lib/commerce/orders/complete-order", () => ({
  processOrder: mockProcessOrder,
}));

vi.mock("@/lib/commerce/orders/revoke-order", () => ({
  revokeOrder: mockRevokeOrder,
}));

import {
  processWebhookEvent,
  LS_EVENT_PROCESSABLE,
} from "@/lib/commerce/webhooks/processor";

const baseEvent = (eventType: string, correlationKey = "ls-1") => ({
  provider: "lemonsqueezy" as const,
  eventType,
  deliveryId: `LS-${correlationKey}-${eventType}`,
  correlationKey,
  payload: {
    meta: {
      event_name: eventType,
      custom_data: { courseSlug: "amish-secrets", locale: "it" },
    },
    data: {
      id: correlationKey,
      attributes: {
        user_email: "test@example.com",
        total: 9900,
        currency: "USD",
      },
    },
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  mockRevokeOrder.mockResolvedValue({ count: 1 });
});

describe("LS_EVENT_PROCESSABLE export (drift guard)", () => {
  it("contains exactly the 5 expected LS events", () => {
    expect(Array.from(LS_EVENT_PROCESSABLE).sort()).toEqual(
      [
        "order_created",
        "order_refunded",
        "subscription_cancelled",
        "subscription_created",
        "subscription_payment_failed",
      ].sort(),
    );
  });
});

describe("processWebhookEvent — order-creation dispatch", () => {
  it("order_created → processOrder (no revoke)", async () => {
    await processWebhookEvent(baseEvent("order_created"));
    expect(mockProcessOrder).toHaveBeenCalledTimes(1);
    expect(mockRevokeOrder).not.toHaveBeenCalled();
  });

  it("subscription_created → processOrder (no revoke)", async () => {
    await processWebhookEvent(baseEvent("subscription_created"));
    expect(mockProcessOrder).toHaveBeenCalledTimes(1);
    expect(mockRevokeOrder).not.toHaveBeenCalled();
  });
});

describe("processWebhookEvent — revoke dispatch", () => {
  it("order_refunded → revokeOrder({orderStatus: 'refunded'})", async () => {
    await processWebhookEvent(baseEvent("order_refunded"));
    expect(mockRevokeOrder).toHaveBeenCalledWith({
      paymentProvider: "lemonsqueezy",
      providerOrderId: "ls-1",
      orderStatus: "refunded",
    });
    expect(mockProcessOrder).not.toHaveBeenCalled();
  });

  it("subscription_cancelled → revokeOrder({orderStatus: 'failed'})", async () => {
    await processWebhookEvent(baseEvent("subscription_cancelled"));
    expect(mockRevokeOrder).toHaveBeenCalledWith({
      paymentProvider: "lemonsqueezy",
      providerOrderId: "ls-1",
      orderStatus: "failed",
    });
  });

  it("subscription_payment_failed → revokeOrder({orderStatus: 'failed'})", async () => {
    await processWebhookEvent(baseEvent("subscription_payment_failed"));
    expect(mockRevokeOrder).toHaveBeenCalledWith({
      paymentProvider: "lemonsqueezy",
      providerOrderId: "ls-1",
      orderStatus: "failed",
    });
  });
});

describe("processWebhookEvent — unhandled event", () => {
  it("warns + no-ops on unknown event types", async () => {
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    await processWebhookEvent(baseEvent("future_event_v2"));
    expect(mockProcessOrder).not.toHaveBeenCalled();
    expect(mockRevokeOrder).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Unhandled event type: future_event_v2"),
    );
    warnSpy.mockRestore();
  });
});
