import { notFound } from "next/navigation";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { getCourseConfig } from "@/lib/config/white-label-data";
import { loadLocaleContentSafe } from "@/lib/i18n/load-locale-content";
import { getAvailableEbookBooks } from "@/lib/books/ebook-catalog";
import { EbookReader } from "@/components/ebook/ebook-reader";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; domain: string }>;
}): Promise<Metadata> {
  const { locale, domain } = await params;

  let host = "www.courssy.com";
  try {
    const h = await headers();
    host = h.get("host") ?? host;
  } catch {}

  const scheme = process.env.NODE_ENV === "development" ? "http" : "https";
  const baseUrl = `${scheme}://${host}`;

  const course = await getCourseConfig(domain);
  if (!course) return {};

  const lang = locale.split("-")[0]?.toLowerCase() ?? "en";
  const content = course.languages[locale] ?? course.languages[lang] ?? course.languages[course.defaultLanguage];
  if (!content) return {};

  const seo = content.seo;
  const ebookTitle = content.ebookTitle || content.title;
  const title = seo?.title || `eBook — ${ebookTitle}`;
  const description = seo?.description || `Leggi l'eBook di "${ebookTitle}" direttamente dal lettore web.`;
  const ogImage = `${baseUrl}/api/og?title=${encodeURIComponent(ebookTitle)}&author=${encodeURIComponent(course.author || "")}&accent=${encodeURIComponent(course.accentColor || "#C9840D")}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${baseUrl}/${locale}/${domain}/ebook`,
      type: "website",
      siteName: "Courssy",
      locale: locale.replace("-", "_"),
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
    alternates: {
      canonical: `${baseUrl}/${locale}/${domain}/ebook`,
    },
  };
}

export default async function EbookPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; domain: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { locale, domain } = await params;
  const { lang } = await searchParams;
  const data = await getCourseConfig(domain);

  if (!data) return notFound();

  const availableBooks = getAvailableEbookBooks(domain);
  const defaultLang = availableBooks[0]?.code || (data.defaultLanguage) || "en";
  const currentLang = lang || defaultLang;
  const content = data.languages[currentLang] || data.languages[data.defaultLanguage];

  const localeContent = loadLocaleContentSafe(domain, currentLang);
  const activeBook = availableBooks.find((book) => book.code === currentLang) || availableBooks[0];
  // Keep paid ebook bytes behind the server-side access route. Static public
  // files are not used as a bypass for paid products.
  const viewerUrl = `/api/ebook/${data.slug}/download?lang=${encodeURIComponent(currentLang)}&disposition=inline`;
  const downloadUrl = `/api/ebook/${data.slug}/download?lang=${encodeURIComponent(currentLang)}&disposition=attachment`;

  return (
    <EbookReader
      course={data}
      locale={locale}
      domain={domain}
      currentLang={currentLang}
      content={content}
      localeContent={localeContent}
      availableBooks={availableBooks}
      activeBook={activeBook}
      viewerUrl={viewerUrl}
      downloadUrl={downloadUrl}
    />
  );
}
