import { describe, it, expect, vi, beforeEach } from "vitest";

// Step 7: ensure the registry is populated with the LS adapter before
// `processWebhookEvent` resolves the provider via `registry.get(...)`.
// Tests are otherwise unchanged — the only diff is the new `beforeEach`.
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
} from "@/lib/commerce/webhooks/processor";
// Step 7: LS_EVENT_PROCESSABLE moved out of processor.ts into the
// Lemon Squeezy adapter (where provider-specific event names belong).
// Import path reflects the new ownership.
import { LS_EVENT_PROCESSABLE } from "@/lib/commerce/payments/providers/lemonsqueezy";
import { lemonSqueezyProvider } from "@/lib/commerce/payments/providers/lemonsqueezy";
import { paymentProviderRegistry } from "@/lib/commerce/payments/registry";

const baseEvent = (eventType: string, correlationKey = "ls-1") => ({
  provider: "lemonsqueezy" as const,
  eventType,
  deliveryId: `LS-${correlationKey}-${eventType}`,
  correlationKey,
  payload: {
    meta: {
      event_name: eventType,        custom_data: { courseSlug: "test-course-e2e", locale: "it" },
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
  // Step 7: re-register the LS adapter so the registry's `get("lemonsqueezy")`
  // resolves — tests use `__test_only_clearAll()` indirectly via vitest mocking.
  paymentProviderRegistry.__test_only_clearAll();
  paymentProviderRegistry.register(lemonSqueezyProvider);
});

describe("LS_EVENT_PROCESSABLE export (drift guard)", () => {
  it("contains exactly the 6 expected LS events", () => {
    expect(Array.from(LS_EVENT_PROCESSABLE).sort()).toEqual(
      [
        "order_created",
        "order_refunded",
        "subscription_cancelled",
        "subscription_created",
        "subscription_payment_failed",
        "subscription_updated",
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

describe("processWebhookEvent — unsupported subscription event", () => {
  it("subscription_updated is audit-only and does not mutate order/access state", async () => {
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    const action = await processWebhookEvent(baseEvent("subscription_updated"));

    expect(action).toEqual({
      type: "ignored_unsupported",
      reason: expect.stringContaining("subscription synchronization is not supported"),
    });
    expect(mockProcessOrder).not.toHaveBeenCalled();
    expect(mockRevokeOrder).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Unsupported event"),
    );
    warnSpy.mockRestore();
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
