import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

const {
  mockFindUnique,
  mockCreate,
} = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
  mockCreate: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    processedWebhook: {
      findUnique: mockFindUnique,
      create: mockCreate,
    },
  },
}));

import {
  wasAlreadyProcessed,
  recordDelivery,
} from "../idempotency";

describe("idempotency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("wasAlreadyProcessed", () => {
    it("returns true when deliveryId row already exists", async () => {
      mockFindUnique.mockResolvedValue({ id: "row-1" });
      expect(
        await wasAlreadyProcessed({
          provider: "lemonsqueezy",
          deliveryId: "LS-123-order_created",
        }),
      ).toBe(true);
      // Schema (prisma/schema.prisma): single-column @unique on
      // deliveryId. The compound (provider, deliveryId) constraint
      // is forward-compat — see comment on the production code.
      expect(mockFindUnique).toHaveBeenCalledWith({
        where: { deliveryId: "LS-123-order_created" },
      });
    });

    it("returns false when deliveryId row is absent", async () => {
      mockFindUnique.mockResolvedValue(null);
      expect(
        await wasAlreadyProcessed({
          provider: "lemonsqueezy",
          deliveryId: "LS-456-order_created",
        }),
      ).toBe(false);
      expect(mockFindUnique).toHaveBeenCalledWith({
        where: { deliveryId: "LS-456-order_created" },
      });
    });
  });

  describe("recordDelivery", () => {
    it("writes a new ProcessedWebhook row", async () => {
      mockCreate.mockResolvedValue({ id: "row-2" });
      await recordDelivery({
        provider: "lemonsqueezy",
        deliveryId: "LS-789-order_created",
        eventType: "order_created",
      });
      expect(mockCreate).toHaveBeenCalledWith({
        data: {
          provider: "lemonsqueezy",
          deliveryId: "LS-789-order_created",
          eventType: "order_created",
        },
      });
    });

    it("tolerates P2002 (concurrent delivery already recorded)", async () => {
      const err = new Prisma.PrismaClientKnownRequestError(
        "Unique constraint failed",
        { code: "P2002", clientVersion: "test" },
      );
      mockCreate.mockRejectedValue(err);
      await expect(
        recordDelivery({
          provider: "lemonsqueezy",
          deliveryId: "dup",
          eventType: "order_created",
        }),
      ).resolves.toBeUndefined();
    });

    it("rethrows non-P2002 errors", async () => {
      const err = new Error("connection refused");
      mockCreate.mockRejectedValue(err);
      await expect(
        recordDelivery({
          provider: "lemonsqueezy",
          deliveryId: "x",
          eventType: "order_created",
        }),
      ).rejects.toThrow("connection refused");
    });

    it("rethrows P2003 / P2025 (NOT silently swallowed)", async () => {
      const err = new Prisma.PrismaClientKnownRequestError(
        "Foreign key",
        { code: "P2003", clientVersion: "test" },
      );
      mockCreate.mockRejectedValue(err);
      await expect(
        recordDelivery({
          provider: "lemonsqueezy",
          deliveryId: "x",
          eventType: "order_created",
        }),
      ).rejects.toThrow("Foreign key");
    });
  });
});
