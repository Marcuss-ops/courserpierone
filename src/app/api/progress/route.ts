import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getServerUser } from "@/lib/supabase/get-user";
import { progressSchema } from "@/lib/utils/validations";
import { apiErrorResponse } from "@/lib/errors";
import type { Prisma } from "@prisma/client";
import { findCompletedOrder } from "@/lib/access/find-completed-order";

export async function GET(request: NextRequest) {
  try {
    const { user, dbUser } = await getServerUser();
    if (!user?.email || !dbUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const productId = searchParams.get("productId");
    const productSlug = searchParams.get("productSlug");

    let resolvedProductId: string | undefined;

    if (productId) {
      resolvedProductId = productId;
    } else if (productSlug) {
      const product = await prisma.product.findUnique({
        where: { slug: productSlug },
        select: { id: true },
      });
      if (product) {
        resolvedProductId = product.id;
      } else {
        // Unknown product slug — return empty progress instead of leaking
        // progress data for other products.
        return NextResponse.json({ progress: [], lessons: [] });
      }
    }

    const where: Prisma.LessonProgressWhereInput = { userId: dbUser.id };
    if (resolvedProductId) where.lesson = { productId: resolvedProductId };

    const progress = await prisma.lessonProgress.findMany({ where });

    const lessonIds = progress.map((p) => p.lessonId);
    const lessons = await prisma.lesson.findMany({
      where: { id: { in: lessonIds } },
      include: { translations: { take: 1, select: { title: true } } },
    });

    return NextResponse.json({ progress, lessons });
  } catch (error) {
    return apiErrorResponse(error, "Failed to fetch progress");
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

    // Verify the lesson exists and the user has access to its product
    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { productId: true },
    });
    if (!lesson) {
      return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
    }

    if (dbUser.role !== "admin") {
      const order = await findCompletedOrder({
        userId: dbUser.id,
        productId: lesson.productId,
      });
      if (!order) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

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
    return apiErrorResponse(error, "Failed to save progress");
  }
}
