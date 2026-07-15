/**
 * src/lib/commerce/webhooks/error-classifier.ts
 *
 * Pure functions that classify error types for HTTP response shaping.
 * Provider-agnostic. Zero I/O.
 *
 * Used by route handlers to decide:
 *   - 503 retryable (transient upstream) — keep evidence for replay.
 *   - 200 ack (deterministic business error) — stop provider retries.
 *   - 400 (parse/HMAC/security) — stop provider retries, no trace.
 *   - 500 (unexpected) — log + alert, possibly noisy retry.
 */

import { HmacVerificationError } from "./verifier";
import { NotFoundError, ValidationError } from "@/lib/errors";

/**
 * Provider-decided "ack with no side effects" sentinel (e.g. LS sends
 * a ping with no meta.event_name to keep the webhook URL alive). The
 * route handler responds 200 immediately without recording the
 * delivery in ProcessedWebhook (so legitimate future pings aren't
 * gated by an idempotency entry).
 */
export class WebhookAckError extends Error {
  public readonly code = "WEBHOOK_ACK" as const;
  constructor(message: string) {
    super(message);
    this.name = "WebhookAckError";
  }
}

/**
 * Transport-level JSON parse failure (raised by `provider.parseWebhook`).
 * Subclasses ValidationError so callers that catch ValidationError
 * still match it, but the specialized type lets the route return
 * 400 (no retry) rather than 200 ack.
 */
export class InvalidJsonError extends ValidationError {
  constructor(message = "Invalid JSON body") {
    super(message);
    this.name = "InvalidJsonError";
  }
}

/**
 * Substring patterns that signal a transient error worth retrying.
 * Order matters — first match wins (kept simple; \b-free intentional).
 */
const TRANSIENT_PATTERNS = [
  "ECONNREFUSED",
  "ETIMEDOUT",
  "timeout",
  "rate limit",
  "429",
  "503",
  "ENOTFOUND",
  "ECONNRESET",
] as const;

/**
 * Returns true when the error message matches a known transient pattern.
 * Catches both Error.message and thrown string literals.
 */
export function isTransientError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return TRANSIENT_PATTERNS.some((p) => msg.includes(p));
}

/**
 * Returns true when the error is a deterministic business error that
 * should be acknowledged (200) so the provider stops retrying.
 *
 * NotFoundError: resource missing — replay won't produce it.
 * ValidationError: bad payload — replay is identical → infinite loop.
 */
export function isAcknowledgableError(
  error: unknown,
): error is NotFoundError | ValidationError {
  return error instanceof NotFoundError || error instanceof ValidationError;
}

/**
 * Returns true when the error is a security/parse error that warrants
 * a 400 response (no retry, don't even crash the provider's retry queue
 * by sending back 5xx — that's noisy).
 *
 * HmacVerificationError: signature mismatch / missing / malformed.
 * InvalidJsonError: malformed webhook body from `provider.parseWebhook`.
 *
 * NOTE: a "business-side" ValidationError (e.g. one thrown by
 * `processOrder` for an invalid upstream input) is NOT classified here.
 * It falls through to `isAcknowledgableError` → 200 ack. This is the
 * distinction the route depends on for correct retry behavior:
 *   - Parse errors are deterministic → no retry.
 *   - Business errors are deterministic (replay is identical) → no retry.
 *   - Transient errors may recover on retry → 503.
 */
export function isSecurityOrParseError(
  error: unknown,
): error is HmacVerificationError | InvalidJsonError {
  return (
    error instanceof HmacVerificationError || error instanceof InvalidJsonError
  );
}

/**
 * Returns true for the LS-style "ack without processing" sentinel.
 * Route handler converts these to 200 immediately.
 */
export function isAckError(error: unknown): error is WebhookAckError {
  return error instanceof WebhookAckError;
}

// `safeStringify` removed in webhook extraction refactor (Phase 2 followup):
// was used only by the old verbose payload-summary log inside `route.ts`.
// The slim route never logs unserializable values. Re-add with a clear
// `@reserved` tag only if a future verbose-error log path needs it.
