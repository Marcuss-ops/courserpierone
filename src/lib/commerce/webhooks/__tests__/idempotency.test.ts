import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    processedWebhook: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));

import {
  wasAlreadyProcessed,
  recordDelivery,
} from "@/lib/commerce/webhooks/idempotency";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("wasAlreadyProcessed", () => {
  it("returns true when a row exists for the deliveryId", async () => {
    mockPrisma.processedWebhook.findUnique.mockResolvedValue({
      deliveryId: "LS-1-order_created",
    });
    const result = await wasAlreadyProcessed({
      provider: "lemonsqueezy",
      deliveryId: "LS-1-order_created",
    });
    expect(result).toBe(true);
    expect(mockPrisma.processedWebhook.findUnique).toHaveBeenCalledWith({
      where: { deliveryId: "LS-1-order_created" },
    });
  });

  it("returns false when no row exists", async () => {
    mockPrisma.processedWebhook.findUnique.mockResolvedValue(null);
    const result = await wasAlreadyProcessed({
      provider: "lemonsqueezy",
      deliveryId: "LS-2-order_created",
    });
    expect(result).toBe(false);
  });
});

describe("recordDelivery", () => {
  it("calls processedWebhook.create with the right shape", async () => {
    mockPrisma.processedWebhook.create.mockResolvedValue({
      deliveryId: "LS-3-order_created",
    });
    await recordDelivery({
      provider: "lemonsqueezy",
      deliveryId: "LS-3-order_created",
      eventType: "order_created",
    });
    expect(mockPrisma.processedWebhook.create).toHaveBeenCalledWith({
      data: {
        provider: "lemonsqueezy",
        deliveryId: "LS-3-order_created",
        eventType: "order_created",
      },
    });
  });

  it("silently swallows P2002 (concurrent delivery race)", async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed on the fields: (`deliveryId`)",
      { code: "P2002", clientVersion: "5.22.0" },
    );
    mockPrisma.processedWebhook.create.mockRejectedValue(p2002);
    await expect(
      recordDelivery({
        provider: "lemonsqueezy",
        deliveryId: "LS-4-order_created",
        eventType: "order_created",
      }),
    ).resolves.toBeUndefined();
  });

  it("re-throws other Prisma errors so the route returns 500", async () => {
    const dbErr = new Error("connection terminated");
    mockPrisma.processedWebhook.create.mockRejectedValue(dbErr);
    await expect(
      recordDelivery({
        provider: "lemonsqueezy",
        deliveryId: "LS-5-order_created",
        eventType: "order_created",
      }),
    ).rejects.toThrow("connection terminated");
  });
});
