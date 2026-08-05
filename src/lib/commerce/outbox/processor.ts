import { prisma } from "@/lib/db/prisma";
import { sendPurchaseConfirmation } from "@/lib/commerce/shared/email";
import { createNotification, type NotificationType } from "@/lib/notifications/create-notification";
import { classifyAgentError } from "@/domains/automation/agent-run-retry-policy";
import { Prisma } from "@prisma/client";

export const OUTBOX_EVENT_TYPES = [
  "purchase_email",
  "purchase_analytics",
  "purchase_notification",
  "purchase_abandoned_recovery",
] as const;

export type OutboxEventType = (typeof OUTBOX_EVENT_TYPES)[number];
export type OutboxEventStatus =
  | "pending"
  | "processing"
  | "completed"
  | "retryable"
  | "dead_letter";

export const OUTBOX_BASE_BACKOFF_MS = 5_000;
export const OUTBOX_PROCESSING_LEASE_MS = 5 * 60 * 1000;

interface PurchaseEmailPayload {
  email: string;
  productSlug: string;
  courseUrl: string;
  locale: string;
  ebookDownloadUrl: string;
}

interface PurchaseAnalyticsPayload {
  productSlug: string;
  userId: string;
  channelId?: string | null;
  provider: string;
  amount: number;
  currency: string;
  providerOrderId?: string;
}

interface PurchaseNotificationPayload {
  recipientId: string;
  entityId: string;
  type: NotificationType;
  title: string;
  body: string;
  link: string;
}

interface PurchaseAbandonedRecoveryPayload {
  email: string;
  productId: string;
}

type OutboxPayload =
  | PurchaseEmailPayload
  | PurchaseAnalyticsPayload
  | PurchaseNotificationPayload
  | PurchaseAbandonedRecoveryPayload;

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

function asPayload(value: unknown): OutboxPayload {
  if (!value || typeof value !== "object") {
    throw new Error("Outbox payload must be an object");
  }
  return value as OutboxPayload;
}

function backoffMs(attemptCount: number): number {
  return OUTBOX_BASE_BACKOFF_MS * 2 ** Math.max(0, attemptCount - 1);
}

function isKnownType(type: string): type is OutboxEventType {
  return (OUTBOX_EVENT_TYPES as readonly string[]).includes(type);
}

/** Execute one durable effect. Handlers are deliberately at-least-once safe. */
export async function dispatchOutboxEvent(
  event: Pick<ClaimedOutboxEvent, "id" | "type" | "payload">,
): Promise<void> {
  if (!isKnownType(event.type)) {
    throw new Error(`Unknown outbox event type: ${event.type}`);
  }

  const payload = asPayload(event.payload);
  switch (event.type) {
    case "purchase_email": {
      const input = payload as PurchaseEmailPayload;
      const sent = await sendPurchaseConfirmation(
        input.email,
        input.productSlug,
        input.courseUrl,
        input.locale,
        input.ebookDownloadUrl,
      );
      if (sent === false) {
        const deliveryError = new Error("Purchase confirmation email was not delivered");
        (deliveryError as Error & { code?: string }).code = "EMAIL_SEND_FAILED";
        throw deliveryError;
      }
      return;
    }
    case "purchase_analytics": {
      const input = payload as PurchaseAnalyticsPayload;
      try {
        await prisma.analyticEvent.create({
          data: {
            productId: input.productSlug,
            eventType: "purchase",
            outboxEventId: event.id,
            ...(input.channelId ? { channelId: input.channelId } : {}),
            metadata: JSON.stringify({
            provider: input.provider,
            amount: input.amount,
            currency: input.currency,
            ...(input.providerOrderId
              ? { providerOrderId: input.providerOrderId }
              : {}),
          }),
            userId: input.userId,
          },
        });
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
          throw error;
        }
      }
      return;
    }
    case "purchase_notification": {
      const input = payload as PurchaseNotificationPayload;
      try {
        await createNotification({
          ...input,
          outboxEventId: event.id,
          throwOnError: true,
        });
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
          throw error;
        }
      }
      return;
    }
    case "purchase_abandoned_recovery": {
      const input = payload as PurchaseAbandonedRecoveryPayload;
      await prisma.abandonedCheckout.updateMany({
        where: {
          email: input.email,
          productId: input.productId,
          status: "pending",
        },
        data: { status: "recovered" },
      });
      return;
    }
  }
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
      const classification = classifyAgentError(error);
      const permanentlyFailed =
        !classification.retryable || event.attemptCount >= event.maxAttempts;
      const status: OutboxEventStatus = permanentlyFailed
        ? "dead_letter"
        : "retryable";
      const nextAttemptAt = permanentlyFailed
        ? null
        : new Date(now.getTime() + backoffMs(event.attemptCount));
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
