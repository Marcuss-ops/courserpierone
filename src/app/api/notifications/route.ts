import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getServerUser } from "@/lib/supabase/get-user";
import { withRateLimit } from "@/lib/utils/rate-limit";
import { apiErrorResponse } from "@/lib/errors";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

/**
 * GET /api/notifications
 *
 * Returns the authenticated user's most recent notifications, ordered
 * newest-first. Used by the NotificationBell dropdown (client polls
 * every 30s; V1 has no WS notifications stream yet).
 *
 * Query params:
 *   - limit  (default 20, max 50)
 *   - cursor (optional) — notification id for cursor-based pagination
 *                     (returns notifications strictly older than this)
 *   - unreadOnly (optional, "true"|"1") — filter to unread only
 *
 * Response: {
 *   notifications: Notification[],  // max `limit` items
 *   unreadCount: number,            // ALL-time unread count
 *   nextCursor: string | null,      // for "load older" pagination
 * }
 */
export const GET = withRateLimit(async function GET(request: NextRequest) {
  const { user, dbUser } = await getServerUser();
  if (!user?.email || !dbUser) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  // Parse query
  const url = new URL(request.url);
  const limitParam = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
  const limit = Math.min(
    Math.max(1, Number.isFinite(limitParam) ? limitParam : DEFAULT_LIMIT),
    MAX_LIMIT,
  );
  const cursor = url.searchParams.get("cursor");
  const unreadOnly = url.searchParams.get("unreadOnly") === "true" || url.searchParams.get("unreadOnly") === "1";

  // Build the WHERE clause
  const where: { userId: string; read?: boolean; id?: { lt: string } } = {
    userId: dbUser.id,
  };
  if (unreadOnly) where.read = false;
  if (cursor) where.id = { lt: cursor };

  try {
    // Notification list (limited, newest-first)
    const notifications = await prisma.notification.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1, // fetch one extra to know if there's a next page
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
    });

    // Sanitize ISO for JSON-safety across the WS boundary
    const items = notifications.slice(0, limit).map((n) => ({
      ...n,
      createdAt: n.createdAt.toISOString(),
      readAt: n.readAt?.toISOString() ?? null,
    }));
    const nextCursor = notifications.length > limit ? items[items.length - 1]?.id ?? null : null;

    // Unread count (separate query for badge — no pagination limit)
    const unreadCount = await prisma.notification.count({
      where: { userId: dbUser.id, read: false },
    });

    return NextResponse.json({
      notifications: items,
      unreadCount,
      nextCursor,
    });
  } catch (err) {
    return apiErrorResponse(err, "Errore nel caricamento notifiche");
  }
}, "AUTH");
