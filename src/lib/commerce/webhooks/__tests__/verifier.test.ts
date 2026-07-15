import { describe, it, expect } from "vitest";
import crypto from "crypto";
import {
  verifyHmacSignature,
  HmacVerificationError,
} from "@/lib/commerce/webhooks/verifier";

const SECRET = "test_secret_abc";
const BODY = '{"hello":"world"}';

function sign(body: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

describe("verifyHmacSignature", () => {
  it("returns void on matching signature", () => {
    expect(() =>
      verifyHmacSignature({
        rawBody: BODY,
        signature: sign(BODY, SECRET),
        secret: SECRET,
      }),
    ).not.toThrow();
  });

  it("throws MISSING_SIGNATURE when signature is null", () => {
    try {
      verifyHmacSignature({ rawBody: BODY, signature: null, secret: SECRET });
      expect.fail("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(HmacVerificationError);
      expect((err as HmacVerificationError).code).toBe("MISSING_SIGNATURE");
    }
  });

  it("throws MISSING_SIGNATURE when signature is undefined", () => {
    try {
      verifyHmacSignature({
        rawBody: BODY,
        signature: undefined,
        secret: SECRET,
      });
      expect.fail("expected throw");
    } catch (err) {
      expect((err as HmacVerificationError).code).toBe("MISSING_SIGNATURE");
    }
  });

  it("throws MALFORMED_SIGNATURE when secret is empty", () => {
    try {
      verifyHmacSignature({
        rawBody: BODY,
        signature: sign(BODY, SECRET),
        secret: "",
      });
      expect.fail("expected throw");
    } catch (err) {
      expect((err as HmacVerificationError).code).toBe("MALFORMED_SIGNATURE");
    }
  });

  it("throws INVALID_SIGNATURE on HMAC mismatch (correct length)", () => {
    try {
      verifyHmacSignature({
        rawBody: BODY,
        signature: "0".repeat(64),
        secret: SECRET,
      });
      expect.fail("expected throw");
    } catch (err) {
      expect((err as HmacVerificationError).code).toBe("INVALID_SIGNATURE");
    }
  });

  it("throws INVALID_SIGNATURE on length mismatch (timingSafeEqual guard)", () => {
    // timingSafeEqual would throw on length-mismatched buffers — the
    // verifier must short-circuit to INVALID_SIGNATURE before that.
    try {
      verifyHmacSignature({ rawBody: BODY, signature: "abc", secret: SECRET });
      expect.fail("expected throw");
    } catch (err) {
      expect((err as HmacVerificationError).code).toBe("INVALID_SIGNATURE");
    }
  });
});
