import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getServerUser } from "@/lib/supabase/get-user";
import { withRateLimit } from "@/lib/utils/rate-limit";
import { apiErrorResponse } from "@/lib/errors";

/**
 * POST /api/notifications/mark-all-read
 *
 * Marks ALL unread notifications for the authenticated user as read.
 * Used by the bell dropdown "Segna tutti come letti" button.
 *
 * Response: 200 { success: true, count: number } | 401
 */
export const POST = withRateLimit(async function POST(_request: NextRequest) {
  const { user, dbUser } = await getServerUser();
  if (!user?.email || !dbUser) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  try {
    const result = await prisma.notification.updateMany({
      where: { userId: dbUser.id, read: false },
      data: { read: true, readAt: new Date() },
    });

    return NextResponse.json({
      success: true,
      count: result.count,
    });
  } catch (err) {
    return apiErrorResponse(err, "Errore nell'aggiornamento notifiche");
  }
}, "AUTH");
