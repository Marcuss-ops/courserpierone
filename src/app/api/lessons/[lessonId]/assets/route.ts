import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { apiErrorResponse } from "@/lib/errors";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ lessonId: string }> }
) {
  try {
    const { lessonId } = await params;
    const { searchParams } = request.nextUrl;
    const locale = searchParams.get("locale") ?? "it";

    const assets = await prisma.lessonAsset.findMany({
      where: {
        lessonId,
        OR: [{ locale }, { locale: "it" }], // fallback a italiano
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ assets });
  } catch (error) {
    return apiErrorResponse(error, "Failed to fetch assets");
  }
}
