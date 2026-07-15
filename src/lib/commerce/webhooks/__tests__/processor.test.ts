import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/commerce/orders/complete-order", () => ({
  processOrder: vi.fn(),
}));
vi.mock("@/lib/commerce/orders/revoke-order", () => ({
  revokeOrder: vi.fn(),
}));

import { processOrder } from "@/lib/commerce/orders/complete-order";
import { revokeOrder } from "@/lib/commerce/orders/revoke-order";
import { processWebhookEvent } from "../processor";
import type { PaymentEvent } from "@/lib/commerce/payments/types";

const mockProcessOrder = vi.mocked(processOrder);
const mockRevokeOrder = vi.mocked(revokeOrder);

interface BuildOverrides {
  id?: string | number;
}

function buildEvent(eventType: string, overrides: BuildOverrides = {}): PaymentEvent {
  const id = overrides.id ?? "ls-1";
  return {
    provider: "lemonsqueezy",
    eventType,
    deliveryId: `LS-${id}-${eventType}`,
    correlationKey: `${id}`,
    payload: {
      meta: { event_name: eventType, custom_data: {} },
      data: {
        id,
        attributes: {
          user_email: "buyer@example.com",
          user_name: "Test Buyer",
          total: 4900,
          currency: "eur",
          customer_country: "IT",
          first_order_item: { variant_id: 12345 },
        },
      },
    },
  };
}

describe("processWebhookEvent — dispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProcessOrder.mockResolvedValue(undefined);
    mockRevokeOrder.mockResolvedValue({ count: 0 });
  });

  it.each(["order_created", "subscription_created"])(
    "calls processOrder for %s",
    async (eventType) => {
      await processWebhookEvent(buildEvent(eventType));
      expect(mockProcessOrder).toHaveBeenCalledTimes(1);
      expect(mockProcessOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "buyer@example.com",
          productSlug: "",
          variantId: "12345",
          providerOrderId: "ls-1",
          paymentProvider: "lemonsqueezy",
          amount: 4900,
          currency: "eur",
          locale: "it",
          customerCountry: "IT",
          channelId: null,
        }),
      );
    },
  );

  it("maps meta.custom_data into processOrder fields", async () => {
    const event = buildEvent("order_created", { id: "X" });
    const payload = event.payload as {
      meta?: { event_name?: string; custom_data?: Record<string, string> };
      data?: { id?: string; attributes?: Record<string, unknown> };
    };
    payload.meta = {
      event_name: "order_created",
      custom_data: {
        courseSlug: "amish-secrets",
        locale: "es-es",
        channelId: "yt-channel-abc",
      },
    };
    await processWebhookEvent(event);
    expect(mockProcessOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        productSlug: "amish-secrets",
        locale: "es-es",
        channelId: "yt-channel-abc",
      }),
    );
  });

  it.each(["order_refunded"])(
    "calls revokeOrder(refunded) for %s",
    async (eventType) => {
      mockRevokeOrder.mockResolvedValue({ count: 2 });
      await processWebhookEvent(buildEvent(eventType, { id: "ord-9" }));
      expect(mockRevokeOrder).toHaveBeenCalledWith({
        paymentProvider: "lemonsqueezy",
        providerOrderId: "ord-9",
        orderStatus: "refunded",
      });
    },
  );

  it.each(["subscription_cancelled", "subscription_payment_failed"])(
    "calls revokeOrder(failed) for %s",
    async (eventType) => {
      mockRevokeOrder.mockResolvedValue({ count: 1 });
      await processWebhookEvent(buildEvent(eventType, { id: "sub-7" }));
      expect(mockRevokeOrder).toHaveBeenCalledWith({
        paymentProvider: "lemonsqueezy",
        providerOrderId: "sub-7",
        orderStatus: "failed",
      });
    },
  );

  it("skips processing for unknown eventType (warns, no throw)", async () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await processWebhookEvent(buildEvent("test_ping"));
    expect(mockProcessOrder).not.toHaveBeenCalled();
    expect(mockRevokeOrder).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("Unhandled event type: test_ping"),
    );
    consoleSpy.mockRestore();
  });

  it("does not call processOrder when customer email is missing", async () => {
    const consoleSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const event = buildEvent("order_created");
    const payload = event.payload as {
      data?: { attributes?: Record<string, unknown> };
    };
    payload.data = {
      attributes: { user_email: undefined, customer_email: undefined },
    };
    await processWebhookEvent(event);
    expect(mockProcessOrder).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("propagates errors thrown by processOrder", async () => {
    mockProcessOrder.mockRejectedValue(new Error("upstream timeout"));
    await expect(processWebhookEvent(buildEvent("order_created"))).rejects.toThrow(
      "upstream timeout",
    );
  });
});
