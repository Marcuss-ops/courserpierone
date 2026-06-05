import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth";

// PUT — update a coupon
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as any).role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await request.json();
    const coupon = await prisma.coupon.update({
      where: { id },
      data: {
        ...(body.code != null && { code: body.code.toUpperCase().replace(/\s+/g, "") }),
        ...(body.type != null && { type: body.type }),
        ...(body.value != null && { value: Number(body.value) }),
        ...(body.maxUses !== undefined && { maxUses: body.maxUses ? Number(body.maxUses) : null }),
        ...(body.productId !== undefined && { productId: body.productId || null }),
        ...(body.expiresAt !== undefined && { expiresAt: body.expiresAt ? new Date(body.expiresAt) : null }),
        ...(body.description !== undefined && { description: body.description || null }),
        ...(body.isActive != null && { isActive: body.isActive }),
        ...(body.minAmount !== undefined && { minAmount: body.minAmount ? Number(body.minAmount) : null }),
      },
    });

    return NextResponse.json(coupon);
  } catch (error) {
    console.error("PUT /api/admin/coupons/[id] error:", error);
    return NextResponse.json({ error: "Failed to update coupon" }, { status: 500 });
  }
}

// DELETE — delete a coupon
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as any).role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    await prisma.coupon.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/admin/coupons/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete coupon" }, { status: 500 });
  }
}
