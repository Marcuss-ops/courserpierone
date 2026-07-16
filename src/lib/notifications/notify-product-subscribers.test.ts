/**
 * src/lib/notifications/notify-product-subscribers.test.ts
 *
 * Unit tests for notifyProductSubscribers. Mocks Prisma and the
 * createNotification helper to verify that only active AccessGrant
 * holders are notified and that results are counted correctly.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    accessGrant: { findMany: vi.fn() },
  },
}));

vi.mock("./create-notification", () => ({
  createNotification: vi.fn(),
}));

import { prisma } from "@/lib/db/prisma";
import { createNotification } from "./create-notification";
import { notifyProductSubscribers } from "./notify-product-subscribers";

const mockAccessGrant = vi.mocked(prisma.accessGrant.findMany);
const mockCreateNotification = vi.mocked(createNotification);

describe("notifyProductSubscribers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns zero sent/skipped when productId is empty", async () => {
    const result = await notifyProductSubscribers({
      productId: "",
      type: "new_lesson",
      title: "New lesson",
    });
    expect(result).toEqual({ sent: 0, skipped: 0 });
    expect(mockAccessGrant).not.toHaveBeenCalled();
  });

  it("notifies each active grant holder once", async () => {
    mockAccessGrant.mockResolvedValue(
      [
        { userId: "u1" },
        { userId: "u2" },
      ] as unknown as Awaited<ReturnType<typeof prisma.accessGrant.findMany>>,
    );
    mockCreateNotification.mockResolvedValue({
      id: "n1",
      userId: "u1",
      type: "new_lesson",
      entityId: "p1",
      title: "New lesson",
      body: null,
      link: null,
      read: false,
      createdAt: "2026-07-16T10:00:00.000Z",
    });

    const result = await notifyProductSubscribers({
      productId: "p1",
      type: "new_lesson",
      title: "New lesson",
      body: "A new lesson is available",
      link: "/courses/p1/lesson-1",
    });

    expect(mockAccessGrant).toHaveBeenCalledWith({
      where: { productId: "p1", status: "active" },
      select: { userId: true },
      distinct: ["userId"],
    });
    expect(mockCreateNotification).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ sent: 2, skipped: 0 });
  });

  it("counts opted-out users as skipped", async () => {
    mockAccessGrant.mockResolvedValue(
      [{ userId: "u1" }] as unknown as Awaited<
        ReturnType<typeof prisma.accessGrant.findMany>
      >,
    );
    mockCreateNotification.mockResolvedValue(null);

    const result = await notifyProductSubscribers({
      productId: "p1",
      type: "new_course",
      title: "New course",
    });

    expect(result).toEqual({ sent: 0, skipped: 1 });
  });
});
