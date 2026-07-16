/**
 * src/lib/notifications/notify-product-subscribers.ts
 *
 * Phase 2 — Retention notifications.
 *
 * Notifies every user with an active AccessGrant for a given product
 * when new content is published (new lesson, new course, update).
 * AccessGrant is the single source of truth for who should receive
 * the notification.
 *
 * Architecture (per ADR-0016 §1 dep direction):
 *   - This is a pure use case: it orchestrates the read of eligible
 *     users and the creation of notifications.
 *   - It depends on the `createNotification` helper (domain/port) and
 *     on Prisma only for the AccessGrant read. In a stricter split,
 *     the AccessGrant read would be a port; here we accept the
 *     pragmatic trade-off because the notification module already
 *     depends on Prisma for persistence.
 */

import { prisma } from "@/lib/db/prisma";
import { createNotification, type NotificationType } from "./create-notification";

export interface NotifyProductSubscribersInput {
  productId: string;
  /** Type of notification to create for each subscriber. */
  type: Extract<NotificationType, "new_lesson" | "new_course" | "lesson_update" | "course_update">;
  title: string;
  body?: string;
  link?: string;
}

export interface NotifyProductSubscribersResult {
  /** Number of notifications successfully created. */
  sent: number;
  /** Number of users skipped (opted out or createNotification returned null). */
  skipped: number;
}

/**
 * Notify all active AccessGrant holders of a product.
 *
 * Behavior:
 *   - Reads distinct userIds from AccessGrant where status='active'
 *     and productId matches.
 *   - Creates one notification per user via createNotification.
 *   - createNotification already respects NotificationPreference opt-outs.
 *   - Returns { sent, skipped } for admin UI feedback.
 *
 * Performance:
 *   - One indexed query on AccessGrant(userId, productId, status).
 *   - Sequential createNotification calls (INSERT + preference read).
 *     Batch insert is YAGNI until subscriber counts grow.
 */
export async function notifyProductSubscribers(
  input: NotifyProductSubscribersInput,
): Promise<NotifyProductSubscribersResult> {
  if (!input.productId) {
    return { sent: 0, skipped: 0 };
  }

  const grants = await prisma.accessGrant.findMany({
    where: {
      productId: input.productId,
      status: "active",
    },
    select: { userId: true },
    distinct: ["userId"],
  });

  let sent = 0;
  let skipped = 0;

  for (const grant of grants) {
    const result = await createNotification({
      recipientId: grant.userId,
      type: input.type,
      entityId: input.productId,
      title: input.title,
      body: input.body,
      link: input.link,
    });

    if (result) {
      sent += 1;
    } else {
      skipped += 1;
    }
  }

  return { sent, skipped };
}
