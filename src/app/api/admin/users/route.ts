import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getServerUser } from "@/lib/supabase/get-user";

export async function GET() {
  try {
    const { user, dbUser } = await getServerUser();
    if (!user || !dbUser || dbUser.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const users = await prisma.user.findMany({
      include: {
        orders: {
          include: {
            product: {
              select: { id: true, slug: true },
            },
          },
          orderBy: { createdAt: "desc" },
        },
        _count: {
          select: { orders: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Compute summary stats
    const totalUsers = users.length;
    const totalOrders = users.reduce((sum, u) => sum + u._count.orders, 0);
    const totalRevenue = users
      .flatMap((u) => u.orders)
      .filter((o) => o.status === "completed")
      .reduce((sum, o) => sum + o.amount, 0);
    const usersWithPurchases = users.filter((u) => u._count.orders > 0).length;

    // Format response (exclude sensitive data)
    const formatted = users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      image: u.image,
      role: u.role,
      createdAt: u.createdAt,
      orderCount: u._count.orders,
      totalSpent: u.orders
        .filter((o) => o.status === "completed")
        .reduce((sum, o) => sum + o.amount, 0),
      lastOrder: u.orders[0]
        ? {
            id: u.orders[0].id,
            amount: u.orders[0].amount,
            currency: u.orders[0].currency,
            status: u.orders[0].status,
            productSlug: u.orders[0].product.slug,
            createdAt: u.orders[0].createdAt,
          }
        : null,
    }));

    return NextResponse.json({
      summary: {
        totalUsers,
        totalOrders,
        totalRevenue,
        usersWithPurchases,
      },
      users: formatted,
    });
  } catch (error) {
    console.error("GET /api/admin/users error:", error);
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}
