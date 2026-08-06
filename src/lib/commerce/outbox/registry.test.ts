import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockAnalyticCreate,
  mockAbandonedUpdateMany,
  mockSendPurchaseConfirmation,
  mockCreateNotification,
  mockOutboxFindFirst,
  mockOutboxUpdateMany,
} = vi.hoisted(() => ({
  mockAnalyticCreate: vi.fn(),
  mockAbandonedUpdateMany: vi.fn(),
  mockSendPurchaseConfirmation: vi.fn(),
  mockCreateNotification: vi.fn(),
  mockOutboxFindFirst: vi.fn(),
  mockOutboxUpdateMany: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    analyticEvent: { create: mockAnalyticCreate },
    abandonedCheckout: { updateMany: mockAbandonedUpdateMany },
    outboxEvent: {
      findFirst: mockOutboxFindFirst,
      updateMany: mockOutboxUpdateMany,
    },
  },
}));
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
  OUTBOX_EVENT_TYPES,
  OUTBOX_HANDLER_REGISTRY,
} from "./registry";
import { dispatchOutboxEvent, processOutboxBatch } from "./processor";

beforeEach(() => {
  vi.clearAllMocks();
  mockSendPurchaseConfirmation.mockResolvedValue(true);
  mockAnalyticCreate.mockResolvedValue({});
  mockAbandonedUpdateMany.mockResolvedValue({ count: 1 });
  mockCreateNotification.mockResolvedValue({ id: "notification-1" });
  mockOutboxFindFirst.mockReset().mockResolvedValue(null);
  mockOutboxUpdateMany.mockReset().mockResolvedValue({ count: 1 });
});

