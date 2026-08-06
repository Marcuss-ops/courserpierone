import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { apiErrorResponse } from "@/lib/errors";
import { revalidateProduct } from "@/lib/admin/revalidate-product";
import { withRateLimit } from "@/lib/utils/rate-limit";
import { requireAdmin } from "@/domains/identity";
import { requireCreatorOrAdmin } from "@/lib/auth/require-creator-or-admin";
import { countryOverridesSchema, pricesByCurrencySchema } from "@/lib/parsers/schemas";

// GET — Lista tutti i prodotti (admin only)
export const GET = withRateLimit(
  async function GET() {
    try {
      const authError = await requireAdmin();
      if (authError) return authError;
      const products = await prisma.product.findMany({
        where: { deletedAt: null },
        include: {
          translations: { select: { locale: true } },
          _count: { select: { lessons: true } },
          orders: { where: { status: "completed" } },
        },
        orderBy: { createdAt: "desc" },
      });

      // Formatta per la response
      const formatted = await Promise.all(
        products.map(async (p) => {
          const pageviews = await prisma.analyticEvent.count({
            where: {
              OR: [{ productSlug: p.slug }, { productId: p.id }, { productId: p.slug }],
              eventType: "pageview",
            },
          });
          const purchases = p.orders.length;
          const conversion = pageviews > 0 ? ((purchases / pageviews) * 100).toFixed(1) + "%" : "0%";
          const productRevenue = p.orders.reduce((sum, o) => sum + o.amount, 0) / 100;

          return {
            id: p.id,
            slug: p.slug,
            price: p.price,
            currency: p.currency,
            pricesByCurrency: p.pricesByCurrency,
            status: p.status,
            coverUrl: p.coverUrl,
            templateId: p.templateId,
            lessonsCount: p._count.lessons,
            locales: Array.from(new Set(p.translations.map((t: { locale: string }) => t.locale))),
            createdAt: p.createdAt,
            revenue: productRevenue,
            conversion,
          };
        })
      );

      return NextResponse.json(formatted);
    } catch (error) {
      return apiErrorResponse(error, "Failed to fetch products");
    }
  },
  "AUTH"
);

// POST — Crea un nuovo prodotto
export const POST = withRateLimit(async function POST(request: NextRequest) {
  try {
    const { response: authError, user: authorized } = await requireCreatorOrAdmin("create");
    if (authError) return authError;
    if (!authorized) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await request.json();
    const { slug, price, coverUrl, translations, lessons, sourceLocale, templateId, lemonVariantId, translationsByLocale, pricesByCurrency, countryOverrides } = body;

    if (!slug || !translations) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const parsedPrices = pricesByCurrencySchema.safeParse(pricesByCurrency ?? {});
    const parsedCountryOverrides = countryOverridesSchema.safeParse(countryOverrides ?? {});
    if (!parsedPrices.success || !parsedCountryOverrides.success) {
      return NextResponse.json(
        { error: "Invalid product pricing configuration" },
        { status: 400 },
      );
    }

    // Crea prodotto + traduzioni in una transazione
    const product = await prisma.$transaction(async (tx) => {
      const p = await tx.product.create({
        data: {
          slug,
          price: price ?? 0,
          coverUrl: coverUrl ?? null,
          status: "draft",
          templateId: templateId ?? "lumio",
          lemonVariantId: lemonVariantId ?? null,
          pricesByCurrency: pricesByCurrency == null ? Prisma.DbNull : parsedPrices.data,
          countryOverrides: countryOverrides == null ? Prisma.DbNull : parsedCountryOverrides.data,
          // Phase 6: creatorId è REQUIRED. L'utente autorizzato diventa
          // il creator canonico del prodotto.
          creatorId: authorized.userId,
        },
      });

      // Salva le traduzioni (lingua sorgente)
      for (const [section, content] of Object.entries(translations)) {
        if (typeof content === "string" && content.trim() !== "") {
          await tx.productTranslation.create({
            data: {
              productId: p.id,
              locale: sourceLocale ?? "it",
              section,
              content,
            },
          });
        }
      }

      // Salva le traduzioni AI per altre lingue
      if (translationsByLocale && typeof translationsByLocale === "object") {
        for (const [locale, sections] of Object.entries(translationsByLocale)) {
          if (locale === (sourceLocale ?? "it")) continue; // già salvate sopra
          if (typeof sections === "object" && sections !== null) {
            for (const [section, content] of Object.entries(sections)) {
              if (typeof content === "string" && content.trim() !== "") {
                await tx.productTranslation.upsert({
                  where: {
                    productId_locale_section: {
                      productId: p.id,
                      locale,
                      section,
                    },
                  },
                  update: { content },
                  create: {
                    productId: p.id,
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

      // Salva le lezioni con traduzioni e asset
      if (lessons && Array.isArray(lessons)) {
        for (let i = 0; i < lessons.length; i++) {
          const lesson = lessons[i] as {
            translations?: Record<string, { title?: string; videoUrl?: string; description?: string }>;
            assets?: { type?: string; locale?: string; fileUrl?: string; fileName?: string | null }[];
          };

          const hasContent =
            lesson.translations &&
            Object.values(lesson.translations).some((t) => t.title?.trim());

          if (!hasContent) continue;

          const l = await tx.lesson.create({
            data: {
              productId: p.id,
              position: i + 1,
            },
          });

          // Salva le traduzioni della lezione
          if (lesson.translations && typeof lesson.translations === "object") {
            for (const [locale, t] of Object.entries(lesson.translations)) {
              if (!t.title?.trim()) continue;
              await tx.lessonTranslation.create({
                data: {
                  lessonId: l.id,
                  locale,
                  title: t.title,
                  videoUrl: t.videoUrl || null,
                  description: t.description || null,
                },
              });
            }
          }

          // Salva gli asset della lezione
          if (lesson.assets && Array.isArray(lesson.assets)) {
            for (const asset of lesson.assets) {
              if (!asset.fileUrl || !asset.locale) continue;
              await tx.lessonAsset.create({
                data: {
                  lessonId: l.id,
                  type: asset.type || "resource",
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
      await generateCourseConfig(slug);
    } catch (syncError) {
      console.error("[Auto-sync] Failed to generate config:", syncError);
    }

    // Invalida la cache delle pagine pubbliche
    const updatedLocales = [
      sourceLocale ?? "it",
      ...Object.keys(translationsByLocale ?? {}),
    ];
    revalidateProduct(slug, updatedLocales);

    return NextResponse.json({ success: true, product });
  } catch (error) {
    return apiErrorResponse(error, "Failed to create product");
  }
}, "AUTH");
