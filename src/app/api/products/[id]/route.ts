import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

// GET — Dettaglio singolo prodotto
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        translations: true,
        lessons: {
          orderBy: { position: "asc" },
          include: { translations: true },
        },
      },
    });

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    return NextResponse.json(product);
  } catch (error) {
    console.error("GET /api/products/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch product" },
      { status: 500 }
    );
  }
}

// PUT — Aggiorna un prodotto
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const body = await request.json();
    const { slug, price, coverUrl, status, templateId, lemonVariantId, translations, lessons, sourceLocale, translationsByLocale, pricesByCurrency, countryOverrides } = body;

    const product = await prisma.$transaction(async (tx) => {
      // Aggiorna il prodotto
      const p = await tx.product.update({
        where: { id },
        data: {
          ...(slug && { slug }),
          ...(price !== undefined && { price }),
          ...(coverUrl !== undefined && { coverUrl }),
          ...(status && { status }),
          ...(templateId && { templateId }),
          ...(lemonVariantId !== undefined && { lemonVariantId }),
          ...(pricesByCurrency !== undefined && { pricesByCurrency: pricesByCurrency ? JSON.stringify(pricesByCurrency) : null }),
          ...(countryOverrides !== undefined && { countryOverrides: countryOverrides ? JSON.stringify(countryOverrides) : null }),
        },
      });

      // Aggiorna traduzioni (lingua sorgente)
      if (translations && typeof translations === "object") {
        for (const [section, content] of Object.entries(translations)) {
          if (typeof content === "string" && content.trim() !== "") {
            await tx.productTranslation.upsert({
              where: {
                productId_locale_section: {
                  productId: id,
                  locale: sourceLocale ?? "it",
                  section,
                },
              },
              update: { content },
              create: {
                productId: id,
                locale: sourceLocale || "it",
                section,
                content,
              },
            });
          }
        }
      }

      // Salva le traduzioni AI per altre lingue
      if (translationsByLocale && typeof translationsByLocale === "object") {
        for (const [locale, sections] of Object.entries(translationsByLocale)) {
          if (locale === (sourceLocale ?? "it")) continue;
          if (typeof sections === "object" && sections !== null) {
            for (const [section, content] of Object.entries(sections)) {
              if (typeof content === "string" && content.trim() !== "") {
                await tx.productTranslation.upsert({
                  where: {
                    productId_locale_section: {
                      productId: id,
                      locale,
                      section,
                    },
                  },
                  update: { content },
                  create: {
                    productId: id,
                    locale,
                    section,
                    content,
                  },
                });
              }
            }
          }
        }
      }

      // Aggiorna lezioni
      if (lessons && Array.isArray(lessons)) {
        // Elimina lezioni esistenti e ricrea
        await tx.lesson.deleteMany({ where: { productId: id } });

        for (let i = 0; i < lessons.length; i++) {
          const lesson = lessons[i];
          if (lesson.title) {
            const l = await tx.lesson.create({
              data: {
                productId: id,
                position: i + 1,
              },
            });

            await tx.lessonTranslation.create({
              data: {
                lessonId: l.id,
                locale: sourceLocale || "it",
                title: lesson.title,
                videoUrl: lesson.videoUrl || null,
              },
            });
          }
        }
      }

      return p;
    });

    // Auto-sync: rigenera config su DB + disco
    try {
      const { generateCourseConfig } = await import("@/lib/config/generate-course-config");
      await generateCourseConfig(product.slug);
    } catch (syncError) {
      console.error("[Auto-sync] Failed to generate config:", syncError);
    }

    return NextResponse.json({ success: true, product });
  } catch (error) {
    console.error("PUT /api/products/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to update product" },
      { status: 500 }
    );
  }
}

// DELETE — Elimina un prodotto
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    await prisma.product.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/products/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to delete product" },
      { status: 500 }
    );
  }
}
