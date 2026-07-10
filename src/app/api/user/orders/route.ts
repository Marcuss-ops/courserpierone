import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getServerUser } from "@/lib/supabase/get-user";
import { apiErrorResponse } from "@/lib/errors";

export async function GET() {
  try {
    const { user, dbUser } = await getServerUser();
    if (!user?.email || !dbUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get lesson progress for all products
    const progress = await prisma.lessonProgress.findMany({
      where: { userId: dbUser.id },
    });

    const completedLessonIds = progress
      .filter((p) => p.completed)
      .map((p) => p.lessonId);

    // Build response — carica gli ordini dal DB
    const userOrders = await prisma.order.findMany({
      where: { userId: dbUser.id, status: "completed" },
      include: {
        product: {
          select: {
            id: true,
            slug: true,
            coverUrl: true,
            price: true,
            currency: true,
            templateId: true,
            _count: { select: { lessons: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const orders = userOrders.map((order) => ({
      id: order.id,
      amount: order.amount,
      currency: order.currency,
      status: order.status,
      purchasedAt: order.createdAt,
      product: {
        id: order.product.id,
        slug: order.product.slug,
        coverUrl: order.product.coverUrl,
        templateId: order.product.templateId,
        lessonsCount: order.product._count.lessons,
      },
    }));

    return NextResponse.json({
      user: {
        id: dbUser.id,
        email: dbUser.email,
        name: dbUser.name,
        image: dbUser.image,
        role: dbUser.role,
        memberSince: dbUser.createdAt,
      },
      stats: {
        totalPurchases: orders.length,
        totalCompletedLessons: completedLessonIds.length,
      },
      orders,
    });
  } catch (error) {
    return apiErrorResponse(error, "Failed to fetch orders");
  }
}
