import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth";

// GET — list all coupons
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as any).role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(coupons);
}

// POST — create a new coupon
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as any).role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { code, type, value, maxUses, productId, expiresAt, description } = body;

    if (!code || !type || value == null) {
      return NextResponse.json({ error: "Missing required fields: code, type, value" }, { status: 400 });
    }

    const coupon = await prisma.coupon.create({
      data: {
        code: code.toUpperCase().replace(/\s+/g, ""),
        type,
        value: Number(value),
        maxUses: maxUses ? Number(maxUses) : null,
        productId: productId || null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        description: description || null,
        minAmount: null,
        usedCount: 0,
        isActive: true,
      },
    });

    return NextResponse.json(coupon, { status: 201 });
  } catch (error) {
    console.error("POST /api/admin/coupons error:", error);
    return NextResponse.json({ error: "Failed to create coupon" }, { status: 500 });
  }
}
