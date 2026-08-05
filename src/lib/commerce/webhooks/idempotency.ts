/**
 * DB-backed webhook idempotency and reservation state machine.
 *
 * A delivery is reserved with one INSERT before business logic runs. The
 * unique deliveryId constraint makes that INSERT the concurrency boundary:
 * exactly one concurrent request receives `acquired: true`.
 *
 * Lifecycle:
 *   processing -> completed
 *   processing -> failed      (deterministic/non-retryable failure)
 *   processing -> retryable   (transient failure; next delivery may reserve)
 *   retryable  -> processing  (conditional UPDATE, also atomic)
 */

import crypto from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";

export type WebhookProviderId = "lemonsqueezy";
export type WebhookProcessingStatus =
  | "processing"
  | "completed"
  | "failed"
  | "retryable";

/** A processing lease is recoverable after a worker crash. */
export const WEBHOOK_PROCESSING_LEASE_MS = 5 * 60 * 1000;

/** A delivery ID was reused with a different request body. */
export class WebhookPayloadMismatchError extends Error {
  readonly code = "WEBHOOK_PAYLOAD_MISMATCH" as const;

  constructor(deliveryId: string) {
    super(`Webhook payload changed for delivery ${deliveryId}`);
    this.name = "WebhookPayloadMismatchError";
  }
}

export interface WebhookReservationInput {
  provider: WebhookProviderId;
  deliveryId?: string | null;
  eventType: string;
  rawBody: string;
}

export interface WebhookReservation {
  acquired: boolean;
  deliveryId: string;
  status: WebhookProcessingStatus;
  payloadHash: string;
}

/** SHA-256 fingerprint used to audit and compare duplicate deliveries. */
export function hashWebhookPayload(rawBody: string): string {
  return crypto.createHash("sha256").update(rawBody, "utf8").digest("hex");
}

/**
 * Returns the provider delivery ID or a deterministic payload-based fallback.
 * The event type is included so two event kinds with the same body remain
 * distinguishable; identical retries always produce the same ID.
 */
export function deriveStableDeliveryId(input: {
  provider: WebhookProviderId;
  deliveryId?: string | null;
  eventType: string;
  rawBody: string;
}): string {
  const explicit = input.deliveryId?.trim();
  if (explicit) return explicit;

  const digest = hashWebhookPayload(input.rawBody).slice(0, 48);
  return `${input.provider}-fallback-${input.eventType}-${digest}`;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

/**
 * Atomically reserve a delivery before invoking webhook business logic.
 *
 * A duplicate completed/failed/processing delivery is acknowledged without
 * running the processor again. A retryable row can be claimed once by a
 * conditional update; concurrent retries still produce only one winner.
 */
export async function reserveWebhookEvent(
  input: WebhookReservationInput,
): Promise<WebhookReservation> {
  const deliveryId = deriveStableDeliveryId(input);
  const payloadHash = hashWebhookPayload(input.rawBody);

  try {
    await prisma.processedWebhook.create({
      data: {
        provider: input.provider,
        deliveryId,
        eventType: input.eventType,
        status: "processing",
        payloadHash,
        attemptCount: 1,
        processingStartedAt: new Date(),
      },
    });

    return {
      acquired: true,
      deliveryId,
      status: "processing",
      payloadHash,
    };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
  }

  // The unique insert lost a race. Retryable rows, and processing rows whose
  // lease expired after a worker crash, may be reclaimed. The conditional
  // UPDATE makes this second reservation boundary atomic too.
  const processingLeaseExpiredBefore = new Date(
    Date.now() - WEBHOOK_PROCESSING_LEASE_MS,
  );
  const reclaimed = await prisma.processedWebhook.updateMany({
    where: {
      deliveryId,
      payloadHash,
      OR: [
        { status: "retryable" },
        {
          status: "processing",
          processingStartedAt: { lt: processingLeaseExpiredBefore },
        },
      ],
    },
    data: {
      status: "processing",
      payloadHash,
      eventType: input.eventType,
      attemptCount: { increment: 1 },
      lastError: null,
      processingStartedAt: new Date(),
      failedAt: null,
    },
  });

  if (reclaimed.count === 1) {
    return {
      acquired: true,
      deliveryId,
      status: "processing",
      payloadHash,
    };
  }

  const existing = await prisma.processedWebhook.findUnique({
    where: { deliveryId },
    select: { status: true, payloadHash: true },
  });

  if (existing?.payloadHash && existing.payloadHash !== payloadHash) {
    throw new WebhookPayloadMismatchError(deliveryId);
  }

  return {
    acquired: false,
    deliveryId,
    status: (existing?.status ?? "processing") as WebhookProcessingStatus,
    payloadHash,
  };
}

export interface CompleteWebhookEventInput {
  deliveryId: string;
  payloadHash?: string;
}

/** Mark the currently reserved delivery as successfully processed. */
export async function completeWebhookEvent(
  input: CompleteWebhookEventInput,
): Promise<void> {
  await prisma.processedWebhook.update({
    where: { deliveryId: input.deliveryId },
    data: {
      status: "completed",
      payloadHash: input.payloadHash,
      processedAt: new Date(),
      completedAt: new Date(),
      failedAt: null,
      lastError: null,
    },
  });
}

export interface FailWebhookEventInput {
  deliveryId: string;
  error: unknown;
  retryable: boolean;
}

/**
 * Persist the outcome so transient failures can be retried while deterministic
 * failures remain terminal and visible for operational inspection.
 */
export async function failWebhookEvent(
  input: FailWebhookEventInput,
): Promise<void> {
  const message = input.error instanceof Error
    ? input.error.message
    : String(input.error);

  await prisma.processedWebhook.update({
    where: { deliveryId: input.deliveryId },
    data: {
      status: input.retryable ? "retryable" : "failed",
      lastError: message.slice(0, 2000),
      failedAt: new Date(),
    },
  });
}

/**
 * Compatibility read for existing consumers. New routes must reserve first;
 * this helper is intentionally a read-only inspection of the state machine.
 */
export async function wasAlreadyProcessed(input: {
  provider: WebhookProviderId;
  deliveryId: string;
}): Promise<boolean> {
  const row = await prisma.processedWebhook.findUnique({
    where: { deliveryId: input.deliveryId },
    select: { status: true },
  });
  return row?.status === "completed" || row?.status === "failed";
}
