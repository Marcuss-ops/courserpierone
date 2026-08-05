import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";

const { mockGetWebhookSecret, mockVerifyHmacSignature } = vi.hoisted(() => ({
  mockGetWebhookSecret: vi.fn(),
  mockVerifyHmacSignature: vi.fn(),
}));

vi.mock("@/lib/payment/lemonsqueezy", () => ({
  getWebhookSecret: mockGetWebhookSecret,
  initLS: vi.fn(),
  getStoreId: vi.fn(() => "store-1"),
}));

// Partial mock: keep the real HmacVerificationError class so the test
// can throw it (vi.mock with `{verifyHmacSignature: ...}` alone would
// null the class export, breaking the propagation test).
vi.mock("@/lib/commerce/webhooks/verifier", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/lib/commerce/webhooks/verifier")
    >();
  return {
    ...actual,
    verifyHmacSignature: mockVerifyHmacSignature,
  };
});

// Imported AFTER mocks so the provider picks up the mocked modules.
import { LemonSqueezyPaymentProvider } from "@/lib/commerce/payments/providers/lemonsqueezy";
import { LS_EVENT_PROCESSABLE } from "@/lib/commerce/payments/providers/lemonsqueezy";
import { HmacVerificationError } from "@/lib/commerce/webhooks/verifier";

const provider = new LemonSqueezyPaymentProvider();
const SECRET = "test_ls_secret";
const EVENTS = Array.from(LS_EVENT_PROCESSABLE);

function makeBody(eventName: string, dataId: string | number = "ls-order-1"): string {
  return JSON.stringify({
    meta: { event_name: eventName },
    data: { id: dataId, attributes: { user_email: "test@example.com" } },
  });
}

function makeSignature(body: string): string {
  return crypto.createHmac("sha256", SECRET).update(body).digest("hex");
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: verifier passes (so the parse path is exercised).
  mockVerifyHmacSignature.mockImplementation(() => undefined);
  mockGetWebhookSecret.mockReturnValue(SECRET);
});

describe("LemonSqueezyPaymentProvider.parseWebhook — supported and audit-only events", () => {
  // The six events live in `LS_EVENT_PROCESSABLE` (the provider adapter) so
  // the parse-webhook test list and the processor dispatch list can never
  // drift. Touching the Set without updating the contract fails this test.
  it("LS_EVENT_PROCESSABLE contains exactly 6 events (drift guard)", () => {
    expect(LS_EVENT_PROCESSABLE.size).toBe(6);
  });

  it.each(EVENTS)("parses %s into a normalized PaymentEvent", async (eventName) => {
    const rawBody = makeBody(eventName, "ls-99");
    const signature = makeSignature(rawBody);

    const result = await provider.parseWebhook({
      provider: "lemonsqueezy",
      deliveryId: "",
      rawBody,
      signature,
    });

    expect(result.eventType).toBe(eventName);
    expect(result.deliveryId).toBe(`LS-ls-99-${eventName}`);
    expect(result.correlationKey).toBe("ls-99");
    expect(result.provider).toBe("lemonsqueezy");
    expect(result.payload).toMatchObject({
      meta: { event_name: eventName },
      data: { id: "ls-99" },
    });
  });
});

describe("LemonSqueezyPaymentProvider.parseWebhook — error paths", () => {
  it("throws on malformed JSON", async () => {
    await expect(
      provider.parseWebhook({
        provider: "lemonsqueezy",
        deliveryId: "",
        rawBody: "not json",
        signature: "x",
      }),
    ).rejects.toThrow(/invalid json/i);
  });

  it("throws WebhookAckError when meta.event_name is missing (LS ping)", async () => {
    const rawBody = JSON.stringify({ data: { id: 1 } });
    await expect(
      provider.parseWebhook({
        provider: "lemonsqueezy",
        deliveryId: "",
        rawBody,
        signature: "x",
      }),
    ).rejects.toThrow(/ack/i);
  });

  it("throws WebhookAckError when data.id is missing (LS ping)", async () => {
    const rawBody = JSON.stringify({ meta: { event_name: "order_created" } });
    await expect(
      provider.parseWebhook({
        provider: "lemonsqueezy",
        deliveryId: "",
        rawBody,
        signature: "x",
      }),
    ).rejects.toThrow(/ack/i);
  });

  it("propagates HmacVerificationError from the verifier (HMAC-first invariant)", async () => {
    // HMAC must run BEFORE JSON.parse — a failed signature should never
    // reach the parser. Track both to assert ordering.
    const jsonSpy = vi.spyOn(JSON, "parse");
    mockVerifyHmacSignature.mockImplementation(() => {
      throw new HmacVerificationError("INVALID_SIGNATURE", "Invalid signature");
    });

    await expect(
      provider.parseWebhook({
        provider: "lemonsqueezy",
        deliveryId: "",
        rawBody: '{"meta":{"event_name":"order_created"},"data":{"id":1}}',
        signature: "bogus",
      }),
    ).rejects.toThrow("Invalid signature");

    expect(mockVerifyHmacSignature).toHaveBeenCalledTimes(1);
    expect(jsonSpy).not.toHaveBeenCalled();
    jsonSpy.mockRestore();
  });
});
