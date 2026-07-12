// ─── Homepage Data Transformer ─────────────────────────────

import type { PublishedProductRow } from "./homepage-data";

export interface DiscoveryCourse {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  coverUrl: string | null;
  price: string;
  lessonCount: number;
  studentCount: number;
  category: string;
  /** Whether the current user already owns this course. */
  owned: boolean;
  /** Portal URL for owned courses. */
  portalUrl: string;
}

const CATEGORY_MAP: Record<string, string> = {
  lumio: "course",
  h612: "ebook",
  horizon: "course",
  "book-claude": "ebook",
  amish: "course",
};

/**
 * Transforms raw Prisma product rows into DiscoveryCourse
 * objects for the Discovery grid on the homepage.
 */
export function transformToDiscoveryCourses(
  products: PublishedProductRow[],
  ownedProductIds?: Set<string>,
  locale?: string,
): DiscoveryCourse[] {
  const owned = ownedProductIds ?? new Set<string>();
  const loc = locale ?? "it-it";
  return products.map((product) => {
    const translationsByLocale: Record<string, Record<string, string>> = {};
    for (const t of product.translations) {
      if (!translationsByLocale[t.locale])
        translationsByLocale[t.locale] = {};
      translationsByLocale[t.locale][t.section] = t.content;
    }
    const it = translationsByLocale.it || {};
    const en = translationsByLocale.en || {};
    const title =
      it.titolo || en.titolo || product.slug.replace(/-/g, " ");
    const subtitle =
      it.sottotitolo || en.sottotitolo || it.problema || en.problema || "";
    const studentCount = product._count.orders;
    const lessonCount = product._count.lessons;
    const priceDisplay =
      product.price > 0
        ? `€${(product.price / 100).toFixed(0)}`
        : "Gratuito";
    const category =
      CATEGORY_MAP[product.templateId] || product.templateId;

    const isOwned = owned.has(product.id);
    return {
      id: product.id,
      slug: product.slug,
      title,
      subtitle,
      coverUrl: product.coverUrl,
      price: priceDisplay,
      lessonCount,
      studentCount,
      category,
      owned: isOwned,
      portalUrl: isOwned ? `/${loc}/${product.slug}/portal` : "",
    };
  });
}

/**
 * Extracts unique sorted categories from a list of DiscoveryCourses.
 */
export function extractCategories(courses: DiscoveryCourse[]): string[] {
  return Array.from(new Set(courses.map((c) => c.category))).sort();
}
