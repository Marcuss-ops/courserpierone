import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        orders: {
          where: { status: "completed" },
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
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Get lesson progress for all products
    const progress = await prisma.lessonProgress.findMany({
      where: { userId: user.id },
    });

    const completedLessonIds = progress
      .filter((p) => p.completed)
      .map((p) => p.lessonId);

    // Build response — lesson count from product._count.lessons (già incluso nella query)
    const orders = user.orders.map((order) => ({
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
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
        role: user.role,
        memberSince: user.createdAt,
      },
      stats: {
        totalPurchases: orders.length,
        totalCompletedLessons: completedLessonIds.length,
      },
      orders,
    });
  } catch (error) {
    console.error("GET /api/user/orders error:", error);
    return NextResponse.json({ error: "Failed to fetch orders" }, { status: 500 });
  }
}
