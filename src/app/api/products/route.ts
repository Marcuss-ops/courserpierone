import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET — Lista tutti i prodotti
export async function GET() {
  try {
    const products = await prisma.product.findMany({
      include: {
        translations: { select: { locale: true } },
        _count: { select: { lessons: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    // Formatta per la response
    const formatted = products.map((p) => ({
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
    }));

    return NextResponse.json(formatted);
  } catch (error) {
    console.error("GET /api/products error:", error);
    return NextResponse.json(
      { error: "Failed to fetch products" },
      { status: 500 }
    );
  }
}

// POST — Crea un nuovo prodotto
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { slug, price, coverUrl, translations, lessons, sourceLocale, templateId, lemonVariantId, translationsByLocale, pricesByCurrency } = body;

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
      const { generateCourseConfig } = await import("@/lib/generate-course-config");
      await generateCourseConfig(slug);
    } catch (syncError) {
      console.error("[Auto-sync] Failed to generate config:", syncError);
    }

    return NextResponse.json({ success: true, product });
  } catch (error) {
    console.error("POST /api/products error:", error);
    return NextResponse.json(
      { error: "Failed to create product" },
      { status: 500 }
    );
  }
}
