import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { randomBytes } from "crypto";
import { sendMagicLinkEmail } from "@/lib/services/email";
import { magicLinkSchema } from "@/lib/utils/validations";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = magicLinkSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Email non valida" }, { status: 400 });
    }

    const { email, productId } = parsed.data;

    // Check if user has order for this product
    let hasAccess = false;
    let productName: string | undefined;
    if (productId) {
      const product = await prisma.product.findUnique({ where: { slug: productId } });
      if (product) {
        productName = product.slug;
        const user = await prisma.user.findUnique({
          where: { email },
          include: { orders: { where: { productId: product.id, status: "completed" } } },
        });
        hasAccess = !!user && user.orders.length > 0;
      }
    }

    // Generate magic token
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    await prisma.magicLink.create({
      data: { email, token, productId: productId || null, expiresAt },
    });

    const magicUrl = `${process.env.NEXT_PUBLIC_APP_URL}/login/verify?token=${token}${productId ? `&productId=${productId}` : ""}`;

    // Invia email col magic link (in sviluppo logga al terminale, in produzione spedisce)
    await sendMagicLinkEmail(email, magicUrl, productName);

    return NextResponse.json({ success: true, magicUrl, hasAccess });
  } catch (error) {
    console.error("POST /api/magic-link error:", error);
    return NextResponse.json({ error: "Failed to generate magic link" }, { status: 500 });
  }
}
