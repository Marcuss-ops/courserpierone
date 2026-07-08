import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getServerUser } from "@/lib/supabase/get-user";

export async function GET(request: NextRequest) {
  try {
    const { user, dbUser } = await getServerUser();
    const { searchParams } = request.nextUrl;
    const productId = searchParams.get("productId");
    const orderId = searchParams.get("orderId") || searchParams.get("order_id");

    if (!productId) return NextResponse.json({ hasAccess: false });

    // Resolve product UUID from input (which can be either UUID or slug)
    const product = await prisma.product.findFirst({
      where: {
        OR: [
          { id: productId },
          { slug: productId }
        ]
      }
    });

    if (!product) return NextResponse.json({ hasAccess: false });
    const dbProductId = product.id;

    // Check user by session
    if (user?.email && dbUser) {
      // Grant access if they are admin or have a completed order
      if (dbUser.role === "admin") {
        return NextResponse.json({ hasAccess: true, userId: dbUser.id });
      }
      const hasOrder = await prisma.order.findFirst({
        where: { userId: dbUser.id, productId: dbProductId, status: "completed" },
      });
      if (hasOrder) {
        return NextResponse.json({ hasAccess: true, userId: dbUser.id });
      }
    }

    // Check order ID directly (useful for immediate redirect access from checkouts)
    if (orderId) {
      const order = await prisma.order.findFirst({
        where: {
          OR: [
            { providerOrderId: orderId },
            { id: orderId }
          ],
          productId: dbProductId,
          status: "completed"
        }
      });
      if (order) {
        return NextResponse.json({ hasAccess: true });
      }
    }

    return NextResponse.json({ hasAccess: false });
  } catch (error) {
    console.error("GET /api/access error:", error);
    return NextResponse.json({ hasAccess: false });
  }
}
