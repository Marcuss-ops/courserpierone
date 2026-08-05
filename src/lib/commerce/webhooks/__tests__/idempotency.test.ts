import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    processedWebhook: {
      create: vi.fn(),
      updateMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));

import {
  completeWebhookEvent,
  deriveStableDeliveryId,
  failWebhookEvent,
  hashWebhookPayload,
  reserveWebhookEvent,
  WebhookPayloadMismatchError,
} from "@/lib/commerce/webhooks/idempotency";

const input = {
  provider: "lemonsqueezy" as const,
  deliveryId: "LS-1-order_created",
  eventType: "order_created",
  rawBody: '{"data":{"id":"1"}}',
};

function uniqueViolation() {
  return new Prisma.PrismaClientKnownRequestError(
    "Unique constraint failed on the fields: (`deliveryId`)",
    { code: "P2002", clientVersion: "5.22.0" },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.processedWebhook.updateMany.mockResolvedValue({ count: 0 });
  mockPrisma.processedWebhook.findUnique.mockResolvedValue({
    status: "processing",
    payloadHash: "existing-hash",
  });
});

describe("deriveStableDeliveryId", () => {
  it("preserves an explicit provider delivery ID", () => {
    expect(deriveStableDeliveryId(input)).toBe(input.deliveryId);
  });

  it("uses the same fallback ID for identical bodies and event types", () => {
    const first = deriveStableDeliveryId({ ...input, deliveryId: "" });
    const second = deriveStableDeliveryId({ ...input, deliveryId: null });
    expect(first).toBe(second);
    expect(first).toContain("lemonsqueezy-fallback-order_created-");
    expect(first).toContain(hashWebhookPayload(input.rawBody).slice(0, 48));
  });
});

describe("reserveWebhookEvent", () => {
  it("atomically acquires a new reservation with audit metadata", async () => {
    mockPrisma.processedWebhook.create.mockResolvedValue({});

    const result = await reserveWebhookEvent(input);

    expect(result).toMatchObject({
      acquired: true,
      deliveryId: input.deliveryId,
      status: "processing",
      payloadHash: hashWebhookPayload(input.rawBody),
    });
    expect(mockPrisma.processedWebhook.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        provider: input.provider,
        deliveryId: input.deliveryId,
        eventType: input.eventType,
        status: "processing",
        payloadHash: hashWebhookPayload(input.rawBody),
        attemptCount: 1,
        processingStartedAt: expect.any(Date),
      }),
    });
  });

  it("allows exactly one winner when concurrent duplicate inserts race", async () => {
    mockPrisma.processedWebhook.findUnique.mockResolvedValue({
      status: "processing",
      payloadHash: hashWebhookPayload(input.rawBody),
    });
    let insertCount = 0;
    mockPrisma.processedWebhook.create.mockImplementation(async () => {
      insertCount += 1;
      if (insertCount === 1) return {};
      throw uniqueViolation();
    });

    const results = await Promise.all([
      reserveWebhookEvent(input),
      reserveWebhookEvent(input),
    ]);

    expect(results.filter((result) => result.acquired)).toHaveLength(1);
    expect(results.filter((result) => !result.acquired)).toHaveLength(1);
    expect(mockPrisma.processedWebhook.create).toHaveBeenCalledTimes(2);
  });

  it("reclaims a retryable reservation with a conditional atomic update", async () => {
    mockPrisma.processedWebhook.create.mockRejectedValue(uniqueViolation());
    mockPrisma.processedWebhook.updateMany.mockResolvedValue({ count: 1 });

    const result = await reserveWebhookEvent(input);

    expect(result.acquired).toBe(true);
    expect(mockPrisma.processedWebhook.updateMany).toHaveBeenCalledWith({
      where: {
        deliveryId: input.deliveryId,
        payloadHash: hashWebhookPayload(input.rawBody),
        OR: [
          { status: "retryable" },
          {
            status: "processing",
            processingStartedAt: { lt: expect.any(Date) },
          },
        ],
      },
      data: expect.objectContaining({
        status: "processing",
        attemptCount: { increment: 1 },
        payloadHash: hashWebhookPayload(input.rawBody),
        processingStartedAt: expect.any(Date),
      }),
    });
    expect(mockPrisma.processedWebhook.findUnique).not.toHaveBeenCalled();
  });

  it("rejects a duplicate whose payload hash changed", async () => {
    mockPrisma.processedWebhook.create.mockRejectedValue(uniqueViolation());
    mockPrisma.processedWebhook.findUnique.mockResolvedValue({
      status: "completed",
      payloadHash: "different-hash",
    });

    await expect(reserveWebhookEvent(input)).rejects.toBeInstanceOf(
      WebhookPayloadMismatchError,
    );
  });

  it("rejects a retryable row when the payload hash changes", async () => {
    mockPrisma.processedWebhook.create.mockRejectedValue(uniqueViolation());
    mockPrisma.processedWebhook.findUnique.mockResolvedValue({
      status: "retryable",
      payloadHash: "different-hash",
    });

    await expect(reserveWebhookEvent(input)).rejects.toBeInstanceOf(
      WebhookPayloadMismatchError,
    );
    expect(mockPrisma.processedWebhook.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          payloadHash: hashWebhookPayload(input.rawBody),
        }),
      }),
    );
    expect(mockPrisma.processedWebhook.findUnique).toHaveBeenCalled();
  });

  it("acknowledges a completed/processing duplicate without reclaiming it", async () => {
    mockPrisma.processedWebhook.create.mockRejectedValue(uniqueViolation());
    mockPrisma.processedWebhook.findUnique.mockResolvedValue({
      status: "completed",
      payloadHash: hashWebhookPayload(input.rawBody),
    });

    const result = await reserveWebhookEvent(input);

    expect(result).toMatchObject({
      acquired: false,
      status: "completed",
    });
  });
});

describe("webhook lifecycle", () => {
  it("marks completion and clears previous failure metadata", async () => {
    await completeWebhookEvent({
      deliveryId: input.deliveryId,
      payloadHash: "hash",
    });

    expect(mockPrisma.processedWebhook.update).toHaveBeenCalledWith({
      where: { deliveryId: input.deliveryId },
      data: expect.objectContaining({
        status: "completed",
        payloadHash: "hash",
        processedAt: expect.any(Date),
        completedAt: expect.any(Date),
        lastError: null,
      }),
    });
  });

  it.each([
    [true, "retryable"],
    [false, "failed"],
  ] as const)("persists %s failure as %s", async (retryable, status) => {
    await failWebhookEvent({
      deliveryId: input.deliveryId,
      error: new Error("database timeout"),
      retryable,
    });

    expect(mockPrisma.processedWebhook.update).toHaveBeenCalledWith({
      where: { deliveryId: input.deliveryId },
      data: expect.objectContaining({
        status,
        lastError: "database timeout",
        failedAt: expect.any(Date),
      }),
    });
  });
});
