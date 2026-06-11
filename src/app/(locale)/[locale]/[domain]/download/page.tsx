import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";
import type { Metadata } from "next";
import { Download, BookOpen, ArrowLeft, Globe, CheckCircle, ExternalLink } from "lucide-react";
import { getCourseConfig } from "@/lib/config/white-label-data";
import { AccessGate } from "@/components/course/access-gate";
import { loadLocaleContentSafe } from "@/lib/i18n/load-locale-content";
import { getAvailableEbookBooks } from "@/lib/books/ebook-catalog";

const LANGUAGE_NAMES: Record<string, string> = {
  it: "Italiano",
  en: "English",
  es: "Espa\u00f1ol",
  fr: "Fran\u00e7ais",
  de: "Deutsch",
  pt: "Portugu\u00eas",
  ja: "\u65e5\u672c\u8a9e",
  zh: "\u4e2d\u6587",
  ko: "\ud55c\uad6d\uc5b4",
  ru: "\u0420\u0443\u0441\u0441\u043a\u0438\u0439",
  ar: "\u0627\u0644\u0639\u0631\u0628\u064a\u0629",
  hi: "\u0939\u093f\u0928\u094d\u0926\u0940",
  nl: "Nederlands",
  pl: "Polski",
  tr: "T\u00fcrk\u00e7e",
  vi: "Ti\u1ebfng Vi\u1ec7t",
  th: "\u0e44\u0e17\u0e22",
  id: "Bahasa Indonesia",
  sv: "Svenska",
  da: "Dansk",
  fi: "Suomi",
  no: "Norsk",
  cs: "\u010ce\u0161tina",
  el: "\u0395\u03bb\u03bb\u03b7\u03bd\u03b9\u03ba\u03ac",
  he: "\u05e2\u05d1\u05e8\u05d9\u05ea",
  ro: "Rom\u00e2n\u0103",
  hu: "Magyar",
  uk: "\u0423\u043a\u0440\u0430\u0457\u043d\u0441\u044c\u043a\u0430",
  bg: "\u0411\u044a\u043b\u0433\u0430\u0440\u0441\u043a\u0438",
  hr: "Hrvatski",
  sk: "Sloven\u010dina",
  sl: "Sloven\u0161\u010dina",
  lt: "Lietuvi\u0173",
  lv: "Latvie\u0161u",
  et: "Eesti",
  fil: "Filipino",
  ms: "Bahasa Melayu",
};

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

  const ebookTitle = content.ebookTitle || content.title;
  const title = `Download — ${ebookTitle}`;
  const description = `Scarica il PDF di "${ebookTitle}" nella tua lingua.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${baseUrl}/${locale}/${domain}/download`,
      type: "website",
      siteName: "Courssy",
    },
  };
}

