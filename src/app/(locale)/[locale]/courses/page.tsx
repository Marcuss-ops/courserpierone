import type { Metadata } from "next";
import { CoursesCatalog } from "@/components/courses-catalog";
import {
  ACTIVE_COURSES,
  type CourseMeta,
} from "@/lib/courses/registry";

/**
 * /[locale]/courses — Locale-prefixed marketing catalog.
 *
 * Same registry source as the root `/courses`, but with three locale-aware
 * differences:
 *
 *   1. **Filtering**: only courses that ship marketing content in the
 *      requested language are shown. A user landing on /it/courses sees only
 *      courses where `course.locales.includes("it")`.
 *
 *   2. **Per-locale metadata**: title + description are translated (5
 *      core languages: it/en/es/fr/de) so OpenGraph snippets + browser
 *      titles match the user's chosen language.
 *
 *   3. **Canonical alternates**: the page sets `alternates.canonical` to
 *      `/<locale>/courses` so search engines recognize it as the
 *      locale-specific variant of the marketing catalog. The root
 *      `/courses` retains its own canonical `/courses`.
 *
 * Next.js 15+ async params (locale param is now `Promise<...>` — follow the
 * layout convention used elsewhere in the `(locale)/[locale]/...` route
 * group, e.g. `(member)/layout.tsx`).
 *
 * `force-static` + 1h ISR ≈ SSG per known locale, rebuilt on registry
 * changes. Adding a brand-new course requires a redeploy so its slug
 * shows up in the catalog; this is the same behavior as `/courses`.
 */

interface PageProps {
  params: Promise<{ locale: string }>;
}

// Static-first: the catalog content comes from a readonly registry, so
// Vercel can prerender once per locale per build and revalidate hourly.
// New courses ship via `npm run sync:local <slug>` → DB/sync doesn't
// affect this page until the next deploy + regen.
export const dynamic = "force-static";
export const revalidate = 3600; // 1h

/**
 * Enumerate the 5 marketing-supported locales so Vercel prerenders each
 * /<locale>/courses page at build time. Without this, `force-static`
 * alone still allows first-hit SSR for unenumerated locales; with it,
 * the 5 known locales are guaranteed to be static. Unknown locale
 * params still fall through to dynamic render (default `dynamicParams`
 * is fine because middleware redirects invalid locale URLs upstream).
 */
export function generateStaticParams() {
  return [
    { locale: "it-it" },
    { locale: "en-us" },
    { locale: "es-es" },
    { locale: "fr-fr" },
    { locale: "de-de" },
  ];
}

// `course.locales` uses 2-letter codes ("it", "en", "fr"…), while the URL
// and locale-resolver carry full locale-prefixed codes ("it-it", "en-gb"…).
// Strip the country part so the membership test works.
function langFromLocale(locale: string): string {
  return locale.split("-")[0]?.toLowerCase() ?? locale;
}

function getCoursesForLocale(locale: string): CourseMeta[] {
  const lang = langFromLocale(locale);
  return ACTIVE_COURSES.filter((c) => c.locales.includes(lang));
}

// Per-locale marketing titles and descriptions. Keeping this small
// (5-core languages) keeps the page light; other locales fall back to
// the English copy. Move to courses.config.ts if it grows.
interface Copy {
  title: string;
  description: string;
}
const COPY_BY_LANG: Record<string, Copy> = {
  it: {
    title: "Scopri i Corsi · Courssy",
    description:
      "Catalogo dei corsi premium pubblicati su Courssy, con contenuti tradotti in italiano.",
  },
  en: {
    title: "Discover Courses · Courssy",
    description:
      "Browse the catalogue of premium courses published on Courssy, with content translated into English.",
  },
  es: {
    title: "Descubre Cursos · Courssy",
    description:
      "Catálogo de cursos premium publicados en Courssy, con contenido traducido al español.",
  },
  fr: {
    title: "Découvrir les Cours · Courssy",
    description:
      "Catalogue des cours premium publiés sur Courssy, avec contenu traduit en français.",
  },
  de: {
    title: "Kurse entdecken · Courssy",
    description:
      "Katalog der Premium-Kurse auf Courssy, mit ins Deutsche übersetzten Inhalten.",
  },
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const lang = langFromLocale(locale);
  const copy = COPY_BY_LANG[lang] ?? COPY_BY_LANG.en;

  return {
    title: copy.title,
    description: copy.description,
    alternates: {
      canonical: `/${locale}/courses`,
    },
  };
}

export default async function LocaleCoursesPage({ params }: PageProps) {
  const { locale } = await params;
  const courses = getCoursesForLocale(locale);

  // Reuse the existing <CoursesCatalog>. It already handles the empty
  // state (renders a "no courses" message) when the filtered array is
  // empty — useful for locales without any registered course content.
  return <CoursesCatalog courses={courses} />;
}
