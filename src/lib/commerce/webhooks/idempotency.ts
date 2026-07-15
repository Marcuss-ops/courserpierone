/**
 * src/lib/commerce/webhooks/idempotency.ts
 *
 * DB-backed idempotency gate for inbound webhooks.
 *
 * Stored in the `ProcessedWebhook` Prisma table (deliveryId uniques across
 * providers). Reading returns whether a delivery was already processed;
 * writing tolerates the concurrent-delivery race (P2002 = another worker
 * recorded it first → silently treated as success).
 *
 * Provider-scoped type (currently only "lemonsqueezy") — fetch new
 * providers' constants from env registry when adding Stripe Connect etc.
 */

import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";

export type WebhookProviderId = "lemonsqueezy";

export interface CheckDeliveryInput {
  provider: WebhookProviderId;
  deliveryId: string;
}

/**
 * Returns true if `deliveryId` was already processed for the given provider.
 * Used BEFORE running business logic to short-circuit re-deliveries.
 */
export async function wasAlreadyProcessed(
  input: CheckDeliveryInput,
): Promise<boolean> {
  // Schema (prisma/schema.prisma): ProcessedWebhook has a single
  // `@unique` on `deliveryId`. The composite (provider, deliveryId)
  // constraint would be a schema change we don't want to take on in
  // the extraction refactor — provider-prefixed deliveryIds already
  // avoid collisions across providers (LS uses `LS-<id>-<event>`).
  const row = await prisma.processedWebhook.findUnique({
    where: { deliveryId: input.deliveryId },
  });
  return row !== null;
}

export interface RecordDeliveryInput {
  provider: WebhookProviderId;
  deliveryId: string;
  eventType: string;
}

/**
 * Record a successful delivery. P2002 (unique constraint violation) means
 * a concurrent worker beat us to it — safe to acknowledge the duplicate.
 *
 * Any other error is logged + re-thrown so the route handler decides the
 * proper HTTP response (typically 500).
 */
export async function recordDelivery(
  input: RecordDeliveryInput,
): Promise<void> {
  try {
    await prisma.processedWebhook.create({
      data: {
        provider: input.provider,
        deliveryId: input.deliveryId,
        eventType: input.eventType,
      },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      // Concurrent delivery already recorded — safe to ack as success.
      return;
    }
    throw err;
  }
}
