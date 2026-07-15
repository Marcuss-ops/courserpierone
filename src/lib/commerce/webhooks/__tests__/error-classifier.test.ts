import { describe, it, expect } from "vitest";
import {
  isTransientError,
  isAcknowledgableError,
  isSecurityOrParseError,
  isAckError,
  WebhookAckError,
  InvalidJsonError,
} from "../error-classifier";
import { HmacVerificationError } from "../verifier";
import { NotFoundError, ValidationError } from "@/lib/errors";

describe("isTransientError", () => {
  it.each([
    "ECONNREFUSED blah",
    "ETIMEDOUT upcall",
    "timeout after 30s",
    "rate limit exceeded",
    "service returned 429",
    "upstream 503",
    "ENOTFOUND api.lemonsqueezy.com",
    "ECONNRESET by peer",
  ])("matches transient pattern: %s", (msg) => {
    expect(isTransientError(new Error(msg))).toBe(true);
  });

  it.each([
    "Product not found",
    "Invalid signature",
    "User input validation failed",
  ])("does NOT match transient pattern: %s", (msg) => {
    expect(isTransientError(new Error(msg))).toBe(false);
  });

  it("handles thrown string literals", () => {
    expect(isTransientError("plain timeout string")).toBe(true);
  });
});

describe("isAcknowledgableError", () => {
  it("matches NotFoundError", () => {
    expect(isAcknowledgableError(new NotFoundError("missing"))).toBe(true);
  });

  it("matches ValidationError", () => {
    expect(isAcknowledgableError(new ValidationError("bad"))).toBe(true);
  });

  it("rejects generic Error", () => {
    expect(isAcknowledgableError(new Error("plain"))).toBe(false);
  });
});

describe("isSecurityOrParseError", () => {
  it("matches HmacVerificationError", () => {
    expect(
      isSecurityOrParseError(
        new HmacVerificationError("INVALID_SIGNATURE", "nope"),
      ),
    ).toBe(true);
  });

  it("matches InvalidJsonError (transport-level parse failure)", () => {
    expect(isSecurityOrParseError(new InvalidJsonError())).toBe(true);
  });

  it("rejects plain ValidationError (business-side falls to isAcknowledgableError → 200 ack)", () => {
    expect(isSecurityOrParseError(new ValidationError("bad"))).toBe(false);
  });

  it("rejects NotFoundError (handled as 200-ack, not 400)", () => {
    expect(isSecurityOrParseError(new NotFoundError("missing"))).toBe(false);
  });

  it("rejects generic Error", () => {
    expect(isSecurityOrParseError(new Error("boom"))).toBe(false);
  });
});

describe("isAckError", () => {
  it("matches WebhookAckError", () => {
    expect(isAckError(new WebhookAckError("ping"))).toBe(true);
  });

  it("rejects All other errors", () => {
    expect(isAckError(new Error("plain"))).toBe(false);
    expect(isAckError(null)).toBe(false);
    expect(isAckError(undefined)).toBe(false);
  });
});

// safeStringify describe removed with the function. See
// `error-classifier.ts` for removal rationale.
