import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as Record<string, string> | undefined)?.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orders = await prisma.order.findMany({
      include: {
        user: {
          select: { id: true, email: true, name: true },
        },
        product: {
          select: { id: true, slug: true, price: true, currency: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const totalRevenue = orders
      .filter((o) => o.status === "completed")
      .reduce((sum, o) => sum + o.amount, 0);

    const summary = {
      totalOrders: orders.length,
      completedOrders: orders.filter((o) => o.status === "completed").length,
      pendingOrders: orders.filter((o) => o.status === "pending").length,
      refundedOrders: orders.filter((o) => o.status === "refunded").length,
      totalRevenue,
    };

    return NextResponse.json({ summary, orders });
  } catch (error) {
    console.error("GET /api/admin/orders error:", error);
    return NextResponse.json({ error: "Failed to fetch orders" }, { status: 500 });
  }
}
