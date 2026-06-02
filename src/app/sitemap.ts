import { prisma } from "@/lib/prisma";
import type { MetadataRoute } from "next";

const LANGUAGES = ["it", "en", "fr", "es", "de", "pt", "nl", "pl", "sv", "da", "no", "fi", "ro", "cs", "hu", "el", "ja", "ko", "zh", "ar", "hi", "tr", "th", "vi", "id", "ms", "ru"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const host = process.env.VERCEL_ENV === "production"
    ? "https://www.courssy.com"
    : `https://${process.env.VERCEL_URL || "www.courssy.com"}`;

  const entries: MetadataRoute.Sitemap = [];

  // ── Root static pages (no language prefix — these exist) ──
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
      // Root product URL (redirects to detected language)
      entries.push({
        url: `${host}/${product.slug}`,
        lastModified: product.updatedAt,
        changeFrequency: "weekly",
        priority: 0.9,
      });

      // Language-prefixed product pages (these exist: /{lang}/{slug})
      for (const lang of LANGUAGES) {
        entries.push({
          url: `${host}/${lang}/${product.slug}`,
          lastModified: product.updatedAt,
          changeFrequency: "weekly",
          priority: lang === "en" ? 0.8 : 0.7,
        });
      }
    }
  } catch (error) {
    console.error("Sitemap: error reading products", error);
  }

  return entries;
}
