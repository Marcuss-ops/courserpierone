import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { apiErrorResponse } from "@/lib/errors";
import { revalidateProduct } from "@/lib/admin/revalidate-product";
import { withRateLimit } from "@/lib/utils/rate-limit";
import { requireAdmin } from "@/lib/auth/require-admin";
import { requireCreatorOrAdmin } from "@/lib/auth/require-creator-or-admin";

// GET — Dettaglio singolo prodotto
export const GET = withRateLimit(async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const authError = await requireAdmin();
    if (authError) return authError;

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
}, "AUTH");

// PUT — Aggiorna un prodotto
export const PUT = withRateLimit(async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const { response: authError, user: authorized } = await requireCreatorOrAdmin("publish");
    if (authError) return authError;
    if (!authorized) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const existingProduct = await prisma.product.findUnique({ where: { id } });
    if (!existingProduct) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    if (authorized.role !== "admin" && existingProduct.creatorId !== authorized.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

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
        const deleteWhere: Record<string, unknown> = { productId: id };
        if (incomingIds.length > 0) {
          deleteWhere.id = { notIn: incomingIds };
        }
        await tx.lesson.deleteMany({ where: deleteWhere });

        for (let i = 0; i < lessons.length; i++) {
          const lesson = lessons[i] as {
            id?: string;
            translations?: Record<string, { title?: string; videoUrl?: string; description?: string }>;
            assets?: { id?: string; type: string; locale: string; fileUrl: string; fileName?: string | null }[];
          };

          let l;
          if (lesson.id) {
            l = await tx.lesson.update({
              where: { id: lesson.id },
              data: { position: i + 1 },
            });
          } else {
            l = await tx.lesson.create({
              data: { productId: id, position: i + 1 },
            });
          }

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
            const assetDeleteWhere: Record<string, unknown> = { lessonId: l.id };
            if (assetIds.length > 0) {
              assetDeleteWhere.id = { notIn: assetIds };
            }
            await tx.lessonAsset.deleteMany({ where: assetDeleteWhere });

            for (const asset of lesson.assets) {
              if (!asset.fileUrl) continue;
              if (asset.id) {
                await tx.lessonAsset.update({
                  where: { id: asset.id },
                  data: {
                    type: asset.type,
                    locale: asset.locale,
                    fileUrl: asset.fileUrl,
                    fileName: asset.fileName || null,
                  },
                });
              } else {
                await tx.lessonAsset.create({
                  data: {
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

    // Invalida la cache delle pagine pubbliche
    const updatedLocales = [
      sourceLocale ?? "it",
      ...Object.keys(translationsByLocale ?? {}),
    ];
    revalidateProduct(product.slug, updatedLocales);

    return NextResponse.json({ success: true, product });
  } catch (error) {
    return apiErrorResponse(error, "Failed to update product");
  }
}, "AUTH");

// DELETE — Elimina un prodotto
export const DELETE = withRateLimit(async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const authError = await requireAdmin();
    if (authError) return authError;

    await prisma.product.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return apiErrorResponse(error, "Failed to delete product");
  }
}, "AUTH");
