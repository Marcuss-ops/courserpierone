"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { 
  ChevronLeft, 
  ChevronRight, 
  BookOpen, 
  Download, 
  Menu, 
  X
} from "lucide-react";
import type { CourseConfig, LanguageEntry } from "@/lib/config/white-label-data";
import type { LocaleContent } from "@/lib/i18n/locale-content";
import type { EbookBook } from "@/lib/books/ebook-catalog";

interface EbookReaderProps {
  course: CourseConfig;
  locale: string;
  domain: string;
  currentLang: string;
  token?: string;
  content: LanguageEntry;
  localeContent: LocaleContent;
  availableBooks: EbookBook[];
  activeBook: EbookBook | undefined;
  viewerUrl: string;
  downloadUrl: string;
}

export function EbookReader({
  course,
  locale,
  domain,
  currentLang,
  token,
  content,
  localeContent,
  availableBooks,
  activeBook,
  viewerUrl,
  downloadUrl,
}: EbookReaderProps) {
  const accent = course.accentColor ?? "#C9840D";
  const lc = localeContent.course;

  const getReadingLabel = (lang: string) => {
    switch (lang.toLowerCase()) {
      case "it": return "Stai leggendo";
      case "es": return "Estás leyendo";
      case "fr": return "Vous lisez";
      case "de": return "Sie lesen";
      case "pt": return "Você está lendo";
      case "pl": return "Czytasz";
      case "ru": return "Вы читаете";
      case "tr": return "Okuyorsun";
      case "id": return "Anda sedang membaca";
      default: return "You are reading";
    }
  };

  // Caching keys for localStorage
  const progressKey = `ebook-progress-${domain}-${currentLang}`;
  const totalPagesKey = `ebook-totalpages-${domain}-${currentLang}`;

  // State
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(15); // Default to 15 (e.g. Amish Secrets)

  // Load progress on mount
  useEffect(() => {
    try {
      const savedPage = localStorage.getItem(progressKey);
      const savedTotal = localStorage.getItem(totalPagesKey);
      if (savedPage) {
        setCurrentPage(parseInt(savedPage, 10) || 1);
      }
      if (savedTotal) {
        setTotalPages(parseInt(savedTotal, 10) || 15);
      } else if (course.ebookChapters && course.ebookChapters.length > 0) {
        // Fallback to highest page in chapters if available
        const maxPage = Math.max(...course.ebookChapters.map(c => c.page), 15);
        setTotalPages(maxPage);
      }
    } catch (e) {
      console.error("Failed to load local storage ebook progress:", e);
    }
  }, [progressKey, totalPagesKey, course.ebookChapters]);

  // Keyboard Arrow Page Navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") {
        return;
      }
      if (e.key === "ArrowLeft") {
        updatePage(currentPage - 1);
      } else if (e.key === "ArrowRight") {
        updatePage(currentPage + 1);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentPage, totalPages]);

  // Persist current page changes
  const updatePage = (page: number) => {
    const validPage = Math.max(1, Math.min(page, totalPages));
    setCurrentPage(validPage);
    try {
      localStorage.setItem(progressKey, validPage.toString());
    } catch {}
  };

  // Persist total pages changes
  const updateTotalPages = (total: number) => {
    const validTotal = Math.max(1, total);
    setTotalPages(validTotal);
    if (currentPage > validTotal) {
      updatePage(validTotal);
    }
    try {
      localStorage.setItem(totalPagesKey, validTotal.toString());
    } catch {}
  };

  const progressPercent = Math.round((currentPage / totalPages) * 100);

  const displayedTitle = activeBook ? `${content.ebookTitle} · ${activeBook.label}` : content.ebookTitle;

  return (
    <div className="flex h-screen w-screen bg-[#f5f5f7] text-[#1d1d1f] font-sans overflow-hidden relative">
            {/* 1. Left Sidebar (collapsible on desktop & drawer on mobile) */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-40 bg-white border-r border-zinc-200/80 flex flex-col shrink-0
          transition-all duration-300 ease-in-out shadow-lg lg:shadow-none lg:relative
          ${sidebarOpen 
            ? "translate-x-0 w-80 lg:w-80" 
            : "translate-x-0 w-12 lg:w-12 lg:overflow-hidden"
          }
        `}
      >
        {sidebarOpen ? (
          <div className="flex flex-col h-full w-full">
            {/* Sidebar Header */}
            <div className="p-8 border-b border-zinc-200/80 bg-white">
              <div className="flex justify-between items-center mb-6">
                <Link 
                  href={`/${locale}/${domain}/portal?lang=${currentLang}`} 
                  className="flex items-center gap-2 text-zinc-400 hover:text-zinc-800 transition-colors text-xs font-bold uppercase tracking-widest"
                >
                  <ChevronLeft className="w-4 h-4" />
                  {lc.back_to_course || "Back to Course"}
                </Link>
                
                {/* Collapse Sidebar Button inside the sidebar */}
                <button 
                  onClick={() => setSidebarOpen(false)}
                  className="p-1.5 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 rounded-lg text-zinc-500 hover:text-zinc-800 transition-colors"
                  title="Close Sidebar"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

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
                    {course.author}
                  </p>
                </div>
              </div>

              {/* Reading Progress Component */}
              <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-zinc-400 mt-6">
                <span>{lc.reading_progress || "Reading Progress"}</span>
                <span style={{ color: accent }}>{progressPercent}%</span>
              </div>
              <div className="w-full bg-zinc-200 h-1.5 rounded-full mt-2 overflow-hidden">
                <div 
                  className="h-full rounded-full transition-all duration-300" 
                  style={{ 
                    width: `${progressPercent}%`, 
                    backgroundColor: accent, 
                    boxShadow: `0 0 10px ${accent}40` 
                  }} 
                />
              </div>
            </div>

            {/* Chapters Navigation */}
            <nav className={`flex-1 overflow-y-auto custom-scrollbar p-4 bg-white ${!course.ebookChapters || course.ebookChapters.length === 0 ? "flex flex-col justify-center" : "space-y-1"}`}>
              {course.ebookChapters && course.ebookChapters.length > 0 ? (
                course.ebookChapters.map((chapter, idx) => {
                  const chTitle = (chapter as any)[currentLang] || (chapter as any)["en"] || "";
                  const active = currentPage >= chapter.page && (idx === course.ebookChapters.length - 1 || currentPage < course.ebookChapters[idx + 1].page);
                  return (
                    <button 
                      key={idx}
                      onClick={() => updatePage(chapter.page)}
                      className={`w-full flex items-center justify-between p-3 rounded-xl transition-all duration-200 ${
                        active ? 'text-zinc-800' : 'text-zinc-500 hover:text-zinc-800 hover:bg-zinc-50'
                      }`} 
                      style={active ? { backgroundColor: `${accent}10` } : {}}
                    >
                      <span className="text-xs font-bold truncate pr-4" style={active ? { color: accent } : {}}>{chTitle}</span>
                      <span className="text-[9px] font-black text-zinc-400">P. {chapter.page}</span>
                    </button>
                  );
                })
              ) : (
                <div className="py-12 px-6 flex flex-col items-center justify-center text-center">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 mb-3 block">
                    {getReadingLabel(currentLang)}
                  </span>
                  <h3 className="text-sm font-black text-zinc-800 leading-relaxed max-w-[240px] mx-auto balance">
                    {content.ebookTitle}
                  </h3>
                </div>
              )}
            </nav>

            {/* Sidebar Footer (Versions & Download) */}
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
                      href={`?lang=${book.code}${token ? `&token=${encodeURIComponent(token)}` : ""}`}
                      className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border text-center transition-colors ${
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
                href={downloadUrl}
                download
                className="w-full py-3 rounded-xl text-xs font-black text-white flex items-center justify-center gap-2 transition-opacity"
                style={{background: `linear-gradient(135deg, ${accent} 0%, ${accent}CC 100%)`, boxShadow: `0 4px 20px ${accent}40`}}
              >
                <Download className="w-4 h-4" />
                {lc.download_pdf || "Download PDF"}
              </a>
            </div>
          </div>
        ) : (
          /* Collapsed Sidebar View (Desktop and Mobile activity dock) */
          <div 
            onClick={() => setSidebarOpen(true)}
            className="flex flex-col h-full w-full items-center py-6 justify-between bg-zinc-50 hover:bg-zinc-100/85 cursor-pointer transition-all duration-300 group"
          >
            {/* Top Area: Expand and Back */}
            <div className="flex flex-col items-center gap-6 w-full">
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setSidebarOpen(true);
                }}
                className="p-2 bg-white hover:bg-zinc-200 border border-zinc-200 rounded-xl text-zinc-600 transition-colors shadow-sm group-hover:scale-105"
                title="Expand Sidebar"
              >
                <ChevronRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-0.5" />
              </button>
              <Link 
                href={`/${locale}/${domain}/portal?lang=${currentLang}`}
                onClick={(e) => e.stopPropagation()}
                className="p-2 bg-white hover:bg-zinc-100 border border-zinc-200 rounded-xl text-zinc-400 hover:text-zinc-700 transition-colors shadow-sm"
                title={lc.back_to_course || "Back to Course"}
              >
                <ChevronLeft className="w-4 h-4" />
              </Link>
            </div>

            {/* Middle Area: Book Icon & Progress Percentage */}
            <div className="flex flex-col items-center gap-4 select-none">
              <div 
                className="w-10 h-10 rounded-xl flex items-center justify-center shadow-sm relative bg-white border border-zinc-200 transition-transform duration-300 group-hover:scale-105"
              >
                 <BookOpen className="w-5 h-5" style={{ color: accent }} />
              </div>
              
              <div className="flex flex-col items-center mt-2">
                <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest rotate-[-90deg] my-2">
                  Prog.
                </span>
                <span className="text-xs font-black transition-all duration-300 group-hover:scale-110" style={{ color: accent }}>
                  {progressPercent}%
                </span>
              </div>
            </div>

            {/* Bottom Area: Download icon button */}
            <div className="w-full px-3">
              <a
                href={downloadUrl}
                download
                onClick={(e) => e.stopPropagation()}
                className="w-10 h-10 rounded-xl text-white flex items-center justify-center transition-all duration-300 mx-auto hover:shadow-md hover:scale-105"
                style={{background: `linear-gradient(135deg, ${accent} 0%, ${accent}CC 100%)`, boxShadow: `0 2px 10px ${accent}30`}}
                title={lc.download_pdf || "Download PDF"}
              >
                <Download className="w-4 h-4" />
              </a>
            </div>
          </div>
        )}
      </aside>

      {/* Backdrop for mobile drawers */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 lg:hidden"
        />
      )}

      {/* 2. Main Reader Area (takes 100% height and dynamic width) */}
      <main className={`flex-1 flex flex-col relative bg-zinc-900 overflow-hidden transition-all duration-300 ${!sidebarOpen ? "pl-12 lg:pl-0" : "pl-0"}`}>


        {/* PDF Reader (Iframe) - Full screen area */}
        <div className="w-full h-full bg-zinc-900">
          <iframe
            src={`${viewerUrl}#page=${currentPage}`}
            className="w-full h-full border-0"
            title={displayedTitle}
          />
        </div>

        {/* Floating Bottom Nav (Prev/Next page) */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 p-1.5 bg-white/90 backdrop-blur border border-zinc-200 rounded-2xl shadow-xl z-20">
          <button 
            onClick={() => updatePage(currentPage - 1)}
            disabled={currentPage <= 1}
            className="p-2.5 text-zinc-500 hover:text-zinc-800 hover:bg-zinc-50 disabled:opacity-40 disabled:hover:bg-transparent transition-colors rounded-xl"
            title="Precedente"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          
          <div className="h-5 w-px bg-zinc-200" />
          
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-zinc-800 px-2 select-none">
            <span>Pag.</span>
            <input 
              type="number" 
              value={currentPage} 
              min={1}
              max={totalPages}
              onChange={(e) => updatePage(parseInt(e.target.value, 10) || 1)}
              className="w-12 bg-zinc-100 border border-zinc-200 rounded-lg py-0.5 text-center text-zinc-800 font-bold" 
            />
            <span className="text-zinc-400">/</span>
            <input 
              type="number" 
              value={totalPages} 
              min={1}
              onChange={(e) => updateTotalPages(parseInt(e.target.value, 10) || 15)}
              className="w-12 bg-zinc-100 border border-zinc-200 rounded-lg py-0.5 text-center text-zinc-400 font-bold" 
              title="Edit total pages"
            />
          </div>

          <div className="h-5 w-px bg-zinc-200" />
          
          <button 
            onClick={() => updatePage(currentPage + 1)}
            disabled={currentPage >= totalPages}
            className="p-2.5 text-zinc-500 hover:text-zinc-800 hover:bg-zinc-50 disabled:opacity-40 disabled:hover:bg-transparent transition-colors rounded-xl"
            title="Successiva"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

      </main>
    </div>
  );
}
