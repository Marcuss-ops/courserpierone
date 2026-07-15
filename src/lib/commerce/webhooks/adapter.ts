/**
 * src/lib/commerce/webhooks/adapter.ts
 *
 * Thin HTTP transport layer for inbound webhooks.
 *
 * Responsibility: read the raw request body once (so downstream code
 * never re-reads) and pluck the signature header. NO business logic
 * lives here — no JSON parsing, no HMAC, no DB writes.
 *
 * The provider-scoped configuration (`signatureHeader`, `providerSlug`)
 * is passed by the route handler so the adapter stays provider-agnostic.
 */

import type { NextRequest } from "next/server";
import crypto from "crypto";

export interface WebhookAdapterConfig {
  /** HTTP header carrying the signature (e.g. "x-signature" for LS). */
  signatureHeader: string;
  /** Identifier for logging + delivery-id derivation. */
  providerSlug: "lemonsqueezy";
}

export interface RawWebhookBody {
  rawBody: string;
  signature: string | null;
}

/**
 * Reads the raw body once and extracts the signature header.
 * Provider-agnostic: signature header name is passed in by the caller.
 */
export async function readWebhookRequest(
  request: NextRequest,
  config: WebhookAdapterConfig,
): Promise<RawWebhookBody> {
  const rawBody = await request.text();
  const headerValue = request.headers.get(config.signatureHeader);
  return {
    rawBody,
    signature: headerValue ?? null,
  };
}

/**
 * Stable, per-request correlation id for structured logging.
 * Buffered as [randomUUID] for the duration of one POST handler.
 */
export function newRequestId(): string {
  return crypto.randomUUID();
}
