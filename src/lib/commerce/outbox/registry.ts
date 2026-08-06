import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { sendPurchaseConfirmation } from "@/lib/commerce/shared/email";
import {
  createNotification,
  NOTIFICATION_TYPES,
} from "@/lib/notifications/create-notification";

const purchaseEmailPayloadSchema = z
  .object({
    email: z.string().email(),
    productSlug: z.string().min(1),
    courseUrl: z.string().min(1),
    locale: z.string().min(1),
    ebookDownloadUrl: z.string().min(1),
  })
  .strict();

const purchaseAnalyticsPayloadSchema = z
  .object({
    productId: z.string().nullable().optional(),
    productSlug: z.string().min(1),
    providerProductId: z.string().nullable().optional(),
    userId: z.string().min(1),
    channelId: z.string().nullable().optional(),
    provider: z.string().min(1),
    amount: z.number().int().nonnegative(),
    currency: z.string().min(1),
    providerOrderId: z.string().min(1).optional(),
  })
  .strict();

const purchaseNotificationPayloadSchema = z
  .object({
    recipientId: z.string().min(1),
    entityId: z.string().min(1),
    type: z.enum(NOTIFICATION_TYPES),
    title: z.string().min(1).max(200),
    body: z.string().min(1),
    link: z.string().min(1),
  })
  .strict();

const purchaseAbandonedRecoveryPayloadSchema = z
  .object({
    email: z.string().email(),
    productId: z.string().min(1),
  })
  .strict();

function createHandler<T>(
  schema: z.ZodType<T>,
  handler: (payload: T, eventId: string) => Promise<void>,
) {
  return {
    schema,
    async handle(payload: unknown, eventId: string): Promise<void> {
      const parsed = schema.parse(payload);
      await handler(parsed, eventId);
    },
  };
}

const EMAIL_CHANNEL = "email";
const EMAIL_PROCESSING_LEASE_MS = 5 * 60 * 1000;

function isDeliveryAttemptConflict(error: unknown): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== "P2002"
  ) {
    return false;
  }

  const target = error.meta?.target;
  if (Array.isArray(target)) {
    return target.length === 2 &&
      target.includes("outboxEventId") &&
      target.includes("channel");
  }

  return target === "outboxEventId_channel" ||
    target === "OutboxDeliveryAttempt_outboxEventId_channel_key";
}

async function claimEmailDelivery(eventId: string): Promise<boolean> {
  const now = new Date();
  try {
    await prisma.outboxDeliveryAttempt.create({
      data: {
        outboxEventId: eventId,
        channel: EMAIL_CHANNEL,
        status: "processing",
        attemptCount: 1,
        lockedAt: now,
      },
    });
    return true;
  } catch (error) {
    if (!isDeliveryAttemptConflict(error)) throw error;
  }

  const existing = await prisma.outboxDeliveryAttempt.findUnique({
    where: {
      outboxEventId_channel: {
        outboxEventId: eventId,
        channel: EMAIL_CHANNEL,
      },
    },
  });
  if (!existing) return false;

  // A sent or in-flight attempt is authoritative. In particular, do not
  // resend a stale processing row: the worker may have crashed after SMTP
  // accepted the message but before `sent` was committed.
  if (existing.status === "sent" || existing.status === "uncertain") {
    return false;
  }

  if (
    existing.status === "processing" &&
    existing.lockedAt &&
    existing.lockedAt.getTime() > now.getTime() - EMAIL_PROCESSING_LEASE_MS
  ) {
    return false;
  }

  if (existing.status === "processing") {
    // A stale processing attempt crossed an unknown provider boundary. Do not
    // resend automatically; make the ambiguity explicit for reconciliation.
    await prisma.outboxDeliveryAttempt.updateMany({
      where: { id: existing.id, status: "processing" },
      data: {
        status: "uncertain",
        lockedAt: null,
        lastError: "Delivery outcome unknown after processing lease expired",
      },
    });
    return false;
  }

  const reclaimed = await prisma.outboxDeliveryAttempt.updateMany({
    where: {
      id: existing.id,
      status: "failed",
    },
    data: {
      status: "processing",
      attemptCount: { increment: 1 },
      lockedAt: now,
      lastError: null,
    },
  });
  return reclaimed.count === 1;
}

async function markEmailSent(attemptId: string): Promise<void> {
  await prisma.outboxDeliveryAttempt.updateMany({
    where: { id: attemptId, status: "processing" },
    data: {
      status: "sent",
      sentAt: new Date(),
      lockedAt: null,
      lastError: null,
    },
  });
}

