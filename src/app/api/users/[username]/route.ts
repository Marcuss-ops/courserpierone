import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

/**
 * GET /api/users/[username]
 *
 * Profilo pubblico di un utente.
 * Restituisce: info profilo, corsi completati, certificati, attività recente.
 * Non richiede autenticazione.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await params;

    const user = await prisma.user.findUnique({
      where: { username },
      select: {
        id: true,
        username: true,
        name: true,
        image: true,
        bio: true,
        socialLinks: true,
        coverImageUrl: true,
        role: true,
        createdAt: true,
        orders: {
          where: { status: "completed" },
          select: {
            product: {
              select: {
                id: true,
                slug: true,
                coverUrl: true,
                _count: { select: { lessons: true } },
              },
            },
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "Utente non trovato" }, { status: 404 });
    }

    // Parse socialLinks JSON
    let socialLinks: Record<string, string> | null = null;
    if (user.socialLinks) {
      try {
        socialLinks = JSON.parse(user.socialLinks);
      } catch {
        socialLinks = null;
      }
    }

    // Get completed lesson progress for each product
    const productIds = user.orders.map((o) => o.product.id);
    const allLessons =
      productIds.length > 0
        ? await prisma.lesson.findMany({
            where: { productId: { in: productIds } },
            select: { id: true, productId: true },
          })
        : [];

    const allLessonIds = allLessons.map((l) => l.id);
    const lessonProductMap = new Map(allLessons.map((l) => [l.id, l.productId]));

    const completedProgress =
      allLessonIds.length > 0
        ? await prisma.lessonProgress.findMany({
            where: { userId: user.id, lessonId: { in: allLessonIds }, completed: true },
            select: { lessonId: true },
          })
        : [];

    const completedByProduct = new Map<string, number>();
    for (const p of completedProgress) {
      const pid = lessonProductMap.get(p.lessonId);
      if (pid) completedByProduct.set(pid, (completedByProduct.get(pid) ?? 0) + 1);
    }
    const totalByProduct = new Map<string, number>();
    for (const l of allLessons) {
      totalByProduct.set(l.productId, (totalByProduct.get(l.productId) ?? 0) + 1);
    }

    const completedCourses = user.orders
      .map((o) => {
        const total = totalByProduct.get(o.product.id) ?? 0;
        const completed = completedByProduct.get(o.product.id) ?? 0;
        return {
          productId: o.product.id,
          slug: o.product.slug,
          coverUrl: o.product.coverUrl,
          totalLessons: total,
          completedLessons: completed,
          isCompleted: total > 0 && completed >= total,
          purchasedAt: o.createdAt,
        };
      })
      .filter((c) => c.totalLessons > 0);

    const certificateCount = completedCourses.filter((c) => c.isCompleted).length;

    // Recent activity: last 5 watched lessons
    const recentActivity = await prisma.lessonProgress.findMany({
      where: { userId: user.id, lastWatchedAt: { not: null } },
      orderBy: { lastWatchedAt: "desc" },
      take: 5,
      select: {
        lastWatchedAt: true,
        lesson: {
          select: {
            id: true,
            position: true,
            product: { select: { slug: true } },
            translations: {
              take: 1,
              orderBy: { id: "desc" },
              select: { title: true },
            },
          },
        },
      },
    });

    const stats = {
      completedLessons: completedProgress.length,
      totalLessons: allLessonIds.length,
      coursesPurchased: user.orders.length,
      certificatesEarned: certificateCount,
      joinedAt: user.createdAt,
    };

    return NextResponse.json({
      profile: {
        username: user.username,
        name: user.name,
        image: user.image,
        bio: user.bio,
        socialLinks,
        coverImageUrl: user.coverImageUrl,
        role: user.role,
      },
      stats,
      courses: completedCourses,
      recentActivity: recentActivity.map((a) => ({
        watchedAt: a.lastWatchedAt,
        lessonId: a.lesson.id,
        lessonTitle: a.lesson.translations[0]?.title ?? null,
        lessonPosition: a.lesson.position,
        productSlug: a.lesson.product.slug,
      })),
    });
  } catch (error) {
    console.error("GET /api/users/[username] error:", error);
    return NextResponse.json({ error: "Errore interno" }, { status: 500 });
  }
}
