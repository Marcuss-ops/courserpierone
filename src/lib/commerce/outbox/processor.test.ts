import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockSendPurchaseConfirmation, mockCreateNotification } =
  vi.hoisted(() => ({
    mockPrisma: {
      outboxEvent: {
        findFirst: vi.fn(),
        updateMany: vi.fn(),
      },
      analyticEvent: { create: vi.fn() },
      abandonedCheckout: { updateMany: vi.fn() },
      outboxDeliveryAttempt: {
        create: vi.fn(),
        findUnique: vi.fn(),
        updateMany: vi.fn(),
      },
    },
    mockSendPurchaseConfirmation: vi.fn(),
    mockCreateNotification: vi.fn(),
  }));

vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/commerce/shared/email", () => ({
  sendPurchaseConfirmation: mockSendPurchaseConfirmation,
}));
vi.mock("@/lib/notifications/create-notification", () => ({
  NOTIFICATION_TYPES: [
    "chat_reply",
    "new_lesson",
    "new_course",
    "lesson_update",
    "course_update",
    "system_admin",
    "community_reply",
  ],
  createNotification: mockCreateNotification,
}));

import {
  processOutboxBatch,
  OUTBOX_BASE_BACKOFF_MS,
} from "./processor";

const NOW = new Date("2026-08-05T12:00:00.000Z");
const event = {
  id: "outbox-1",
  type: "purchase_email",
  payload: {
    email: "buyer@example.com",
    productSlug: "course-1",
    courseUrl: "https://example.test/course-1/portal",
    locale: "en-us",
    ebookDownloadUrl: "https://example.test/dashboard",
  },
  attemptCount: 0,
  maxAttempts: 3,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.outboxEvent.findFirst.mockReset();
  mockPrisma.outboxEvent.updateMany.mockReset();
  mockPrisma.outboxEvent.findFirst.mockResolvedValue(null);
  mockPrisma.outboxEvent.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.outboxDeliveryAttempt.create.mockReset().mockResolvedValue({ id: "attempt-1" });
  mockPrisma.outboxDeliveryAttempt.findUnique.mockReset().mockResolvedValue({
    id: "attempt-1",
    status: "processing",
  });
  mockPrisma.outboxDeliveryAttempt.updateMany.mockReset().mockResolvedValue({ count: 1 });
  mockSendPurchaseConfirmation.mockResolvedValue(true);
});

describe("processOutboxBatch", () => {
  it("delivers a pending purchase effect and marks it completed", async () => {
    mockPrisma.outboxEvent.findFirst.mockResolvedValue(event);

    const result = await processOutboxBatch({ now: NOW, limit: 1 });

    expect(result).toEqual({
      claimed: 1,
      completed: 1,
      retryable: 0,
      deadLettered: 0,
    });
    expect(mockSendPurchaseConfirmation).toHaveBeenCalledWith(
      "buyer@example.com",
      "course-1",
      "https://example.test/course-1/portal",
      "en-us",
      "https://example.test/dashboard",
    );
    expect(mockPrisma.outboxEvent.updateMany).toHaveBeenLastCalledWith({
      where: { id: "outbox-1", status: "processing" },
      data: expect.objectContaining({
        status: "completed",
        processedAt: expect.any(Date),
        lockedAt: null,
      }),
    });
  });

  it("schedules a transient failure with exponential backoff", async () => {
    mockPrisma.outboxEvent.findFirst.mockResolvedValue(event);
    mockSendPurchaseConfirmation.mockRejectedValue(new Error("SMTP timeout"));

    const result = await processOutboxBatch({ now: NOW, limit: 1 });


    expect(result).toEqual({
      claimed: 1,
      completed: 0,
      retryable: 1,
      deadLettered: 0,
    });
    expect(mockPrisma.outboxEvent.updateMany).toHaveBeenLastCalledWith({
      where: { id: "outbox-1", status: "processing" },
      data: expect.objectContaining({
        status: "retryable",
        nextAttemptAt: new Date(NOW.getTime() + OUTBOX_BASE_BACKOFF_MS),
        lockedAt: null,
        lastError: "SMTP timeout",
      }),
    });
  });

  it("retries an email provider that returns false", async () => {
    mockPrisma.outboxEvent.findFirst.mockResolvedValue(event);
    mockSendPurchaseConfirmation.mockResolvedValue(false);

    const result = await processOutboxBatch({ now: NOW, limit: 1 });

    expect(result.retryable).toBe(1);
    expect(mockPrisma.outboxEvent.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "retryable" }),
      }),
    );
  });

  it("dead-letters a permanent error without scheduling another attempt", async () => {
    const exhausted = { ...event, attemptCount: 3, maxAttempts: 3 };
    mockPrisma.outboxEvent.findFirst
      .mockResolvedValueOnce(exhausted)
      .mockResolvedValueOnce(null);
    mockSendPurchaseConfirmation.mockRejectedValue(new Error("invalid payload"));

    const result = await processOutboxBatch({ now: NOW, limit: 1 });

    expect(result).toEqual({
      claimed: 1,
      completed: 0,
      retryable: 0,
      deadLettered: 1,
    });
    expect(mockPrisma.outboxEvent.updateMany).toHaveBeenLastCalledWith({
      where: { id: "outbox-1", status: "processing" },
      data: expect.objectContaining({
        status: "dead_letter",
        nextAttemptAt: NOW,
        lockedAt: null,
        lastError: "invalid payload",
      }),
    });
  });
});