async function markEmailFailed(attemptId: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  await prisma.outboxDeliveryAttempt.updateMany({
    where: { id: attemptId, status: "processing" },
    data: {
      status: "failed",
      lockedAt: null,
      lastError: message.slice(0, 2048),
    },
  });
}

const isOutboxEffectAlreadyDelivered = (error: unknown): boolean => {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== "P2002"
  ) {
    return false;
  }

  const target = error.meta?.target;
  if (Array.isArray(target)) {
    return target.length === 1 && target[0] === "outboxEventId";
  }

  return target === "outboxEventId" ||
    target === "Notification_outboxEventId_key" ||
    target === "AnalyticEvent_outboxEventId_key";
};

/**
 * Single source of truth for durable commerce outbox effects.
 *
 * Each entry owns both the runtime payload contract and the effect handler.
 * `createHandler` parses before invoking the effect, so untrusted JSON from
 * Prisma cannot reach a handler through a TypeScript cast alone.
 */
export const OUTBOX_HANDLER_REGISTRY = {
  purchase_email: createHandler(
    purchaseEmailPayloadSchema,
    async (payload, eventId) => {
      const claimed = await claimEmailDelivery(eventId);
      if (!claimed) return;

      const attempt = await prisma.outboxDeliveryAttempt.findUnique({
        where: {
          outboxEventId_channel: {
            outboxEventId: eventId,
            channel: EMAIL_CHANNEL,
          },
        },
        select: { id: true },
      });
      if (!attempt) return;

      let sentToProvider = false;
      try {
        const sent = await sendPurchaseConfirmation(
          payload.email,
          payload.productSlug,
          payload.courseUrl,
          payload.locale,
          payload.ebookDownloadUrl,
        );
        if (sent === false) {
          const deliveryError = new Error("Purchase confirmation email was not delivered");
          (deliveryError as Error & { code?: string }).code = "EMAIL_SEND_FAILED";
          throw deliveryError;
        }
        sentToProvider = true;
        await markEmailSent(attempt.id);
      } catch (error) {
        // Once the provider accepted the message, do not downgrade the
        // attempt to failed if the worker crashes while persisting `sent`.
        // A retry sees `processing` and skips the provider call, avoiding a
        // duplicate email at the cost of an observable reconciliation row.
        if (!sentToProvider) await markEmailFailed(attempt.id, error);
        throw error;
      }
    },
  ),

  purchase_analytics: createHandler(
    purchaseAnalyticsPayloadSchema,
    async (payload, eventId) => {
      try {
        await prisma.analyticEvent.create({
          data: {
            productId: payload.productId ?? null,
            productSlug: payload.productSlug,
            providerProductId: payload.providerProductId ?? null,
            eventType: "purchase",
            outboxEventId: eventId,
            ...(payload.channelId ? { channelId: payload.channelId } : {}),
            metadata: JSON.stringify({
              provider: payload.provider,
              amount: payload.amount,
              currency: payload.currency,
              ...(payload.providerOrderId
                ? { providerOrderId: payload.providerOrderId }
                : {}),
            }),
            userId: payload.userId,
          },
        });
      } catch (error) {
        // The outbox event ID is unique; replaying an already-delivered
        // analytics event is a successful no-op.
        if (!isOutboxEffectAlreadyDelivered(error)) throw error;
      }
    },
  ),

  purchase_notification: createHandler(
    purchaseNotificationPayloadSchema,
    async (payload, eventId) => {
      try {
        await createNotification({
          ...payload,
          outboxEventId: eventId,
          throwOnError: true,
        });
      } catch (error) {
        // Notification.outboxEventId is unique; a replay is already complete.
        if (!isOutboxEffectAlreadyDelivered(error)) throw error;
      }
    },
  ),

  purchase_abandoned_recovery: createHandler(
    purchaseAbandonedRecoveryPayloadSchema,
    async (payload) => {
      await prisma.abandonedCheckout.updateMany({
        where: {
          email: payload.email,
          productId: payload.productId,
          status: "pending",
        },
        data: { status: "recovered" },
      });
    },
  ),
} as const;

export const OUTBOX_EVENT_TYPES = Object.freeze(
  Object.keys(OUTBOX_HANDLER_REGISTRY) as (keyof typeof OUTBOX_HANDLER_REGISTRY)[],
);

export type OutboxEventType = keyof typeof OUTBOX_HANDLER_REGISTRY;
export type OutboxHandler = (typeof OUTBOX_HANDLER_REGISTRY)[OutboxEventType];
