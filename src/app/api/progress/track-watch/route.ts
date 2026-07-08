import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getServerUser } from "@/lib/supabase/get-user";

export async function POST(request: NextRequest) {
  try {
    const { user, dbUser } = await getServerUser();
    if (!user?.email || !dbUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { lessonId } = body;
    if (!lessonId) {
      return NextResponse.json({ error: "Missing lessonId" }, { status: 400 });
    }

    // Upsert: crea o aggiorna lastWatchedAt
    const progress = await prisma.lessonProgress.upsert({
      where: { userId_lessonId: { userId: dbUser.id, lessonId } },
      update: { lastWatchedAt: new Date() },
      create: {
        userId: dbUser.id,
        lessonId,
        completed: false,
        lastWatchedAt: new Date(),
      },
    });

    return NextResponse.json({ success: true, progress });
  } catch (error) {
    console.error("POST /api/progress/track-watch error:", error);
    return NextResponse.json({ error: "Failed to track watch" }, { status: 500 });
  }
}
