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

    if (!productId) return NextResponse.json({ hasAccess: false });

    // Check user by session
    if (session?.user?.email) {
      const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        include: { orders: { where: { productId, status: "completed" } } },
      });
      if (user) {
        // Grant access if they have a completed order
        if (user.orders.length > 0) {
          return NextResponse.json({ hasAccess: true, userId: user.id });
        }
        // Grant access if they have a used magic link for this product (test/demo flow)
        const magicAccess = await prisma.magicLink.findFirst({
          where: { email: session.user.email, productId, used: true },
        });
        if (magicAccess) {
          return NextResponse.json({ hasAccess: true, userId: user.id });
        }
      }
    }

    // Check magic link token
    if (token) {
      const magic = await prisma.magicLink.findUnique({ where: { token } });
      if (magic && magic.expiresAt > new Date() && magic.productId === productId) {
        // Mark as used on first successful access
        if (!magic.used) {
          await prisma.magicLink.update({ where: { id: magic.id }, data: { used: true } });
        }
        return NextResponse.json({ hasAccess: true });
      }
    }

    return NextResponse.json({ hasAccess: false });
  } catch (error) {
    console.error("GET /api/access error:", error);
    return NextResponse.json({ hasAccess: false });
  }
}
