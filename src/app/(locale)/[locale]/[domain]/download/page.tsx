import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";
import type { Metadata } from "next";
import { Download, BookOpen, ArrowLeft, CheckCircle } from "lucide-react";
import { getCourseConfig } from "@/lib/config/white-label-data";
import { AccessGate } from "@/components/course/access-gate";
import { isFreeCourse } from "@/lib/courses/is-free-course";
import { loadLocaleContentSafe } from "@/lib/i18n/load-locale-content";
import { getAvailableEbookBooks } from "@/lib/books/ebook-catalog";
import { SaveAccess } from "@/components/course/save-access";
import { getUiTranslations } from "@/lib/i18n/ui-translations";
import { prisma } from "@/lib/db/prisma";

const LANGUAGE_NAMES: Record<string, string> = {
  it: "Italiano",
  en: "English",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  pt: "Português",
  ja: "日本語",
  zh: "中文",
  ko: "한국어",
  ru: "Русский",
  ar: "العربية",
  hi: "हिन्दी",
  nl: "Nederlands",
  pl: "Polski",
  tr: "Türkçe",
  vi: "Tiếng Việt",
  th: "ไทย",
  id: "Bahasa Indonesia",
  sv: "Svenska",
  da: "Dansk",
  fi: "Suomi",
  no: "Norsk",
  cs: "Čeština",
  el: "Ελληνικά",
  he: "עברית",
  ro: "Română",
  hu: "Magyar",
  uk: "Українська",
  bg: "Български",
  hr: "Hrvatski",
  sk: "Slovenčina",
  sl: "Slovenščina",
  lt: "Lietuvių",
  lv: "Latviešu",
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
  const t = getUiTranslations(lang);
  const title = `${t.title} — ${ebookTitle}`;
  const description = `${t.subtitle} "${ebookTitle}"`;

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
  searchParams: Promise<{ lang?: string; token?: string; order_id?: string; orderId?: string }>;
}) {
  const { domain, locale } = await params;
  const { lang, token, order_id, orderId } = await searchParams;

  const course = await getCourseConfig(domain);
  if (!course) return notFound();

  // Defense-in-depth: same logic as access-gate.tsx. Pass to <SaveAccess>
  // for consistency with other pages + use to bypass the auth requirement
  // on the /api/ebook/[slug]/download endpoint for free-course guests.
  // Lightweight product lookup (only `price` field) — the full course
  // config is already loaded above.
  const downloadProduct = await prisma.product.findUnique({
    where: { slug: domain },
    select: { price: true },
  });
  const freeCourse = isFreeCourse(domain, downloadProduct?.price);

  const availableBooks = getAvailableEbookBooks(domain);
  const currentLang = lang || availableBooks[0]?.code || locale.split("-")[0] || course.defaultLanguage || "en";
  const content = course.languages[currentLang] || course.languages[course.defaultLanguage];

  const localeContent = loadLocaleContentSafe(domain, currentLang);
  const langCode = currentLang.split("-")[0];
  const t = getUiTranslations(langCode);
  const lc = localeContent.download || t;

  const accent = course.accentColor ?? "#C9840D";
  const ebookTitle = content.ebookTitle || content.title;

  const availableLanguages = availableBooks;
  const activeBook = availableBooks.find((book) => book.code === currentLang) || availableBooks[0];
  const staticBookUrl = activeBook ? `/courses/${domain}/${encodeURIComponent(activeBook.fileName)}` : null;

  const downloadUrl = staticBookUrl || `/api/ebook/${domain}/download?lang=${currentLang}&disposition=attachment${token ? `&token=${token}` : ""}`;

  const activeOrderId = order_id || orderId;
  const downloadQs = new URLSearchParams();
  downloadQs.set("lang", currentLang);
  if (activeOrderId) downloadQs.set("order_id", activeOrderId);

  return (
    <AccessGate productSlug={domain} courseTitle={ebookTitle} callbackUrl={`/${locale}/${domain}/download?${downloadQs.toString()}`} orderId={activeOrderId}>
    <div className="min-h-screen bg-[#070709] text-zinc-100 font-sans relative overflow-x-hidden flex flex-col justify-between">
      <SaveAccess productSlug={domain} isFreeCourse={freeCourse} />
      {/* Background radial glows */}
      <div
        className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full blur-[120px] -z-10 opacity-30"
        style={{ backgroundColor: accent }}
      />
      <div
        className="absolute bottom-0 -left-40 w-[400px] h-[400px] rounded-full blur-[100px] -z-10 opacity-20"
        style={{ backgroundColor: `${accent}CC` }}
      />

      {/* Top Nav */}
      <nav className="sticky top-0 z-50 bg-[#070709]/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <Link
            href={`/${locale}/${domain}/portal?lang=${currentLang}`}
            className="flex items-center gap-2 text-zinc-500 hover:text-zinc-350 transition-colors text-xs font-black uppercase tracking-widest"
          >
            <ArrowLeft className="w-4 h-4" />
            {lc.back_to_portal || t.back_to_portal}
          </Link>
          <span className="text-xl font-black tracking-tighter text-white uppercase">
            {course.slug}.
          </span>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-6 py-12 md:py-20 flex items-center">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center w-full">

          {/* Left Column: Cover Preview (4 cols) */}
          <div className="lg:col-span-5 flex justify-center">
            <div className="relative group rounded-[2.5rem] overflow-hidden aspect-[3/4] w-full max-w-[280px] md:max-w-[320px] shadow-2xl border border-white/10 bg-white/[0.02] backdrop-blur-sm transition-all duration-500 hover:scale-[1.02] hover:shadow-[0_20px_50px_rgba(201,132,13,0.15)]">
              <img
                src={course.cover}
                alt={ebookTitle}
                className="w-full h-full object-cover select-none"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-80 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-6">
                <div>
                  <h4 className="text-white text-xs font-black uppercase tracking-widest">{course.author}</h4>
                  <p className="text-[10px] text-zinc-400 font-bold mt-1 uppercase tracking-widest">{availableLanguages.length} Versioni</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Access & Actions (7 cols) */}
          <div className="lg:col-span-7">
            <div className="premium-glass p-8 md:p-12 rounded-[2.5rem] border border-white/10 shadow-2xl space-y-8 relative">
              {/* Success Badge */}
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/10 border border-green-500/20 text-green-400 text-[10px] font-black uppercase tracking-wider">
                <CheckCircle className="w-4 h-4 shrink-0" />
                {lc.success_message || t.success_message}
              </div>

              {/* Title & Description */}
              <div className="space-y-3">
                <h1 className="text-3xl md:text-4xl lg:text-5xl font-black text-white text-contrast tracking-tight leading-none balance">
                  {lc.title || t.title}
                </h1>
                <p className="text-zinc-400 text-sm md:text-base font-medium leading-relaxed max-w-xl">
                  {lc.subtitle || t.subtitle}
                </p>
              </div>

              {/* Quick Info Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-white/[0.01] border border-white/5 space-y-1">
                  <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest block">Autore</span>
                  <span className="text-sm font-bold text-white truncate block">{course.author}</span>
                </div>
                <div className="p-4 rounded-2xl bg-white/[0.01] border border-white/5 space-y-1">
                  <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest block">{t.language_label}</span>
                  <span className="text-sm font-bold truncate block" style={{ color: accent }}>
                    {LANGUAGE_NAMES[currentLang] || currentLang.toUpperCase()}
                  </span>
                </div>
              </div>

              {/* Language Selector */}
              <div className="space-y-3">
                <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block">
                  {lc.language_label || t.language_label}
                </span>
                <div className="flex flex-wrap gap-2">
                  {availableLanguages.map((book) => {
                    const isActive = currentLang === book.code;
                    return (
                      <Link
                        key={book.code}
                        href={`/${locale}/${domain}/download?lang=${book.code}${token ? `&token=${token}` : ""}`}
                        className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all border ${
                          isActive
                            ? "text-white border-transparent"
                            : "bg-white/[0.02] text-zinc-400 border-white/5 hover:text-white hover:bg-white/[0.05]"
                        }`}
                        style={isActive ? { backgroundColor: accent } : {}}
                      >
                        {book.label}
                      </Link>
                    );
                  })}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center gap-4 pt-6 border-t border-white/5">
      <a
        href={downloadUrl}
        download
        className="w-full sm:w-auto px-8 py-4 rounded-2xl text-xs font-black uppercase tracking-widest text-white flex items-center justify-center gap-2 transition-all hover:scale-[1.02]"
        style={{
          background: `linear-gradient(135deg, ${accent} 0%, ${accent}CC 100%)`,
          boxShadow: `0 4px 20px ${accent}40`,
        }}
        // Free courses: the /api/ebook/[slug]/download endpoint allows
        // public access (route.ts updated to honor isFreeCourse). Paid
        // courses: user must be authenticated with a completed order
        // (enforced server-side in the API handler).
      >
                  <Download className="w-4 h-4" />
                  {lc.download_button || t.download_button}
                </a>

                <Link
                  href={`/${locale}/${domain}/ebook?lang=${currentLang}`}
                  className="w-full sm:w-auto px-8 py-4 rounded-2xl text-xs font-black uppercase tracking-widest text-zinc-300 bg-white/[0.03] border border-white/5 hover:text-white hover:bg-white/[0.06] flex items-center justify-center gap-2 transition-all hover:scale-[1.02]"
                >
                  <BookOpen className="w-4 h-4" />
                  {lc.view_online || t.view_online}
                </Link>
              </div>

            </div>
          </div>

        </div>
      </main>

      {/* Footer legal note */}
      <footer className="py-6 border-t border-white/5 text-center text-[10px] text-zinc-650 uppercase tracking-widest">
        © {new Date().getFullYear()} Courssy. All rights reserved. supporto@courssy.it
      </footer>
    </div>
    </AccessGate>
  );
}
