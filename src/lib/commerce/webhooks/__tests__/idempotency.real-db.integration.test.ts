// @vitest-environment node

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

type ReserveWebhookEvent = typeof import("@/lib/commerce/webhooks/idempotency")["reserveWebhookEvent"];
type HashWebhookPayload = typeof import("@/lib/commerce/webhooks/idempotency")["hashWebhookPayload"];

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const prisma = databaseUrl
  ? new PrismaClient({ datasources: { db: { url: databaseUrl } } })
  : null;
const describeIfDb = prisma ? describe : describe.skip;
const deliveryId = `integration-concurrent-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const rawBody = JSON.stringify({
  meta: { event_name: "order_created" },
  data: { id: deliveryId },
});

// The application singleton must use the same database as this fixture.
if (databaseUrl) process.env.DATABASE_URL = databaseUrl;

let reserveWebhookEvent: ReserveWebhookEvent;
let hashWebhookPayload: HashWebhookPayload;

async function cleanup() {
  if (!prisma) return;
  await prisma.processedWebhook.deleteMany({ where: { deliveryId } });
}

describeIfDb("webhook reservation concurrency — real PostgreSQL", () => {
  beforeAll(async () => {
    const idempotency = await import("@/lib/commerce/webhooks/idempotency");
    reserveWebhookEvent = idempotency.reserveWebhookEvent;
    hashWebhookPayload = idempotency.hashWebhookPayload;
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await prisma?.$disconnect();
  });

  it("persists one reservation when duplicate deliveries race", async () => {
    if (!prisma) throw new Error("real Prisma is required");

    const input = {
      provider: "lemonsqueezy" as const,
      deliveryId,
      eventType: "order_created",
      rawBody,
    };
    const results = await Promise.all([
      reserveWebhookEvent(input),
      reserveWebhookEvent(input),
    ]);

    expect(results.filter((result) => result.acquired)).toHaveLength(1);
    expect(results.filter((result) => !result.acquired)).toHaveLength(1);

    const rows = await prisma.processedWebhook.findMany({
      where: { deliveryId },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      provider: "lemonsqueezy",
      eventType: "order_created",
      status: "processing",
      payloadHash: hashWebhookPayload(rawBody),
      attemptCount: 1,
    });
  });
});
