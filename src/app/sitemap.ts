import { prisma } from "@/lib/prisma";
import type { MetadataRoute } from "next";

const ALL_LOCALES = [
  "it-it", "en-us", "en-gb", "fr-fr", "de-de", "es-es", "pt-pt",
  "nl-nl", "pl-pl", "sv-se", "da-dk", "nb-no", "fi-fi", "ro-ro",
  "cs-cz", "hu-hu", "el-gr", "bg-bg", "hr-hr", "sk-sk", "sl-si",
  "lt-lt", "lv-lv", "et-ee", "de-at", "de-ch", "fr-ch", "it-ch",
  "nl-be", "fr-be", "en-ie", "en-ca", "fr-ca", "es-mx", "pt-br",
  "es-ar", "es-co", "es-cl", "es-pe", "en-au", "en-nz",
  "ja-jp", "ko-kr", "zh-cn", "zh-tw", "zh-hk", "hi-in", "en-in",
  "tr-tr", "th-th", "vi-vn", "id-id", "ms-my", "en-sg", "en-ph",
  "ur-pk", "bn-bd", "ar-ae", "ar-sa", "ar-eg", "he-il",
  "ta-in", "te-in", "mr-in", "en-za", "en-ng", "en-ke", "fr-ma",
  "ru-ru", "uk-ua", "ro-md",
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const host = process.env.VERCEL_ENV === "production"
    ? "https://www.courssy.com"
    : `https://${process.env.VERCEL_URL || "www.courssy.com"}`;

  const entries: MetadataRoute.Sitemap = [];

  // ── Root static pages ──
  entries.push({ url: host, lastModified: new Date(), changeFrequency: "weekly", priority: 1.0 });
  entries.push({ url: `${host}/privacy`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.3 });
  entries.push({ url: `${host}/terms`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.3 });

  // ── Product pages ──
  try {
    const products = await prisma.product.findMany({
      where: { status: "published" },
      select: { slug: true, updatedAt: true },
      orderBy: { slug: "asc" },
    });

    for (const product of products) {
      // Root product URL (redirects to detected locale)
      entries.push({
        url: `${host}/${product.slug}`,
        lastModified: product.updatedAt,
        changeFrequency: "weekly",
        priority: 0.9,
      });

      // Locale-prefixed product pages
      for (const loc of ALL_LOCALES) {
        entries.push({
          url: `${host}/${loc}/${product.slug}`,
          lastModified: product.updatedAt,
          changeFrequency: "weekly",
          priority: loc === "en-us" ? 0.8 : 0.7,
        });
      }
    }
  } catch (error) {
    console.error("Sitemap: error reading products", error);
  }

  return entries;
}
