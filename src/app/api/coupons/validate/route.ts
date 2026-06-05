import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const productId = searchParams.get("productId");
  const amount = searchParams.get("amount"); // in centesimi

  if (!code) {
    return NextResponse.json({ error: "Missing code parameter" }, { status: 400 });
  }

  try {
    const coupon = await prisma.coupon.findUnique({
      where: { code: code.toUpperCase().replace(/\s+/g, "") },
    });

    if (!coupon) {
      return NextResponse.json({ valid: false, error: "Coupon non trovato" }, { status: 404 });
    }

    if (!coupon.isActive) {
      return NextResponse.json({ valid: false, error: "Coupon disattivato" }, { status: 400 });
    }

    if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
      return NextResponse.json({ valid: false, error: "Coupon scaduto" }, { status: 400 });
    }

    if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) {
      return NextResponse.json({ valid: false, error: "Coupon esaurito" }, { status: 400 });
    }

    if (coupon.productId && coupon.productId !== productId) {
      return NextResponse.json({ valid: false, error: "Coupon non valido per questo prodotto" }, { status: 400 });
    }

    if (coupon.minAmount && amount && Number(amount) < coupon.minAmount) {
      return NextResponse.json({ valid: false, error: `Importo minimo non raggiunto (min: ${coupon.minAmount / 100})` }, { status: 400 });
    }

    // Calculate discount
    let discountAmount = 0;
    if (coupon.type === "percent" && amount) {
      discountAmount = Math.round(Number(amount) * (coupon.value / 100));
    } else if (coupon.type === "fixed") {
      discountAmount = coupon.value;
    }

    return NextResponse.json({
      valid: true,
      coupon: {
        id: coupon.id,
        code: coupon.code,
        type: coupon.type,
        value: coupon.value,
        description: coupon.description,
      },
      discountAmount,
    });
  } catch (error) {
    console.error("GET /api/coupons/validate error:", error);
    return NextResponse.json({ error: "Validation failed" }, { status: 500 });
  }
}
