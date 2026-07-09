/**
 * SEO Metadata — Localized title, description, and Open Graph tags.
 *
 * Centralized translations for the site metadata. Same pattern as
 * auth-translations.ts: 2-letter language key → translated strings.
 * Adding a new language = adding one key to the record.
 */

export interface SeoMetadata {
  title: string;
  description: string;
  ogTitle: string;
  ogDescription: string;
}

const seoTranslations: Record<string, SeoMetadata> = {
  it: {
    title: "Courssy — Scopri corsi che cambiano la vita",
    description:
      "Catalogo curato di corsi premium. Impara da esperti, al tuo ritmo, da qualsiasi parte del mondo. Corsi, ebook e workshop multilingua.",
    ogTitle: "Courssy — Scopri corsi che cambiano la vita",
    ogDescription:
      "Catalogo curato di corsi premium. Impara da esperti, al tuo ritmo, da qualsiasi parte del mondo.",
  },
  en: {
    title: "Courssy — Discover courses that change your life",
    description:
      "Browse our curated collection of premium courses. Learn from experts, at your own pace, from anywhere in the world. Multilingual courses, ebooks, and workshops.",
    ogTitle: "Courssy — Discover courses that change your life",
    ogDescription:
      "Browse our curated collection of premium courses. Learn from experts, at your own pace, from anywhere in the world.",
  },
  fr: {
    title: "Courssy — Découvrez des cours qui changent la vie",
    description:
      "Parcourez notre collection de cours premium. Apprenez avec des experts, à votre rythme, où que vous soyez. Cours, ebooks et ateliers multilingues.",
    ogTitle: "Courssy — Découvrez des cours qui changent la vie",
    ogDescription:
      "Parcourez notre collection de cours premium. Apprenez avec des experts, à votre rythme, où que vous soyez.",
  },
  es: {
    title: "Courssy — Descubre cursos que cambian la vida",
    description:
      "Explora nuestra colección de cursos premium. Aprende de expertos, a tu ritmo, desde cualquier lugar del mundo. Cursos, ebooks y talleres multilingües.",
    ogTitle: "Courssy — Descubre cursos que cambian la vida",
    ogDescription:
      "Explora nuestra colección de cursos premium. Aprende de expertos, a tu ritmo, desde cualquier lugar del mundo.",
  },
  de: {
    title: "Courssy — Entdecke Kurse, die dein Leben verändern",
    description:
      "Durchstöbere unsere kuratierte Sammlung von Premium-Kursen. Lerne von Experten, in deinem eigenen Tempo, von überall auf der Welt. Mehrsprachige Kurse, E-Books und Workshops.",
    ogTitle: "Courssy — Entdecke Kurse, die dein Leben verändern",
    ogDescription:
      "Durchstöbere unsere kuratierte Sammlung von Premium-Kursen. Lerne von Experten, in deinem eigenen Tempo.",
  },
  pt: {
    title: "Courssy — Descubra cursos que mudam sua vida",
    description:
      "Navegue pela nossa coleção de cursos premium. Aprenda com especialistas, no seu ritmo, de qualquer lugar do mundo. Cursos, ebooks e workshops multilíngues.",
    ogTitle: "Courssy — Descubra cursos que mudam sua vida",
    ogDescription:
      "Navegue pela nossa coleção de cursos premium. Aprenda com especialistas, no seu ritmo, de qualquer lugar do mundo.",
  },
};

const FALLBACK: SeoMetadata = seoTranslations.en;

/**
 * Get SEO metadata for a given language code.
 * Falls back to English if the language is not yet translated.
 */
export function getSeoMetadata(langCode: string): SeoMetadata {
  const normalized = langCode.toLowerCase().split("-")[0];
  return seoTranslations[normalized] ?? FALLBACK;
}

/** All supported SEO languages (for hreflang generation). */
export const SEO_LOCALES = Object.keys(seoTranslations);
