import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getServerUser } from "@/lib/supabase/get-user";
import { withRateLimit } from "@/lib/utils/rate-limit";
import { apiErrorResponse } from "@/lib/errors";

/**
 * PATCH /api/notifications/[id]/read
 *
 * Marks a single notification as read. Enforces ownership:
 * the notification must belong to the authenticated user; otherwise
 * 403 Forbidden.
 *
 * Response: 200 { success: true, readAt: ISO } | 401 | 403 | 404
 */
export const PATCH = withRateLimit(async function PATCH(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { user, dbUser } = await getServerUser();
  if (!user?.email || !dbUser) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const { id } = await context.params;
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "ID notifica mancante" }, { status: 400 });
  }

  try {
    const notif = await prisma.notification.findUnique({
      where: { id },
      select: { id: true, userId: true, read: true, readAt: true },
    });
    if (!notif) {
      return NextResponse.json({ error: "Notifica non trovata" }, { status: 404 });
    }
    if (notif.userId !== dbUser.id) {
      return NextResponse.json(
        { error: "Non autorizzato" },
        { status: 403 },
      );
    }
    if (notif.read) {
      // Idempotent — return existing readAt, no need to update
      return NextResponse.json({
        success: true,
        readAt: notif.readAt?.toISOString() ?? null,
      });
    }

    const updated = await prisma.notification.update({
      where: { id },
      data: { read: true, readAt: new Date() },
      select: { readAt: true },
    });

    return NextResponse.json({
      success: true,
      readAt: updated.readAt?.toISOString() ?? null,
    });
  } catch (err) {
    return apiErrorResponse(err, "Errore nell'aggiornamento notifica");
  }
}, "AUTH");
