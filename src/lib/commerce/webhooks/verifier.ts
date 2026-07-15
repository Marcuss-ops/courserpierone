/**
 * src/lib/commerce/webhooks/verifier.ts
 *
 * Provider-agnostic HMAC-SHA256 signature verifier for incoming webhooks.
 *
 * Used by every payment provider that signs the request body with a
 * shared secret (currently Lemon Squeezy; future Stripe Connect, etc.).
 * Stripe signature format differs (t=…, v1=…) so provider-specific
 * verifier helpers will live in their own modules — this one is the
 * baseline `HMAC-SHA256(secret, body) → hex digest` pattern.
 *
 * Security:
 *   - `crypto.timingSafeEqual` compares byte-equal buffers WITHOUT
 *     short-circuiting, preventing timing-based signature recovery.
 *   - `Buffer.from(...).length` mismatch short-circuit is necessary
 *     because timingSafeEqual throws on length-mismatched buffers.
 *
 * Error contract:
 *   - Throws `HmacVerificationError` (typed by `code`) so callers
 *     (route handlers, tests) can branch on the failure reason.
 *   - Missing signature → MISSING_SIGNATURE (400).
 *   - Invalid secret config → MALFORMED_SIGNATURE (500).
 *   - Mismatch → INVALID_SIGNATURE (400).
 */

import crypto from "crypto";

export type HmacVerificationErrorCode =
  | "MISSING_SIGNATURE"
  | "MALFORMED_SIGNATURE"
  | "INVALID_SIGNATURE";

export class HmacVerificationError extends Error {
  public readonly code: HmacVerificationErrorCode;

  constructor(code: HmacVerificationErrorCode, message: string) {
    super(message);
    this.name = "HmacVerificationError";
    this.code = code;
  }
}

export interface VerifyHmacInput {
  /** Raw request body (string, exactly what arrived in the HTTP request). */
  rawBody: string;
  /** Signature header value (hex digest). `null` if header was absent. */
  signature: string | null | undefined;
  /** Provider-specific shared secret used to compute the HMAC. */
  secret: string;
}

/**
 * Verify HMAC-SHA256(rawBody, secret) === signature.
 *
 * Throws HmacVerificationError on any verification failure. The caller
 * decides the HTTP response shape (typically 400 for signature errors).
 */
export function verifyHmacSignature(input: VerifyHmacInput): void {
  const { rawBody, signature, secret } = input;

  if (!signature) {
    throw new HmacVerificationError(
      "MISSING_SIGNATURE",
      "Missing x-signature header",
    );
  }
  if (!secret) {
    throw new HmacVerificationError(
      "MALFORMED_SIGNATURE",
      "Webhook secret not configured",
    );
  }

  const hmac = crypto.createHmac("sha256", secret);
  const digest = hmac.update(rawBody).digest("hex");

  const expected = Buffer.from(digest, "utf8");
  const actual = Buffer.from(signature, "utf8");

  if (
    expected.length !== actual.length ||
    !crypto.timingSafeEqual(expected, actual)
  ) {
    throw new HmacVerificationError("INVALID_SIGNATURE", "Invalid signature");
  }
}
