/**
 * src/lib/notifications/get-initial-notifications.ts
 *
 * Server-side helper per il pre-render SSR del campanello in CourseTopNav.
 * V1: niente WS notifications stream — i client polla ogni 30s via
 * /api/notifications. Quindi il primo paint riceve già i dati freschi
 * dal server via questa helper.
 *
 * Returns:
 *   - unreadCount: PER il badge rosso
 *   - recent: gli ultimi 10 notifications (most recent first)
 *   - empty: helper per il rendering conditional
 */
import { prisma } from "@/lib/db/prisma";

export interface SerializedNotification {
  id: string;
  type: string;
  entityId: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  readAt: string | null;
  createdAt: string; // ISO
}

const RECENT_LIMIT = 10;

export async function getInitialNotifications(userId: string): Promise<{
  unreadCount: number;
  recent: SerializedNotification[];
}> {
  const [unreadCount, recent] = await Promise.all([
    prisma.notification.count({ where: { userId, read: false } }),
    prisma.notification.findMany({
      where: { userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: RECENT_LIMIT,
      select: {
        id: true,
        type: true,
        entityId: true,
        title: true,
        body: true,
        link: true,
        read: true,
        readAt: true,
        createdAt: true,
      },
    }),
  ]);

  return {
    unreadCount,
    recent: recent.map((n) => ({
      id: n.id,
      type: n.type,
      entityId: n.entityId,
      title: n.title,
      body: n.body,
      link: n.link,
      read: n.read,
      readAt: n.readAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
    })),
  };
}
