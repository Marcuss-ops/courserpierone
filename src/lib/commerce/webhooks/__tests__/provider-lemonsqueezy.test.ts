import { describe, it, expect, beforeEach } from "vitest";
import crypto from "crypto";
import { lemonSqueezyProvider } from "@/lib/commerce/payments/providers/lemonsqueezy";
import { HmacVerificationError } from "../verifier";
import { InvalidJsonError, WebhookAckError } from "../error-classifier";

const SECRET = "test-webhook-secret-123";
const signPayload = (body: string, secret = SECRET) =>
  crypto.createHmac("sha256", secret).update(body).digest("hex");

function buildRawWebhook(eventName: string, opts: { id?: string; body?: unknown; signature?: string } = {}) {
  const body = JSON.stringify(opts.body ?? {
    meta: { event_name: eventName },
    data: { id: opts.id ?? "ls-1" },
  });
  return {
    provider: "lemonsqueezy" as const,
    deliveryId: "",
    rawBody: body,
    signature: opts.signature ?? signPayload(body),
  };
}

describe("LemonSqueezyPaymentProvider.parseWebhook", () => {
  beforeEach(() => {
    process.env.LEMONSQUEEZY_WEBHOOK_SECRET = SECRET;
  });

  it("returns a normalized PaymentEvent for order_created", async () => {
    const event = await lemonSqueezyProvider.parseWebhook(buildRawWebhook("order_created", { id: "ls-99" }));
    expect(event.provider).toBe("lemonsqueezy");
    expect(event.eventType).toBe("order_created");
    expect(event.correlationKey).toBe("ls-99");
    expect(event.deliveryId).toBe("LS-ls-99-order_created");
  });

  it.each([
    "order_created",
    "subscription_created",
    "subscription_cancelled",
    "subscription_payment_failed",
    "order_refunded",
  ])("accepts the canonical event: %s", async (eventName) => {
    const event = await lemonSqueezyProvider.parseWebhook(buildRawWebhook(eventName, { id: "ls-5" }));
    expect(event.eventType).toBe(eventName);
    expect(event.deliveryId).toBe(`LS-ls-5-${eventName}`);
  });

  it("throws HmacVerificationError when signature is missing", async () => {
    await expect(
      lemonSqueezyProvider.parseWebhook(buildRawWebhook("order_created", { signature: "" })),
    ).rejects.toBeInstanceOf(HmacVerificationError);
  });

  it("throws HmacVerificationError when signature is invalid", async () => {
    await expect(
      lemonSqueezyProvider.parseWebhook(
        buildRawWebhook("order_created", { signature: "invalid" }),
      ),
    ).rejects.toBeInstanceOf(HmacVerificationError);
  });

  it("throws InvalidJsonError when body is not JSON", async () => {
    const rawBody = "not-json";
    await expect(
      lemonSqueezyProvider.parseWebhook({
        provider: "lemonsqueezy",
        deliveryId: "",
        rawBody,
        signature: signPayload(rawBody),
      }),
    ).rejects.toBeInstanceOf(InvalidJsonError);
  });

  it("throws WebhookAckError when meta.event_name is missing", async () => {
    const rawBody = JSON.stringify({ meta: {}, data: { id: "x" } });
    await expect(
      lemonSqueezyProvider.parseWebhook({
        provider: "lemonsqueezy",
        deliveryId: "",
        rawBody,
        signature: signPayload(rawBody),
      }),
    ).rejects.toBeInstanceOf(WebhookAckError);
  });

  it("throws WebhookAckError when data.id is missing", async () => {
    const rawBody = JSON.stringify({ meta: { event_name: "order_created" }, data: {} });
    await expect(
      lemonSqueezyProvider.parseWebhook({
        provider: "lemonsqueezy",
        deliveryId: "",
        rawBody,
        signature: signPayload(rawBody),
      }),
    ).rejects.toBeInstanceOf(WebhookAckError);
  });

  it("exposes the full raw payload for the dispatcher", async () => {
    const rawBody = JSON.stringify({
      meta: { event_name: "order_created", custom_data: { courseSlug: "test-course-e2e" } },
      data: { id: "ls-42", attributes: { user_email: "a@b.com" } },
    });
    const event = await lemonSqueezyProvider.parseWebhook({
      provider: "lemonsqueezy",
      deliveryId: "",
      rawBody,
      signature: signPayload(rawBody),
    });
    expect((event.payload as { data: { attributes: { user_email: string } } }).data.attributes.user_email)
      .toBe("a@b.com");
  });
});
