import fs from "fs";
import path from "path";
import { prisma } from "../db/prisma";
import { parseCourseConfig, type CourseConfig, type CourseConfigOverrides } from "./course-config-schema";

const IS_VERCEL = process.env.VERCEL === "1";

export type { CourseConfig } from "./course-config-schema";

export async function generateCourseConfig(slug: string): Promise<CourseConfig> {
  let existingConfig: CourseConfigOverrides = {};
  const configPath = path.join(process.cwd(), "courses", slug, "config.json");
  if (fs.existsSync(configPath)) {
    const parsed = parseCourseConfig(JSON.parse(fs.readFileSync(configPath, "utf8")));
    if (parsed.slug !== slug) {
      throw new Error(`Course config slug mismatch: expected ${slug}, got ${parsed.slug}`);
    }
    existingConfig = parsed;
  }

  const product = await prisma.product.findUnique({
    where: { slug },
    include: {
      translations: true,
      lessons: { orderBy: { position: "asc" }, include: { translations: true } },
    },
  });
  if (!product) throw new Error(`Product ${slug} not found`);

  const translationsByLocale: Record<string, Record<string, string>> = {};
  for (const translation of product.translations) {
    translationsByLocale[translation.locale] ??= {};
    translationsByLocale[translation.locale][translation.section] = translation.content;
  }

  const locales = Object.keys(translationsByLocale).length > 0 ? Object.keys(translationsByLocale) : ["it"];
  const languages: CourseConfig["languages"] = {};

  function safeParseUi(raw: string | undefined): CourseConfig["languages"][string]["ui"] {
    if (!raw) return undefined;
    try {
      return JSON.parse(raw) as CourseConfig["languages"][string]["ui"];
    } catch {
      return undefined;
    }
  }

  for (const locale of locales) {
    const translation = translationsByLocale[locale] ?? {};
    const ui = safeParseUi(translation.ui_all) ?? safeParseUi(translationsByLocale.en?.ui_all);
    const seoTitle = translation.seo_title || `${translation.titolo ?? product.slug} — Courssy`;
    const seoDescription = translation.seo_description || (translation.sottotitolo || translation.problema || "").slice(0, 160);
    const ogImage = translation.og_image || product.coverUrl || undefined;

    languages[locale] = {
      title: translation.titolo ?? product.slug,
      problem: translation.problema ?? "",
      story: translation.storia ?? "",
      cta: translation.cta ?? "Inizia Ora",
      description: translation.sottotitolo ?? "",
      ebookTitle: translation.titolo ?? product.slug,
      ebookContent: translation.storia ?? "",
      seo: { title: seoTitle, description: seoDescription, ...(ogImage ? { ogImage } : {}) },
      ui,
    };
  }

  const lessons: CourseConfig["lessons"] = product.lessons.map((lesson) => {
    const byLocale: Record<string, { title: string; description: string; videoUrl: string }> = {};
    for (const translation of lesson.translations) {
      byLocale[translation.locale] = {
        title: translation.title,
        description: translation.description || "",
        videoUrl: translation.videoUrl || "",
      };
    }
    const titles: Record<string, string> = {};
    const descriptions: Record<string, string> = {};
    const videos: Record<string, string> = {};
    for (const locale of locales) {
      titles[locale] = byLocale[locale]?.title || byLocale.it?.title || "Lezione";
      descriptions[locale] = byLocale[locale]?.description || "";
      videos[locale] = byLocale[locale]?.videoUrl || "";
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

  const currencySymbols: Record<string, string> = {
    EUR: "€", USD: "$", GBP: "£", JPY: "¥", BRL: "R$", CAD: "CA$", AUD: "A$",
    CHF: "CHF", SEK: "kr", NOK: "kr", DKK: "kr", PLN: "zł", MXN: "MX$", INR: "₹",
    CNY: "¥", KRW: "₩", RUB: "₽", TRY: "₺", ZAR: "R", SGD: "S$", HKD: "HK$",
    TWD: "NT$", AED: "د.إ", SAR: "﷼",
  };

  const prices = product.pricesByCurrency
    ? Object.fromEntries(
        Object.entries(JSON.parse(product.pricesByCurrency) as Record<string, { price: number; symbol?: string }>).map(
          ([code, value]) => [code, { amount: value.price / 100, currency: code, symbol: value.symbol ?? currencySymbols[code] ?? code }],
        ),
      )
    : undefined;

  const countryOverrides = product.countryOverrides
    ? JSON.parse(product.countryOverrides) as CourseConfig["countryOverrides"]
    : undefined;

  const config = parseCourseConfig({
    slug: product.slug,
    productId: product.id,
    template: product.templateId || "lumio",
    defaultLanguage: existingConfig.defaultLanguage || "it",
    cover: product.coverUrl || existingConfig.cover || "/placeholder-cover.jpg",
    authorImageUrl: existingConfig.authorImageUrl,
    storyImages: existingConfig.storyImages,
    accentColor: existingConfig.accentColor,
    checkoutUrl: existingConfig.checkoutUrl || "#",
    author: existingConfig.author || "Brand",
    price: product.price / 100,
    prices,
    countryOverrides,
    lemonVariantId: product.lemonVariantId || undefined,
    languages,
    lessons,
    ebookChapters: existingConfig.ebookChapters || [],
  });

  if (!IS_VERCEL) {
    const courseDir = path.join(process.cwd(), "courses", slug);
    if (!fs.existsSync(courseDir)) fs.mkdirSync(courseDir, { recursive: true });
    fs.writeFileSync(path.join(courseDir, "config.json"), JSON.stringify(config, null, 2), "utf8");
  }

  await prisma.courseConfigCache.upsert({
    where: { slug },
    update: { config: JSON.stringify(config), version: { increment: 1 } },
    create: { slug, config: JSON.stringify(config) },
  });

  return config;
}
