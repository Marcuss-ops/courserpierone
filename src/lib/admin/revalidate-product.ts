import { revalidatePath } from "next/cache";
import { toFullLocale } from "@/lib/i18n/to-full-locale";

const DEFAULT_LOCALES = ["it", "en", "es", "fr", "de", "pt"];

/**
 * Revalidate all public landing page paths for a product slug.
 * Iterates over the provided locales (or a default set) and revalidates
 * both the locale-prefixed path and the bare slug path.
 */
export function revalidateProduct(slug: string, locales: string[] = DEFAULT_LOCALES) {
  try {
    for (const locale of locales) {
      const fullLocale = toFullLocale(locale);
      revalidatePath(`/${fullLocale}/${slug}`, "page");
    }
  } catch (error) {
    console.error("[revalidateProduct] Failed to revalidate:", error);
  }
}
