import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { apiErrorResponse } from "@/lib/errors";
import { requireAdmin } from "@/lib/auth/require-admin";

// GET — Lista tutti i prodotti
export async function GET() {
  try {
    const authError = await requireAdmin();
    if (authError) return authError;
    const products = await prisma.product.findMany({
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
          where: { productId: p.slug, eventType: "pageview" },
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
}

// POST — Crea un nuovo prodotto
export async function POST(request: NextRequest) {
  try {
    const authError = await requireAdmin();
    if (authError) return authError;
    const body = await request.json();
    const { slug, price, coverUrl, translations, lessons, sourceLocale, templateId, lemonVariantId, translationsByLocale, pricesByCurrency, countryOverrides } = body;

    if (!slug || !translations) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
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
          pricesByCurrency: pricesByCurrency ? JSON.stringify(pricesByCurrency) : null,
          countryOverrides: countryOverrides ? JSON.stringify(countryOverrides) : null,
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

      // Salva le lezioni
      if (lessons && Array.isArray(lessons)) {
        for (let i = 0; i < lessons.length; i++) {
          const lesson = lessons[i];
          if (lesson.title) {
            const l = await tx.lesson.create({
              data: {
                productId: p.id,
                position: i + 1,
              },
            });

            await tx.lessonTranslation.create({
              data: {
                lessonId: l.id,
                locale: sourceLocale ?? "it",
                title: lesson.title,
                videoUrl: lesson.videoUrl ?? null,
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
      await generateCourseConfig(slug);
    } catch (syncError) {
      console.error("[Auto-sync] Failed to generate config:", syncError);
    }

    return NextResponse.json({ success: true, product });
  } catch (error) {
    return apiErrorResponse(error, "Failed to create product");
  }
}
