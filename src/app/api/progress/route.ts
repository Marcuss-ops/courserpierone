import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getServerUser } from "@/lib/supabase/get-user";
import { progressSchema } from "@/lib/utils/validations";
import type { Prisma } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    const { user, dbUser } = await getServerUser();
    if (!user?.email || !dbUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const productId = searchParams.get("productId");

    const where: Prisma.LessonProgressWhereInput = { userId: dbUser.id };
    if (productId) where.lesson = { productId };

    const progress = await prisma.lessonProgress.findMany({ where });

    const lessonIds = progress.map((p) => p.lessonId);
    const lessons = await prisma.lesson.findMany({
      where: { id: { in: lessonIds } },
      include: { translations: { take: 1, select: { title: true } } },
    });

    return NextResponse.json({ progress, lessons });
  } catch (error) {
    console.error("GET /api/progress error:", error);
    return NextResponse.json({ error: "Failed to fetch progress" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, dbUser } = await getServerUser();
    if (!user?.email || !dbUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = progressSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid progress data" }, { status: 400 });
    }
    const { lessonId, completed } = parsed.data;
    if (!lessonId) return NextResponse.json({ error: "Missing lessonId" }, { status: 400 });

    const progress = await prisma.lessonProgress.upsert({
      where: { userId_lessonId: { userId: dbUser.id, lessonId } },
      update: {
        completed: completed ?? true,
        completedAt: completed ? new Date() : null,
      },
      create: {
        userId: dbUser.id,
        lessonId,
        completed: completed ?? true,
        completedAt: completed ? new Date() : null,
      },
    });

    return NextResponse.json({ success: true, progress });
  } catch (error) {
    console.error("POST /api/progress error:", error);
    return NextResponse.json({ error: "Failed to save progress" }, { status: 500 });
  }
}
