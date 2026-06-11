import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";
import type { Metadata } from "next";
import { 
  ChevronLeft, 
  BookOpen, 
  Share2, 
  Download, 
  Bookmark,
  ChevronRight, 
  Menu
} from "lucide-react";
import { getCourseConfig } from "@/lib/config/white-label-data";
import { MobileSidebar } from "@/components/layout/mobile-sidebar";
import { SidebarToggleBtn } from "@/components/layout/sidebar-toggle-btn";
import { loadLocaleContentSafe } from "@/lib/i18n/load-locale-content";
import { getAvailableEbookBooks } from "@/lib/books/ebook-catalog";

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
  searchParams: Promise<{ lang?: string; token?: string }>;
}) {
  const { domain } = await params;
  const { lang, token } = await searchParams;
  const data = await getCourseConfig(domain);

  if (!data) return notFound();

  const availableBooks = getAvailableEbookBooks(domain);
  const defaultLang = availableBooks[0]?.code || (data.defaultLanguage as string) || "en";
  const currentLang = lang || defaultLang;
  const content = data.languages[currentLang] || data.languages[data.defaultLanguage];

  const accent = data.accentColor ?? "#C9840D";

  const localeContent = loadLocaleContentSafe(domain, currentLang);
  const lc = localeContent.course;
  const activeBook = availableBooks.find((book) => book.code === currentLang) || availableBooks[0];
  const displayedTitle = activeBook ? `${content.ebookTitle} · ${activeBook.label}` : content.ebookTitle;
  const viewerUrl = `/api/ebook/${data.slug}/download?lang=${encodeURIComponent(currentLang)}${token ? `&token=${encodeURIComponent(token)}` : ""}`;

  return (
    <div className="flex h-screen bg-[#f5f5f7] text-[#1d1d1f] font-sans overflow-hidden">
      {/* Sidebar Struttura Libro */}
      <MobileSidebar toggleId="ebook-sidebar-toggle">
        <div className="p-8 border-b border-zinc-200/80 bg-white">
          <Link href={`/${domain}/portal?lang=${currentLang}`} className="flex items-center gap-2 text-zinc-400 hover:text-zinc-800 transition-colors mb-6 text-xs font-bold uppercase tracking-widest">
            <ChevronLeft className="w-4 h-4" />
            {lc.back_to_course || "Back to Course"}
          </Link>
          <div className="flex items-center gap-4 mb-4">
            <div 
              className="w-12 h-16 rounded-lg flex items-center justify-center shadow-md overflow-hidden relative"
              style={{ backgroundColor: `${accent}12`, border: `1px solid ${accent}20` }}
            >
               <div className="absolute inset-0 bg-gradient-to-t opacity-30" style={{ backgroundImage: `linear-gradient(to top, ${accent}20, transparent)` }} />
               <BookOpen className="w-6 h-6 relative z-10" style={{ color: accent }} />
            </div>
            <div>
              <h2 className="text-lg font-black text-zinc-900 leading-tight truncate w-44">
                {content.ebookTitle}
              </h2>
              <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest mt-1">
                {data.author}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-zinc-400 mt-6">
            <span>{lc.reading_progress || "Reading Progress"}</span>
            <span style={{ color: accent }}>12%</span>
          </div>
          <div className="w-full bg-zinc-200 h-1 rounded-full mt-2 overflow-hidden">
            <div className="h-full w-[12%] rounded-full" style={{ backgroundColor: accent, boxShadow: `0 0 10px ${accent}40` }} />
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-1 bg-white">
          {data.ebookChapters.map((chapter, idx) => (
            <ChapterLink key={idx} title={(chapter as any)[currentLang] || (chapter as any)["en"] || ""} page={chapter.page} active={idx === 0} accent={accent} />
          ))}
        </nav>

        <div className="p-6 border-t border-zinc-200 bg-white">
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-400">
                Tutte le versioni
              </p>
              <span className="text-[10px] font-black uppercase tracking-[0.3em]" style={{ color: accent }}>
                {availableBooks.length} file
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {availableBooks.map((book) => (
                <Link
                  key={book.code}
                  href={`?lang=${book.code}`}
                  className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-colors ${
                    currentLang === book.code
                      ? "bg-zinc-900 text-white border-zinc-900"
                      : "bg-zinc-50 text-zinc-500 border-zinc-200 hover:text-zinc-900 hover:border-zinc-300"
                  }`}
                >
                  {book.label}
                </Link>
              ))}
            </div>
            {activeBook && (
              <p className="mt-3 text-[10px] text-zinc-400 font-medium">
                Versione attiva: <span className="font-black uppercase">{activeBook.label}</span>
              </p>
            )}
          </div>
          <a
            href={`/api/ebook/${data.slug}/download?lang=${currentLang}`}
            download
            className="w-full py-3 rounded-xl text-xs font-black text-white flex items-center justify-center gap-2 transition-opacity"
            style={{background: `linear-gradient(135deg, ${accent} 0%, ${accent}CC 100%)`, boxShadow: `0 4px 20px ${accent}40`}}
          >
            <Download className="w-4 h-4" />
            {lc.download_pdf || "Download PDF"}
          </a>
        </div>
      </MobileSidebar>

      {/* Reader Area */}
      <main className="flex-1 flex flex-col relative bg-[#f5f5f7] overflow-hidden">
        {/* Top Reader Controls */}
        <header className="h-16 flex items-center justify-between px-8 border-b border-zinc-200 bg-white/80 backdrop-blur-md z-10">
          <div className="flex items-center gap-6">
            <SidebarToggleBtn toggleId="ebook-sidebar-toggle" className="p-2 bg-zinc-100 hover:bg-zinc-200 border border-zinc-200 rounded-xl text-zinc-800 lg:hidden mr-2">
              <Menu className="w-6 h-6" />
            </SidebarToggleBtn>
            <div className="flex items-center gap-2">
              <button className="p-2 text-zinc-400 hover:text-zinc-800 transition-colors">
                <Bookmark className="w-4 h-4" />
              </button>
              <button className="p-2 text-zinc-400 hover:text-zinc-800 transition-colors">
                <Share2 className="w-4 h-4" />
              </button>
            </div>
            <div className="h-4 w-px bg-zinc-200" />
            <div className="flex items-center gap-4 text-xs font-bold">
              <span className="text-zinc-400 uppercase tracking-widest">{lc.page_label || "Page"}</span>
              <div className="flex items-center gap-1">
                <input type="text" defaultValue="1" className="w-8 bg-zinc-50 border border-zinc-200 rounded-lg py-1 text-center text-zinc-800" />
                <span className="text-zinc-400">/ PDF</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 uppercase font-black text-[10px] tracking-tighter text-zinc-400">
            {data.slug}.
          </div>
        </header>

        {/* Reader */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-8 lg:p-20 flex justify-center">
          <article className="max-w-5xl w-full bg-white rounded-[2.5rem] border border-zinc-200 shadow-sm overflow-hidden">
            <div className="px-8 lg:px-10 py-6 border-b border-zinc-100 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-400">Libreria PDF</p>
                <h1 className="text-2xl lg:text-3xl font-black text-zinc-900 tracking-tight mt-1">
                  {displayedTitle}
                </h1>
                <p className="text-sm text-zinc-500 mt-2">
                  {availableBooks.length} file disponibili nel catalogo locale.
                </p>
              </div>
              <a
                href={viewerUrl}
                download
                className="inline-flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-black text-white transition-opacity hover:opacity-90"
                style={{
                  background: `linear-gradient(135deg, ${accent} 0%, ${accent}CC 100%)`,
                  boxShadow: `0 4px 20px ${accent}40`,
                }}
              >
                <Download className="w-4 h-4" />
                {lc.download_pdf || "Download PDF"}
              </a>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[280px_1fr] min-h-[72vh]">
              <aside className="border-b xl:border-b-0 xl:border-r border-zinc-100 bg-zinc-50/70 p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-black uppercase tracking-[0.3em] text-zinc-500">Catalogo</h2>
                  <span className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-400">
                    {availableBooks.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {availableBooks.map((book) => {
                    const isActive = book.code === currentLang;
                    return (
                        <Link
                          key={book.code}
                        href={`?lang=${encodeURIComponent(book.code)}${token ? `&token=${encodeURIComponent(token)}` : ""}`}
                        className={`block rounded-2xl border px-4 py-3 transition-colors ${
                          isActive
                            ? "bg-zinc-900 text-white border-zinc-900"
                            : "bg-white text-zinc-700 border-zinc-200 hover:border-zinc-300 hover:bg-zinc-100"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-[10px] font-black uppercase tracking-[0.25em] opacity-70">
                              {book.label}
                            </div>
                            <div className="text-sm font-bold mt-1 truncate">
                              {book.fileName}
                            </div>
                          </div>
                          <span className={`text-[10px] font-black uppercase tracking-widest ${isActive ? "text-white" : "text-zinc-400"}`}>
                            Open
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </aside>

              <div className="bg-zinc-100">
                <iframe
                  src={viewerUrl}
                  className="w-full h-[72vh] border-0"
                  title={displayedTitle}
                />
              </div>
            </div>
          </article>
        </div>

        {/* Bottom Navigation (Floating) */}
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-4 p-2 bg-white rounded-2xl border border-zinc-200 shadow-lg z-20">
           <button className="p-3 text-zinc-500 hover:text-zinc-800 hover:bg-zinc-50 transition-colors rounded-xl">
              <ChevronLeft className="w-5 h-5" />
           </button>
           <div className="h-6 w-px bg-zinc-200" />
           <span className="px-4 text-xs font-black uppercase tracking-widest text-zinc-800">{activeBook?.label || lc.chapter || "Chapter"}</span>
           <div className="h-6 w-px bg-zinc-200" />
           <button className="p-3 text-zinc-500 hover:text-zinc-800 hover:bg-zinc-50 transition-colors rounded-xl">
              <ChevronRight className="w-5 h-5" />
           </button>
        </div>
      </main>
    </div>
  );
}

function ChapterLink({ title, page, active = false, accent = "#C9840D" }: { title: string; page: number; active?: boolean; accent?: string }) {
  return (
    <button className={`w-full flex items-center justify-between p-3 rounded-xl transition-all duration-200 ${
      active ? 'text-zinc-800' : 'text-zinc-500 hover:text-zinc-800 hover:bg-zinc-50'
    }`} style={active ? { backgroundColor: `${accent}10` } : {}}>
      <span className={`text-xs font-bold truncate pr-4 ${active ? '' : ''}`} style={active ? { color: accent } : {}}>{title}</span>
      <span className="text-[9px] font-black text-zinc-400">P. {page}</span>
    </button>
  );
}
