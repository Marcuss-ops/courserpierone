import crypto from "crypto";

/**
 * tests/e2e/fixtures/stripe-helpers.ts
 *
 * Webhook-only signing helpers for the legacy Stripe webhook handler at
 * `src/app/api/webhooks/stripe/route.ts`. Used by
 * `tests/e2e/checkout.stripe.spec.ts` (signed-payload regression test)
 * which exercises the verified-signature path only. This file
 * intentionally has NO Stripe SDK import: signers use only
 * STRIPE_WEBHOOK_SECRET for HMAC. (C1a cleanup removed the legacy
 * new-session Stripe provider and its helpers — `createStripeCheckoutSession`
 * was dead code; the runtime `new Stripe(...)` instance and SDK import
 * are no longer needed here.)
 */

function getWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error(
      "STRIPE_WEBHOOK_SECRET deve essere impostato per i test E2E"
    );
  }
  return secret;
}

/**
 * Build a synthetic `checkout.session.completed` event for the legacy
 * webhook handler. Only the fields below are actually read downstream:
 *   - id (`cs_test_*`) → order lookup via `providerOrderId` match
 *   - metadata.productId + metadata.userId + metadata.locale +
 *     metadata.email + metadata.customer_country
 *   - customer_email (used when metadata.email is missing)
 *   - amount_total + currency (coding the gross paid amount)
 *
 * @param session  A duck-typed Stripe.Checkout.Session shape; only
 *                 the fields above are consumed by the legacy handler.
 */
export function generateStripeWebhookPayload(
  session: unknown,
): Record<string, unknown> {
  return {
    id: `evt_${crypto.randomUUID().replace(/-/g, "")}`,
    object: "event",
    api_version: "2024-06-20",
    type: "checkout.session.completed",
    data: { object: session },
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 1,
    request: { id: `req_${crypto.randomUUID().replace(/-/g, "")}` },
  };
}

/**
 * Sign a webhook payload with the legacy Stripe HMAC scheme
 * (`t=<unix_ts>,v1=<hmac_sha256(timestamp.body)>`) using
 * STRIPE_WEBHOOK_SECRET. Returns the body-as-string alongside the
 * signature header so callers can POST verbatim.
 */
export function signStripeWebhookPayload(payload: unknown): {
  signature: string;
  body: string;
} {
  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const signed = crypto
    .createHmac("sha256", getWebhookSecret())
    .update(`${timestamp}.${body}`, "utf8")
    .digest("hex");
  const signature = `t=${timestamp},v1=${signed}`;
  return { signature, body };
}
