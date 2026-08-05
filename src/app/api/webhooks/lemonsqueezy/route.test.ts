/**
 * Slim integration tests for POST /api/webhooks/lemonsqueezy.
 *
 * The route is a thin transport layer. All business logic now lives in:
 *   - provider.parseWebhook (HMAC + JSON normalize)
 *   - webhooks/processor (dispatch by eventType)
 *   - webhooks/idempotency (ProcessedWebhook gate)
 *   - webhooks/error-classifier (response shaping)
 *
 * Route's responsibility is reduced to:
 *   - read body + signature (adapter)
 *   - call provider.parseWebhook
 *   - check idempotency gate
 *   - dispatch via processor
 *   - record delivery
 *   - shape the HTTP response from classified errors
 *
 * Per-module behaviour is covered by __tests__/ in
 * src/lib/commerce/webhooks/. This file exercises the orchestration.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockRequest } from "@/app/api/__test-helpers__/mock-request";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { HmacVerificationError } from "@/lib/commerce/webhooks/verifier";
import {
  WebhookAckError,
  InvalidJsonError,
} from "@/lib/commerce/webhooks/error-classifier";

// ─── Mocks ────────────────────────────────────────────────────

const {
  mockParseWebhook,
  mockProcessWebhookEvent,
  mockReserveWebhookEvent,
  mockCompleteWebhookEvent,
  mockFailWebhookEvent,
} = vi.hoisted(() => ({
  mockParseWebhook: vi.fn(),
  mockProcessWebhookEvent: vi.fn(),
  mockReserveWebhookEvent: vi.fn(),
  mockCompleteWebhookEvent: vi.fn(),
  mockFailWebhookEvent: vi.fn(),
}));

// Step 7: complete stub provider (all required PaymentProvider methods)
// so the route's `paymentProviderRegistry.get("lemonsqueezy").parseWebhook(...)`
// call returns a fully-typed object. The mock for this module alone
// does NOT trigger init.ts's side-effect registration under vitest's
// module isolation; that's why beforeEach below calls
// `paymentProviderRegistry.register(lemonSqueezyProvider)` explicitly
// (matching the pattern in webhooks/__tests__/processor.test.ts).
vi.mock("@/lib/commerce/payments/providers/lemonsqueezy", () => ({
  lemonSqueezyProvider: {
    slug: "lemonsqueezy" as const,
    createCheckout: vi.fn(),
    parseWebhook: mockParseWebhook,
    translateEvent: vi.fn(),
    retrievePayment: vi.fn(),
  },
}));

vi.mock("@/lib/commerce/webhooks/processor", () => ({
  processWebhookEvent: mockProcessWebhookEvent,
}));

vi.mock("@/lib/commerce/webhooks/idempotency", () => ({
  reserveWebhookEvent: mockReserveWebhookEvent,
  completeWebhookEvent: mockCompleteWebhookEvent,
  failWebhookEvent: mockFailWebhookEvent,
}));

// Step 7: import registry + the (mocked) LS adapter so beforeEach
// can re-register the stub. Importing from "@/lib/commerce/payme..."init"
// here would re-trigger init.ts's side-effect, which we explicitly
// want to bypass (see comment above + processor.test.ts mirror).
import { paymentProviderRegistry } from "@/lib/commerce/payments/registry";
import { lemonSqueezyProvider } from "@/lib/commerce/payments/providers/lemonsqueezy";

import { POST } from "./route";

const sampleEvent = {
  provider: "lemonsqueezy" as const,
  eventType: "order_created",
  deliveryId: "LS-ls-1-order_created",
  correlationKey: "ls-1",
  payload: {},
};

beforeEach(() => {
  vi.clearAllMocks();
  // Step 7: re-hydrate the registry with the (mocked) LS provider for
  // each test — router-handler tests rely on registry.get("lemonsqueezy")
  // returning a usable provider, just like processor.test.ts.
  paymentProviderRegistry.__test_only_clearAll();
  paymentProviderRegistry.register(lemonSqueezyProvider);
  mockParseWebhook.mockResolvedValue(sampleEvent);
  mockProcessWebhookEvent.mockResolvedValue(undefined);
  mockReserveWebhookEvent.mockResolvedValue({
    acquired: true,
    deliveryId: sampleEvent.deliveryId,
    status: "processing",
    payloadHash: "hash",
  });
  mockCompleteWebhookEvent.mockResolvedValue(undefined);
  mockFailWebhookEvent.mockResolvedValue(undefined);
});

function makeRequest(rawBody = '{"ok":true}', signature = "sig") {
  return createMockRequest("/api/webhooks/lemonsqueezy", {
    method: "POST",
    body: rawBody,
    headers: {
      "Content-Type": "application/json",
      "x-signature": signature,
    },
  });
}

describe("POST /api/webhooks/lemonsqueezy — slim route", () => {
  it("happy path: parses → not duplicate → dispatches → records → 200", async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(mockParseWebhook).toHaveBeenCalledTimes(1);
    expect(mockReserveWebhookEvent).toHaveBeenCalledWith({
      provider: "lemonsqueezy",
      deliveryId: sampleEvent.deliveryId,
      eventType: sampleEvent.eventType,
      rawBody: '{"ok":true}',
    });
    expect(mockProcessWebhookEvent).toHaveBeenCalledWith(sampleEvent);
    expect(mockCompleteWebhookEvent).toHaveBeenCalledWith({
      deliveryId: sampleEvent.deliveryId,
      payloadHash: "hash",
    });
  });

  it("short-circuits to 200 when delivery already processed", async () => {
    mockReserveWebhookEvent.mockResolvedValue({
      acquired: false,
      deliveryId: sampleEvent.deliveryId,
      status: "completed",
      payloadHash: "hash",
    });
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(mockProcessWebhookEvent).not.toHaveBeenCalled();
    expect(mockCompleteWebhookEvent).not.toHaveBeenCalled();
    expect(mockFailWebhookEvent).not.toHaveBeenCalled();
  });

  it("returns 400 on HmacVerificationError", async () => {
    mockParseWebhook.mockRejectedValue(
      new HmacVerificationError("INVALID_SIGNATURE", "Invalid signature"),
    );
    const res = await POST(makeRequest());
    expect(res.status).toBe(400);
  });

  it("returns 400 on InvalidJsonError (transport-level parse failure)", async () => {
    // Real class instance — `instanceof InvalidJsonError` only
    // passes when prototype chain includes InvalidJsonError itself
    // (Object.assign mocks bypass the prototype chain).
    mockParseWebhook.mockRejectedValue(new InvalidJsonError());
    const res = await POST(makeRequest());
    expect(res.status).toBe(400);
  });

  it("returns 200 ack on business-side ValidationError (deterministic; stop retries)", async () => {
    // ValidationError thrown by domain code (e.g. processOrder with bad
    // input) is NOT a transport parse error — the route acks 200 so the
    // provider stops retrying an identical payload.
    mockProcessWebhookEvent.mockRejectedValue(new ValidationError("Invalid metadata"));
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(mockFailWebhookEvent).toHaveBeenCalledWith(
      expect.objectContaining({ retryable: false }),
    );
  });

  it("returns 200 ack on WebhookAckError (missing eventName ping)", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    mockParseWebhook.mockRejectedValue(new WebhookAckError("ping"));
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(mockProcessWebhookEvent).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledWith(
      expect.stringContaining("Ack-only payment"),
      expect.any(Object),
    );
    infoSpy.mockRestore();
  });

  it("returns 200 ack on NotFoundError (deterministic business error)", async () => {
    mockProcessWebhookEvent.mockRejectedValue(new NotFoundError("product missing"));
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
  });

  it("returns 503 on transient error from processor", async () => {
    mockProcessWebhookEvent.mockRejectedValue(new Error("upstream ECONNREFUSED"));
    const res = await POST(makeRequest());
    expect(res.status).toBe(503);
    expect(mockFailWebhookEvent).toHaveBeenCalledWith(
      expect.objectContaining({ retryable: true }),
    );
  });

  it("returns 500 on unexpected error", async () => {
    mockProcessWebhookEvent.mockRejectedValue(new Error("boom"));
    const res = await POST(makeRequest());
    expect(res.status).toBe(500);
  });

  it("forwards provider errors (parseWebhook) before any DB or dispatch", async () => {
    mockParseWebhook.mockRejectedValue(
      new HmacVerificationError("INVALID_SIGNATURE", "Invalid signature"),
    );
    await POST(makeRequest());
    expect(mockReserveWebhookEvent).not.toHaveBeenCalled();
    expect(mockProcessWebhookEvent).not.toHaveBeenCalled();
    expect(mockCompleteWebhookEvent).not.toHaveBeenCalled();
    expect(mockFailWebhookEvent).not.toHaveBeenCalled();
  });
});
