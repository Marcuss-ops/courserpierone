import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getServerUser } from "@/lib/supabase/get-user";

/**
 * POST /api/notifications/mark-all-read
 * Segna TUTTE le notifiche dell'utente come lette in una singola query.
 */
export async function POST(request: NextRequest) {
  try {
    const { user, dbUser } = await getServerUser();
    if (!user?.email || !dbUser) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    const result = await prisma.notification.updateMany({
      where: { userId: dbUser.id, read: false },
      data: { read: true },
    });

    return NextResponse.json({ success: true, count: result.count });
  } catch (error) {
    console.error("POST /api/notifications/mark-all-read error:", error);
    return NextResponse.json({ error: "Errore interno" }, { status: 500 });
  }
}
