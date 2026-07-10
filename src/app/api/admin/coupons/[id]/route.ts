import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getServerUser } from "@/lib/supabase/get-user";
import { apiErrorResponse } from "@/lib/errors";

// PUT — update a coupon
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, dbUser } = await getServerUser();
  if (!user || !dbUser || dbUser.role !== "admin") {
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
    return apiErrorResponse(error, "Failed to update coupon");
  }
}

// DELETE — delete a coupon
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, dbUser } = await getServerUser();
  if (!user || !dbUser || dbUser.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    await prisma.coupon.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return apiErrorResponse(error, "Failed to delete coupon");
  }
}
