import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token } = body;

    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    const magicLink = await prisma.magicLink.findUnique({ where: { token } });

    if (!magicLink) {
      return NextResponse.json({ error: "Invalid token" }, { status: 404 });
    }

    if (magicLink.used) {
      return NextResponse.json({ error: "Token already used" }, { status: 400 });
    }

    if (magicLink.expiresAt < new Date()) {
      return NextResponse.json({ error: "Token expired" }, { status: 400 });
    }

    // Mark as used
    await prisma.magicLink.update({
      where: { id: magicLink.id },
      data: { used: true },
    });

    // Find or create user
    let user = await prisma.user.findUnique({ where: { email: magicLink.email } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: magicLink.email,
          name: magicLink.email.split("@")[0],
          role: "student",
        },
      });
    }

    return NextResponse.json({
      success: true,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      productId: magicLink.productId,
    });
  } catch (error) {
    console.error("POST /api/auth/verify-magic-link error:", error);
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }
}
