import fs from "fs";
import path from "path";
import { prisma } from "./prisma";

const IS_VERCEL = process.env.VERCEL === "1";

export interface CourseConfig {
  slug: string;
  productId: string;
  template: "lumio" | "h612" | "horizon" | "book-claude";
  defaultLanguage: string;
  cover: string;
  checkoutUrl: string;
  author: string;
  price: number;
  prices?: Record<string, { amount: number; currency: string; symbol: string }>;
  lemonVariantId?: string;
  languages: Record<string, {
    title: string;
    problem: string;
    story: string;
    cta: string;
    description: string;
    ebookTitle: string;
    ebookContent: string;
    /** Traduzioni UI (labels, benefits, faq) memorizzate come JSON nella sezione ui_all */
    ui?: {
      labels: Record<string, string>;
      benefits: { title: string; desc: string }[];
      faq: { q: string; a: string }[];
    };
  }>;
  lessons: {
    number: number;
    id: string;
    titles: Record<string, string>;
    descriptions: Record<string, string>;
    videos: Record<string, string>;
    duration: string;
  }[];
  ebookChapters: { it: string; en: string; page: number }[];
}

export async function generateCourseConfig(slug: string) {
  const product = await prisma.product.findUnique({
    where: { slug },
    include: {
      translations: true,
      lessons: { orderBy: { position: "asc" }, include: { translations: true } },
    },
  });

  if (!product) throw new Error(`Product ${slug} not found`);

  // Group translations by locale and section
  const translationsByLocale: Record<string, Record<string, string>> = {};
  for (const t of product.translations) {
    if (!translationsByLocale[t.locale]) translationsByLocale[t.locale] = {};
    translationsByLocale[t.locale][t.section] = t.content;
  }

  // Build languages object
  const languages: CourseConfig["languages"] = {};
  const locales = Object.keys(translationsByLocale).length > 0 ? Object.keys(translationsByLocale) : ["it"];    function safeParseUi(raw: string | undefined) {
      if (!raw) return undefined;
      try { return JSON.parse(raw); } catch { return undefined; }
    }

    for (const locale of locales) {
      const t = translationsByLocale[locale] || {};
      // UI fallback: se la lingua non ha ui_all, usa quella inglese
      const ui = safeParseUi(t.ui_all) ?? safeParseUi(translationsByLocale["en"]?.ui_all) ?? undefined;
      languages[locale] = {
        title: t.titolo ?? product.slug,
        problem: t.problema ?? "",
        story: t.storia ?? "",
        cta: t.cta ?? "Inizia Ora",
        description: t.sottotitolo ?? "",
        ebookTitle: t.titolo ?? product.slug,
        ebookContent: t.storia ?? "",
        ui,
      };
    }

  // Build lessons
  const lessons: CourseConfig["lessons"] = product.lessons.map((lesson, i) => {
    const ltByLocale: Record<string, { title: string; description: string; videoUrl: string }> = {};
    for (const lt of lesson.translations) {
      ltByLocale[lt.locale] = {
        title: lt.title,
        description: lt.description || "",
        videoUrl: lt.videoUrl || "",
      };
    }

    const titles: Record<string, string> = {};
    const descriptions: Record<string, string> = {};
    const videos: Record<string, string> = {};

    for (const locale of locales) {
      titles[locale] = ltByLocale[locale]?.title || ltByLocale.it?.title || "Lezione";
      descriptions[locale] = ltByLocale[locale]?.description || "";
      videos[locale] = ltByLocale[locale]?.videoUrl || "";
    }

    return {
      number: lesson.position,
      id: `lesson-${lesson.position}`,
      titles,
      descriptions,
      videos,
      duration: "15:00",
    };
  });

  const config: CourseConfig = {
    slug: product.slug,
    productId: product.id,
    template: (product.templateId as "lumio" | "h612" | "horizon") || "lumio",
    defaultLanguage: "it",
    cover: product.coverUrl || "/placeholder-cover.jpg",
    checkoutUrl: "#",
    author: "Brand",
    price: product.price / 100,
    prices: product.pricesByCurrency ? (() => {
      const raw = JSON.parse(product.pricesByCurrency) as Record<string, { price: number }>;
      return Object.fromEntries(
        Object.entries(raw).map(([code, p]) => [code, {
          amount: p.price / 100,
          currency: code,
          symbol: code === "EUR" ? "€" : code === "USD" ? "$" : code === "GBP" ? "£" : code,
        }])
      );
    })() : undefined,
    lemonVariantId: product.lemonVariantId || undefined,
    languages,
    lessons,
    ebookChapters: [],
  };

  // Salva su disco (solo se non siamo su Vercel)
  if (!IS_VERCEL) {
    const courseDir = path.join(process.cwd(), "public", "courses", slug);
    if (!fs.existsSync(courseDir)) {
      fs.mkdirSync(courseDir, { recursive: true });
    }
    fs.writeFileSync(path.join(courseDir, "config.json"), JSON.stringify(config, null, 2), "utf8");
  }

  // Salva su DB come cache (funziona ovunque, incluso Vercel)
  await prisma.courseConfigCache.upsert({
    where: { slug },
    update: { config: JSON.stringify(config), version: { increment: 1 } },
    create: { slug, config: JSON.stringify(config) },
  });

  return config;
}
