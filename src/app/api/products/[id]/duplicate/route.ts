import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { apiErrorResponse } from "@/lib/errors";
import { requireAdmin } from "@/lib/auth/require-admin";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authError = await requireAdmin();
    if (authError) return authError;

    const { id } = await params;

    const original = await prisma.product.findUnique({
      where: { id },
      include: {
        translations: true,
        lessons: {
          orderBy: { position: "asc" },
          include: { translations: true, assets: true },
        },
      },
    });

    if (!original) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    // Generate a unique slug
    const timestamp = Date.now().toString().slice(-6);
    const baseSlug = `${original.slug}-copy-${timestamp}`;
    let newSlug = baseSlug;
    let suffix = 0;

    while (await prisma.product.findUnique({ where: { slug: newSlug } })) {
      suffix += 1;
      newSlug = `${baseSlug}-${suffix}`;
    }

    const duplicate = await prisma.product.create({
      data: {
        slug: newSlug,
        coverUrl: original.coverUrl,
        templateId: original.templateId,
        lemonVariantId: original.lemonVariantId,
        lemonStoreId: original.lemonStoreId,
        price: original.price,
        currency: original.currency,
        status: "draft",
        pricesByCurrency: original.pricesByCurrency,
        countryOverrides: original.countryOverrides,
        defaultLanguage: original.defaultLanguage,
        // Phase 4 hardening: preserva l'identità del creator originale.
        creatorId: original.creatorId,
        translations: {
          create: original.translations.map((t) => ({
            locale: t.locale,
            section: t.section,
            content: t.content,
          })),
        },
        lessons: {
          create: original.lessons.map((l) => ({
            position: l.position,
            translations: {
              create: l.translations.map((lt) => ({
                locale: lt.locale,
                title: lt.title,
                videoUrl: lt.videoUrl,
                description: lt.description,
              })),
            },
            assets: {
              create: l.assets.map((a) => ({
                type: a.type,
                locale: a.locale,
                fileUrl: a.fileUrl,
                fileName: a.fileName,
              })),
            },
          })),
        },
      },
    });

    return NextResponse.json({ success: true, product: duplicate });
  } catch (error) {
    return apiErrorResponse(error, "Failed to duplicate product");
  }
}
