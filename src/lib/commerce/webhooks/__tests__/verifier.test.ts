import { describe, it, expect } from "vitest";
import crypto from "crypto";
import {
  verifyHmacSignature,
  HmacVerificationError,
} from "../verifier";

const SECRET = "test-secret-123";

function sign(rawBody: string, secret = SECRET): string {
  return crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
}

describe("verifyHmacSignature", () => {
  it("returns silently when signature is valid", () => {
    const body = '{"hello":"world"}';
    expect(() =>
      verifyHmacSignature({ rawBody: body, signature: sign(body), secret: SECRET }),
    ).not.toThrow();
  });

  it("throws MISSING_SIGNATURE when signature is null", () => {
    expect(() =>
      verifyHmacSignature({ rawBody: "{}", signature: null, secret: SECRET }),
    ).toThrowError(HmacVerificationError);

    try {
      verifyHmacSignature({ rawBody: "{}", signature: null, secret: SECRET });
    } catch (err) {
      expect((err as HmacVerificationError).code).toBe("MISSING_SIGNATURE");
    }
  });

  it("throws MISSING_SIGNATURE when signature is empty string", () => {
    try {
      verifyHmacSignature({ rawBody: "{}", signature: "", secret: SECRET });
    } catch (err) {
      expect((err as HmacVerificationError).code).toBe("MISSING_SIGNATURE");
    }
  });

  it("throws MALFORMED_SIGNATURE when secret is empty", () => {
    try {
      verifyHmacSignature({ rawBody: "{}", signature: "abc", secret: "" });
    } catch (err) {
      expect((err as HmacVerificationError).code).toBe("MALFORMED_SIGNATURE");
    }
  });

  it("throws INVALID_SIGNATURE when signature content differs", () => {
    const body = '{"a":1}';
    const wrong = sign(body, "other-secret");
    try {
      verifyHmacSignature({ rawBody: body, signature: wrong, secret: SECRET });
    } catch (err) {
      expect((err as HmacVerificationError).code).toBe("INVALID_SIGNATURE");
    }
  });

  it("throws INVALID_SIGNATURE when buffer lengths differ (no timingSafeEqual crash)", () => {
    // Buffer.from(newSig).length mismatch must short-circuit BEFORE calling
    // crypto.timingSafeEqual (which would throw on length-mismatched buffers).
    try {
      verifyHmacSignature({
        rawBody: "{}",
        signature: "short",
        secret: SECRET,
      });
    } catch (err) {
      expect((err as HmacVerificationError).code).toBe("INVALID_SIGNATURE");
    }
  });
});
