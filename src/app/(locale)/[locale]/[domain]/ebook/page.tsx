import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";
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
import { sanitizeHtml } from "@/lib/utils/sanitize";

export default async function EbookPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; domain: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { domain } = await params;
  const { lang } = await searchParams;
  const data = await getCourseConfig(domain);

  if (!data) return notFound();

  const currentLang = lang || (data.defaultLanguage as string) || "en";
  const content = data.languages[currentLang] || data.languages[data.defaultLanguage];

  const accent = data.accentColor ?? "#C9840D";

  return (
    <div className="flex h-screen bg-[#f5f5f7] text-[#1d1d1f] font-sans overflow-hidden">
      {/* Sidebar Struttura Libro */}
      <MobileSidebar toggleId="ebook-sidebar-toggle">
        <div className="p-8 border-b border-zinc-200/80 bg-white">
          <Link href={`/${domain}/portal?lang=${currentLang}`} className="flex items-center gap-2 text-zinc-400 hover:text-zinc-800 transition-colors mb-6 text-xs font-bold uppercase tracking-widest">
            <ChevronLeft className="w-4 h-4" />
            Area Studente
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
            <span>Progresso Lettura</span>
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
          <div className="flex gap-4 mb-6 justify-center">
             <Link href={`?lang=it`} className={`text-[10px] font-black ${currentLang === 'it' ? '' : 'text-zinc-400'}`} style={currentLang === 'it' ? { color: accent } : {}}>IT</Link>
             <Link href={`?lang=en`} className={`text-[10px] font-black ${currentLang === 'en' ? '' : 'text-zinc-400'}`} style={currentLang === 'en' ? { color: accent } : {}}>EN</Link>
          </div>
          <a
            href={`/api/ebook/${data.slug}/download?lang=${currentLang}`}
            download
            className="w-full py-3 rounded-xl text-xs font-black text-white flex items-center justify-center gap-2 transition-opacity"
            style={{background: `linear-gradient(135deg, ${accent} 0%, ${accent}CC 100%)`, boxShadow: `0 4px 20px ${accent}40`}}
          >
            <Download className="w-4 h-4" />
            Download PDF
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
               <span className="text-zinc-400 uppercase tracking-widest">Pagina</span>
               <div className="flex items-center gap-1">
                  <input type="text" defaultValue="1" className="w-8 bg-zinc-50 border border-zinc-200 rounded-lg py-1 text-center text-zinc-800" />
                  <span className="text-zinc-400">/ 120</span>
               </div>
            </div>
          </div>

          <div className="flex items-center gap-4 uppercase font-black text-[10px] tracking-tighter text-zinc-400">
             {data.slug}.
          </div>
        </header>

        {/* Paper Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-8 lg:p-20 flex justify-center">
           <article className="max-w-3xl w-full bg-white p-12 lg:p-20 rounded-[2.5rem] border border-zinc-200 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 rounded-full" style={{ background: `linear-gradient(to right, transparent, ${accent}40, transparent)` }} />
              
              <div className="prose prose-zinc max-w-none">
                <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(content.ebookContent.replace(/\n/g, '<br/>')) }} className="text-zinc-800 leading-[2] font-medium text-lg" />
              </div>

              <div className="mt-20 pt-10 border-t border-zinc-100 flex justify-between items-center opacity-30">
                 <span className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-500">{content.ebookTitle}</span>
                 <span className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-500">Pagina 1</span>
              </div>
           </article>
        </div>

        {/* Bottom Navigation (Floating) */}
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-4 p-2 bg-white rounded-2xl border border-zinc-200 shadow-lg z-20">
           <button className="p-3 text-zinc-500 hover:text-zinc-800 hover:bg-zinc-50 transition-colors rounded-xl">
              <ChevronLeft className="w-5 h-5" />
           </button>
           <div className="h-6 w-px bg-zinc-200" />
           <span className="px-4 text-xs font-black uppercase tracking-widest text-zinc-800">Capitolo 1</span>
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