describe("OUTBOX_HANDLER_REGISTRY", () => {
  it("registers every supported commerce event", () => {
    expect(OUTBOX_EVENT_TYPES).toEqual([
      "purchase_email",
      "purchase_analytics",
      "purchase_notification",
      "purchase_abandoned_recovery",
    ]);
    expect(Object.keys(OUTBOX_HANDLER_REGISTRY)).toHaveLength(4);
  });

  it("validates and dispatches purchase email payloads", async () => {
    await OUTBOX_HANDLER_REGISTRY.purchase_email.handle(
      {
        email: "buyer@example.com",
        productSlug: "course-1",
        courseUrl: "https://example.test/course-1",
        locale: "en-US",
        ebookDownloadUrl: "https://example.test/dashboard",
      },
      "event-email",
    );

    expect(mockSendPurchaseConfirmation).toHaveBeenCalledWith(
      "buyer@example.com",
      "course-1",
      "https://example.test/course-1",
      "en-US",
      "https://example.test/dashboard",
    );
  });

  it("dispatches analytics with the outbox event id", async () => {
    await OUTBOX_HANDLER_REGISTRY.purchase_analytics.handle(
      {
        productId: "product-1",
        productSlug: "course-1",
        providerProductId: "variant-1",
        userId: "user-1",
        channelId: null,
        provider: "lemonsqueezy",
        amount: 4900,
        currency: "USD",
        providerOrderId: "order-1",
      },
      "event-analytics",
    );

    expect(mockAnalyticCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: "purchase",
        outboxEventId: "event-analytics",
        productId: "product-1",
        productSlug: "course-1",
        userId: "user-1",
      }),
    });
  });

  it("dispatches notifications with the outbox event id", async () => {
    await OUTBOX_HANDLER_REGISTRY.purchase_notification.handle(
      {
        recipientId: "user-1",
        entityId: "order-1",
        type: "new_course",
        title: "Purchase confirmed",
        body: "Your access is ready",
        link: "https://example.test/course-1",
      },
      "event-notification",
    );

    expect(mockCreateNotification).toHaveBeenCalledWith({
      recipientId: "user-1",
      entityId: "order-1",
      type: "new_course",
      title: "Purchase confirmed",
      body: "Your access is ready",
      link: "https://example.test/course-1",
      outboxEventId: "event-notification",
      throwOnError: true,
    });
  });

  it("dispatches abandoned checkout recovery", async () => {
    await OUTBOX_HANDLER_REGISTRY.purchase_abandoned_recovery.handle(
      { email: "buyer@example.com", productId: "product-1" },
      "event-recovery",
    );

    expect(mockAbandonedUpdateMany).toHaveBeenCalledWith({
      where: {
        email: "buyer@example.com",
        productId: "product-1",
        status: "pending",
      },
      data: { status: "recovered" },
    });
  });

  it("dispatches every registered event through the public dispatcher", async () => {
    await dispatchOutboxEvent({
      id: "dispatch-email",
      type: "purchase_email",
      payload: {
        email: "buyer@example.com",
        productSlug: "course-1",
        courseUrl: "https://example.test/course-1",
        locale: "en-US",
        ebookDownloadUrl: "https://example.test/dashboard",
      },
    });
    await dispatchOutboxEvent({
      id: "dispatch-analytics",
      type: "purchase_analytics",
      payload: {
        productSlug: "course-1",
        userId: "user-1",
        provider: "lemonsqueezy",
        amount: 4900,
        currency: "USD",
      },
    });
    await dispatchOutboxEvent({
      id: "dispatch-notification",
      type: "purchase_notification",
      payload: {
        recipientId: "user-1",
        entityId: "order-1",
        type: "new_course",
        title: "Purchase confirmed",
        body: "Your access is ready",
        link: "https://example.test/course-1",
      },
    });
    await dispatchOutboxEvent({
      id: "dispatch-recovery",
      type: "purchase_abandoned_recovery",
      payload: { email: "buyer@example.com", productId: "product-1" },
    });

    expect(mockSendPurchaseConfirmation).toHaveBeenCalledOnce();
    expect(mockAnalyticCreate).toHaveBeenCalledOnce();
    expect(mockCreateNotification).toHaveBeenCalledOnce();
    expect(mockAbandonedUpdateMany).toHaveBeenCalledOnce();

    await expect(
      dispatchOutboxEvent({
        id: "dispatch-unknown",
        type: "unsupported_event",
        payload: {},
      }),
    ).rejects.toThrow(/Unknown outbox event type/);
  });

  it("rejects malformed payloads before invoking an effect", async () => {
    await expect(
      OUTBOX_HANDLER_REGISTRY.purchase_email.handle(
        {
          email: "not-an-email",
          productSlug: "course-1",
          courseUrl: "https://example.test/course-1",
          locale: "en-US",
          ebookDownloadUrl: "https://example.test/dashboard",
        },
        "event-invalid",
      ),
    ).rejects.toThrow();
    expect(mockSendPurchaseConfirmation).not.toHaveBeenCalled();

    await expect(
      OUTBOX_HANDLER_REGISTRY.purchase_analytics.handle(
        {
          productSlug: "course-1",
          userId: "user-1",
          provider: "lemonsqueezy",
          amount: -1,
          currency: "USD",
        },
        "event-invalid-analytics",
      ),
    ).rejects.toThrow();
    expect(mockAnalyticCreate).not.toHaveBeenCalled();
  });

  it("propagates unrelated analytics unique violations", async () => {
    mockAnalyticCreate.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "5.22.0",
        meta: { target: ["productId"] },
      }),
    );

    await expect(
      OUTBOX_HANDLER_REGISTRY.purchase_analytics.handle(
        {
          productSlug: "course-1",
          userId: "user-1",
          provider: "lemonsqueezy",
          amount: 4900,
          currency: "USD",
        },
        "event-analytics",
      ),
    ).rejects.toThrow("Unique constraint failed");
  });

  it("propagates unrelated notification unique violations", async () => {
    mockCreateNotification.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "5.22.0",
        meta: { target: ["userId", "entityId"] },
      }),
    );

    await expect(
      OUTBOX_HANDLER_REGISTRY.purchase_notification.handle(
        {
          recipientId: "user-1",
          entityId: "order-1",
          type: "new_course",
          title: "Purchase confirmed",
          body: "Your access is ready",
          link: "https://example.test/course-1",
        },
        "event-notification",
      ),
    ).rejects.toThrow("Unique constraint failed");
  });

  it("marks malformed claimed payloads as dead letters without retrying", async () => {
    mockOutboxFindFirst.mockResolvedValueOnce({
      id: "invalid-event",
      type: "purchase_email",
      payload: { email: "invalid" },
      attemptCount: 0,
      maxAttempts: 3,
    }).mockResolvedValueOnce(null);

    const result = await processOutboxBatch({ limit: 1, now: new Date("2026-08-05T12:00:00Z") });

    expect(result).toMatchObject({ claimed: 1, completed: 0, retryable: 0, deadLettered: 1 });
    expect(mockOutboxUpdateMany).toHaveBeenLastCalledWith({
      where: { id: "invalid-event", status: "processing" },
      data: expect.objectContaining({ status: "dead_letter" }),
    });
  });

  it("rejects unknown fields because payload schemas are strict", async () => {
    await expect(
      OUTBOX_HANDLER_REGISTRY.purchase_abandoned_recovery.handle(
        {
          email: "buyer@example.com",
          productId: "product-1",
          unexpected: true,
        },
        "event-extra",
      ),
    ).rejects.toThrow();
    expect(mockAbandonedUpdateMany).not.toHaveBeenCalled();
  });
});
