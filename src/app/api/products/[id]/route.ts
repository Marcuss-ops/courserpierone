import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { apiErrorResponse } from "@/lib/errors";

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
          include: { translations: true, assets: true },
        },
      },
    });

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    return NextResponse.json(product);
  } catch (error) {
    return apiErrorResponse(error, "Failed to fetch product");
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

      // Aggiorna lezioni preservando ID ed evitando di perdere progressi
      if (lessons && Array.isArray(lessons)) {
        const incomingIds = lessons
          .map((l: { id?: string }) => l.id)
          .filter((id): id is string => Boolean(id));

        // Rimuovi le lezioni eliminate dall'admin
        await tx.lesson.deleteMany({
          where: { productId: id, id: { notIn: incomingIds.length > 0 ? incomingIds : [""] } },
        });

        for (let i = 0; i < lessons.length; i++) {
          const lesson = lessons[i] as {
            id?: string;
            translations?: Record<string, { title?: string; videoUrl?: string; description?: string }>;
            assets?: { id?: string; type: string; locale: string; fileUrl: string; fileName?: string | null }[];
          };

          const l = await tx.lesson.upsert({
            where: { id: lesson.id || "temp" },
            update: { position: i + 1 },
            create: { productId: id, position: i + 1 },
          });

          // Aggiorna traduzioni della lezione
          if (lesson.translations && typeof lesson.translations === "object") {
            for (const [locale, t] of Object.entries(lesson.translations)) {
              if (!t.title?.trim()) continue;
              await tx.lessonTranslation.upsert({
                where: { lessonId_locale: { lessonId: l.id, locale } },
                update: {
                  title: t.title,
                  videoUrl: t.videoUrl || null,
                  description: t.description || null,
                },
                create: {
                  lessonId: l.id,
                  locale,
                  title: t.title,
                  videoUrl: t.videoUrl || null,
                  description: t.description || null,
                },
              });
            }
          }

          // Aggiorna asset della lezione
          if (lesson.assets && Array.isArray(lesson.assets)) {
            const assetIds = lesson.assets
              .map((a: { id?: string }) => a.id)
              .filter((id): id is string => Boolean(id));
            await tx.lessonAsset.deleteMany({
              where: { lessonId: l.id, id: { notIn: assetIds.length > 0 ? assetIds : [""] } },
            });

            for (const asset of lesson.assets) {
              if (!asset.fileUrl) continue;
              await tx.lessonAsset.upsert({
                where: { id: asset.id || "temp" },
                update: {
                  type: asset.type,
                  locale: asset.locale,
                  fileUrl: asset.fileUrl,
                  fileName: asset.fileName || null,
                },
                create: {
                  lessonId: l.id,
                  type: asset.type,
                  locale: asset.locale,
                  fileUrl: asset.fileUrl,
                  fileName: asset.fileName || null,
                },
              });
            }
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
    return apiErrorResponse(error, "Failed to update product");
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
    return apiErrorResponse(error, "Failed to delete product");
  }
}
