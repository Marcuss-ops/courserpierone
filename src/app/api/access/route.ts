import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getServerUser } from "@/lib/supabase/get-user";
import { hashToken } from "@/lib/utils/token-hash";

export async function GET(request: NextRequest) {
  try {
    const { user, dbUser } = await getServerUser();
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
      // Grant access if they have a used magic link for this product (test/demo flow)
      const magicAccess = await prisma.magicLink.findFirst({
        where: { email: dbUser.email, productId: dbProductId, used: true },
      });
      if (magicAccess) {
        return NextResponse.json({ hasAccess: true, userId: dbUser.id });
      }
    }

    // Check magic link token (hash before lookup)
    if (token) {
      const hashedToken = hashToken(token);
      const magic = await prisma.magicLink.findUnique({ where: { token: hashedToken } });
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
