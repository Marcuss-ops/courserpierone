import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const { searchParams } = request.nextUrl;
    const productId = searchParams.get("productId");
    const token = searchParams.get("token");
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
    if (session?.user?.email) {
      const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        include: { orders: { where: { productId: dbProductId, status: "completed" } } },
      });
      if (user) {
        // Grant access if they are admin or have a completed order
        if (user.role === "admin" || user.orders.length > 0) {
          return NextResponse.json({ hasAccess: true, userId: user.id });
        }
        // Grant access if they have a used magic link for this product (test/demo flow)
        const magicAccess = await prisma.magicLink.findFirst({
          where: { email: session.user.email, productId: dbProductId, used: true },
        });
        if (magicAccess) {
          return NextResponse.json({ hasAccess: true, userId: user.id });
        }
      }
    }

    // Check magic link token
    if (token) {
      const magic = await prisma.magicLink.findUnique({ where: { token } });
      if (magic && magic.expiresAt > new Date() && (magic.productId === dbProductId || magic.productId === product.slug)) {
        // Mark as used on first successful access
        if (!magic.used) {
          await prisma.magicLink.update({ where: { id: magic.id }, data: { used: true } });
        }
        return NextResponse.json({ hasAccess: true });
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