export default async function DownloadPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; domain: string }>;
  searchParams: Promise<{ lang?: string; token?: string }>;
}) {
  const { domain, locale } = await params;
  const { lang, token } = await searchParams;

  const course = await getCourseConfig(domain);
  if (!course) return notFound();

  const availableBooks = getAvailableEbookBooks(domain);
  const currentLang = lang || availableBooks[0]?.code || locale.split("-")[0] || course.defaultLanguage || "en";
  const content = course.languages[currentLang] || course.languages[course.defaultLanguage];

  const localeContent = loadLocaleContentSafe(domain, currentLang);
  const lc = localeContent.download;

  const accent = course.accentColor ?? "#C9840D";
  const ebookTitle = content.ebookTitle || content.title;

  const availableLanguages = availableBooks;

  const downloadUrl = `/api/ebook/${domain}/download?lang=${currentLang}${token ? `&token=${token}` : ""}`;
  const viewerUrl = `/api/ebook/${domain}/download?lang=${currentLang}${token ? `&token=${token}` : ""}`;

  return (
    <AccessGate productSlug={domain} courseTitle={content.title}>
      <div className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f] font-sans">
        {/* Top Nav */}
        <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-zinc-200/80">
          <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
            <Link
              href={`/${locale}/${domain}/portal?lang=${currentLang}`}
              className="flex items-center gap-2 text-zinc-400 hover:text-zinc-800 transition-colors text-xs font-bold uppercase tracking-widest"
            >
              <ArrowLeft className="w-4 h-4" />
              {lc.back_to_portal || "Portal"}
            </Link>
            <span className="text-lg font-black tracking-tighter text-zinc-900 uppercase">
              {course.slug}.
            </span>
          </div>
        </nav>

        <main className="max-w-6xl mx-auto px-6 py-12 md:py-20">
          {/* Success Message */}
          <div className="text-center mb-12 space-y-4">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-50 border border-green-200 text-green-700 text-xs font-bold">
              <CheckCircle className="w-4 h-4" />
              {lc.success_message || "Acquisto completato! Il libro è tuo."}
            </div>
            <h1 className="text-3xl md:text-5xl font-extrabold text-zinc-900 tracking-tight">
              {lc.title || "Scarica il tuo libro"}
            </h1>
            <p className="text-zinc-500 text-sm md:text-base font-medium max-w-xl mx-auto">
              {lc.subtitle || "Il tuo eBook è pronto. Scaricalo in PDF o leggilo direttamente online."}
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* PDF Viewer */}
            <div className="lg:col-span-2">
              <div className="bg-white rounded-[1.5rem] border border-zinc-200 shadow-sm overflow-hidden">
                {/* Viewer Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-14 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: `${accent}12`, border: `1px solid ${accent}20` }}
                    >
                      <BookOpen className="w-5 h-5" style={{ color: accent }} />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-zinc-900 truncate max-w-xs">
                        {ebookTitle}
                      </h2>
                      <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">
                        {course.author}
                      </p>
                    </div>
                  </div>
                  <a
                    href={downloadUrl}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90"
                    style={{
                      background: `linear-gradient(135deg, ${accent} 0%, ${accent}CC 100%)`,
                      boxShadow: `0 4px 20px ${accent}40`,
                    }}
                  >
                    <Download className="w-4 h-4" />
                    {lc.download_button || "Download PDF"}
                  </a>
                </div>

                {/* Embedded PDF */}
                <div className="relative bg-zinc-100" style={{ height: "calc(100vh - 280px)", minHeight: "500px" }}>
                  <iframe
                    src={viewerUrl}
                    className="w-full h-full border-0"
                    title={ebookTitle}
                  />
                </div>
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Language Selector */}
              <div className="bg-white rounded-[1.5rem] border border-zinc-200 shadow-sm p-6 space-y-4">
                <div className="flex items-center gap-2 text-zinc-900">
                  <Globe className="w-4 h-4" />
                  <h3 className="text-sm font-bold">
                    {lc.language_label || "Lingua"}
                  </h3>
                </div>

                <div className="space-y-2">
                  <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                    {lc.your_language || "La tua lingua"}
                  </p>
                  <div
                    className="flex items-center gap-3 p-3 rounded-xl border-2"
                    style={{ borderColor: accent, backgroundColor: `${accent}08` }}
                  >
                    <CheckCircle className="w-4 h-4" style={{ color: accent }} />
                    <span className="text-sm font-bold" style={{ color: accent }}>
                      {LANGUAGE_NAMES[currentLang] || currentLang.toUpperCase()}
                    </span>
                  </div>
                </div>

                {availableLanguages.length > 1 && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                      {lc.other_languages || "Altre versioni disponibili"}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {availableLanguages
                        .filter((book) => book.code !== currentLang)
                        .map((book) => (
                          <Link
                            key={book.code}
                            href={`/${locale}/${domain}/download?lang=${book.code}${token ? `&token=${token}` : ""}`}
                            className="px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest text-zinc-600 bg-zinc-100 hover:bg-zinc-200 transition-colors text-center"
                          >
                            {book.label}
                          </Link>
                        ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Book Info */}
              <div className="bg-white rounded-[1.5rem] border border-zinc-200 shadow-sm p-6 space-y-4">
                <h3 className="text-sm font-bold text-zinc-900">
                  {ebookTitle}
                </h3>
                <p className="text-xs text-zinc-500 font-medium">
                  {course.author}
                </p>
                <div className="flex items-center gap-2 text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>{course.ebookChapters?.length || 0} Capitoli</span>
                </div>
                <div className="flex items-center gap-2 text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                  <Globe className="w-3.5 h-3.5" />
                  <span>{availableLanguages.length} Versioni</span>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="space-y-3">
                <a
                  href={downloadUrl}
                  download
                  className="w-full py-3 rounded-xl text-xs font-black text-white flex items-center justify-center gap-2 transition-opacity hover:opacity-90"
                  style={{
                    background: `linear-gradient(135deg, ${accent} 0%, ${accent}CC 100%)`,
                    boxShadow: `0 4px 20px ${accent}40`,
                  }}
                >
                  <Download className="w-4 h-4" />
                  {lc.download_button || "Scarica PDF"}
                </a>
                <Link
                  href={`/${locale}/${domain}/ebook?lang=${currentLang}`}
                  className="w-full py-3 rounded-xl text-xs font-bold text-zinc-700 bg-zinc-100 hover:bg-zinc-200 flex items-center justify-center gap-2 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  {lc.view_online || "Leggi Online"}
                </Link>
                <Link
                  href={`/${locale}/${domain}/portal?lang=${currentLang}`}
                  className="w-full py-3 rounded-xl text-xs font-bold text-zinc-500 hover:text-zinc-800 flex items-center justify-center gap-2 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  {lc.back_to_portal || "Torna al Portal"}
                </Link>
              </div>
            </div>
          </div>
        </main>
      </div>
    </AccessGate>
  );
}
