import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getServerUser } from "@/lib/supabase/get-user";
import { apiErrorResponse } from "@/lib/errors";

export async function GET() {
  try {
    const { user, dbUser } = await getServerUser();
    if (!user || !dbUser || dbUser.role !== "admin") {
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
    return apiErrorResponse(error, "Failed to fetch orders");
  }
}
