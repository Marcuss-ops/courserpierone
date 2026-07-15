import { describe, it, expect, vi } from "vitest";
import { HmacVerificationError } from "@/lib/commerce/webhooks/verifier";
import {
  isAckError,
  isSecurityOrParseError,
  isTransientError,
  isAcknowledgableError,
  classifyWebhookError,
  WebhookAckError,
  InvalidJsonError,
} from "@/lib/commerce/webhooks/error-classifier";
import { NotFoundError, ValidationError } from "@/lib/errors";

describe("isAckError", () => {
  it("returns true for WebhookAckError", () => {
    expect(isAckError(new WebhookAckError("ping"))).toBe(true);
  });
  it("returns false for plain Error", () => {
    expect(isAckError(new Error("x"))).toBe(false);
  });
  it("returns false for non-error string", () => {
    expect(isAckError("oops")).toBe(false);
  });
});

describe("isSecurityOrParseError", () => {
  it("returns true for HmacVerificationError", () => {
    expect(
      isSecurityOrParseError(
        new HmacVerificationError("INVALID_SIGNATURE", "x"),
      ),
    ).toBe(true);
  });
  it("returns true for InvalidJsonError", () => {
    expect(isSecurityOrParseError(new InvalidJsonError())).toBe(true);
  });
  it("returns false for business ValidationError (NOT a parse error)", () => {
    expect(isSecurityOrParseError(new ValidationError("bad input"))).toBe(
      false,
    );
  });
  it("returns false for NotFoundError", () => {
    expect(isSecurityOrParseError(new NotFoundError("missing"))).toBe(false);
  });
});

describe("isTransientError", () => {
  it.each([
    "ECONNREFUSED",
    "ETIMEDOUT",
    "timeout",
    "rate limit",
    "429",
    "503",
    "ENOTFOUND",
    "ECONNRESET",
  ])("matches transient pattern: %s", (pattern) => {
    expect(isTransientError(new Error(`upstream ${pattern} occurred`))).toBe(
      true,
    );
  });

  it("returns false for non-transient errors", () => {
    expect(isTransientError(new Error("invalid input"))).toBe(false);
  });
});

describe("isAcknowledgableError", () => {
  it("returns true for NotFoundError", () => {
    expect(isAcknowledgableError(new NotFoundError("missing"))).toBe(true);
  });
  it("returns true for ValidationError (business-side)", () => {
    expect(isAcknowledgableError(new ValidationError("bad input"))).toBe(true);
  });
  it("returns false for plain Error", () => {
    expect(isAcknowledgableError(new Error("boom"))).toBe(false);
  });
});

describe("classifyWebhookError", () => {
  // Suppress expected console.info/error noise during tests.
  const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
  const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

  it("returns 200 for WebhookAckError (LS ping)", () => {
    const res = classifyWebhookError(new WebhookAckError("ping"), "req-1");
    expect(res.status).toBe(200);
  });

  it("returns 400 for HmacVerificationError", () => {
    const res = classifyWebhookError(
      new HmacVerificationError("INVALID_SIGNATURE", "bad sig"),
      "req-2",
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for InvalidJsonError", () => {
    const res = classifyWebhookError(new InvalidJsonError(), "req-3");
    expect(res.status).toBe(400);
  });

  it("returns 503 for transient errors (provider retries)", () => {
    const res = classifyWebhookError(
      new Error("upstream ECONNREFUSED"),
      "req-4",
    );
    expect(res.status).toBe(503);
  });

  it("returns 200 for business NotFoundError (deterministic)", () => {
    const res = classifyWebhookError(
      new NotFoundError("product missing"),
      "req-5",
    );
    expect(res.status).toBe(200);
  });

  it("returns 200 for business ValidationError (deterministic)", () => {
    const res = classifyWebhookError(
      new ValidationError("bad metadata"),
      "req-6",
    );
    expect(res.status).toBe(200);
  });

  it("returns 500 for unexpected errors", () => {
    const res = classifyWebhookError(new Error("boom"), "req-7");
    expect(res.status).toBe(500);
  });

  infoSpy.mockRestore();
  errSpy.mockRestore();
});
