import { prisma } from "@/lib/db/prisma";
import {
  OUTBOX_HANDLER_REGISTRY,
  type OutboxEventType,
} from "@/lib/commerce/outbox/registry";
import {
  classifyOutboxError,
  outboxBackoffMs,
} from "@/lib/commerce/outbox/retry-policy";

export { OUTBOX_EVENT_TYPES } from "@/lib/commerce/outbox/registry";
export { OUTBOX_BASE_BACKOFF_MS } from "@/lib/commerce/outbox/retry-policy";
export type { OutboxEventType } from "@/lib/commerce/outbox/registry";

export type OutboxEventStatus =
  | "pending"
  | "processing"
  | "completed"
  | "retryable"
  | "dead_letter";

export const OUTBOX_PROCESSING_LEASE_MS = 5 * 60 * 1000;

interface ClaimedOutboxEvent {
  id: string;
  type: string;
  payload: unknown;
  attemptCount: number;
  maxAttempts: number;
}

export interface ProcessOutboxBatchOptions {
  limit?: number;
  now?: Date;
}

export interface ProcessOutboxBatchResult {
  claimed: number;
  completed: number;
  retryable: number;
  deadLettered: number;
}

function isKnownType(type: string): type is OutboxEventType {
  return Object.prototype.hasOwnProperty.call(OUTBOX_HANDLER_REGISTRY, type);
}

/** Execute one durable effect through its registered validated handler. */
export async function dispatchOutboxEvent(
  event: Pick<ClaimedOutboxEvent, "id" | "type" | "payload">,
): Promise<void> {
  if (!isKnownType(event.type)) {
    throw new Error(`Unknown outbox event type: ${event.type}`);
  }

  await OUTBOX_HANDLER_REGISTRY[event.type].handle(event.payload, event.id);
}

async function claimNextOutboxEvent(
  now: Date,
  limit: number,
): Promise<ClaimedOutboxEvent | null> {
  if (limit <= 0) return null;

  const leaseExpiredBefore = new Date(
    now.getTime() - OUTBOX_PROCESSING_LEASE_MS,
  );
  const skippedCandidateIds: string[] = [];

  // A concurrent worker can win between findFirst and updateMany. Retry the
  // selection rather than terminating the entire batch on that benign race.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const candidate = await prisma.outboxEvent.findFirst({
      where: {
        id: { notIn: skippedCandidateIds },
        OR: [
          {
            status: { in: ["pending", "retryable"] },
            nextAttemptAt: { lte: now },
          },
          { status: "processing", lockedAt: { lt: leaseExpiredBefore } },
        ],
      },
      orderBy: { nextAttemptAt: "asc" },
    });
    if (!candidate) return null;

    const claimed = await prisma.outboxEvent.updateMany({
      where: {
        id: candidate.id,
        OR: [
          {
            status: { in: ["pending", "retryable"] },
            nextAttemptAt: { lte: now },
          },
          { status: "processing", lockedAt: { lt: leaseExpiredBefore } },
        ],
      },
      data: {
        status: "processing",
        attemptCount: { increment: 1 },
        lockedAt: now,
        lastError: null,
      },
    });
    if (claimed.count === 1) {
      return {
        id: candidate.id,
        type: candidate.type,
        payload: candidate.payload,
        attemptCount: candidate.attemptCount + 1,
        maxAttempts: candidate.maxAttempts,
      };
    }
    skippedCandidateIds.push(candidate.id);
  }

  return null;
}

/** Process due events; safe to invoke from a cron route or long-lived worker. */
export async function processOutboxBatch(
  options: ProcessOutboxBatchOptions = {},
): Promise<ProcessOutboxBatchResult> {
  const limit = Math.max(1, Math.min(options.limit ?? 25, 100));
  const now = options.now ?? new Date();
  const result: ProcessOutboxBatchResult = {
    claimed: 0,
    completed: 0,
    retryable: 0,
    deadLettered: 0,
  };

  for (let i = 0; i < limit; i += 1) {
    const event = await claimNextOutboxEvent(now, limit - i);
    if (!event) break;
    result.claimed += 1;

    try {
      await dispatchOutboxEvent(event);
      await prisma.outboxEvent.updateMany({
        where: { id: event.id, status: "processing" },
        data: {
          status: "completed",
          processedAt: new Date(),
          lockedAt: null,
          lastError: null,
        },
      });
      result.completed += 1;
    } catch (error) {
      const classification = classifyOutboxError(error);
      const permanentlyFailed =
        !classification.retryable || event.attemptCount >= event.maxAttempts;
      const status: OutboxEventStatus = permanentlyFailed
        ? "dead_letter"
        : "retryable";
      const nextAttemptAt = permanentlyFailed
        ? null
        : new Date(now.getTime() + outboxBackoffMs(event.attemptCount));
      const message = error instanceof Error ? error.message : String(error);

      await prisma.outboxEvent.updateMany({
        where: { id: event.id, status: "processing" },
        data: {
          status,
          nextAttemptAt: nextAttemptAt ?? now,
          lockedAt: null,
          lastError: message.slice(0, 2048),
        },
      });
      if (permanentlyFailed) result.deadLettered += 1;
      else result.retryable += 1;
    }
  }

  return result;
}
