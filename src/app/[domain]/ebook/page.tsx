import Link from "next/link";
import { notFound } from "next/navigation";
import { 
  ChevronLeft, 
  BookOpen, 
  Share2, 
  Download, 
  Bookmark,
  ChevronRight,
  Menu
} from "lucide-react";
import { getCourseConfig } from "@/lib/white-label-data";
import { MobileSidebar } from "@/components/layout/mobile-sidebar";
import { SidebarToggleBtn } from "@/components/layout/sidebar-toggle-btn";
import { sanitizeHtml } from "@/lib/sanitize";

export default async function EbookPage({
  params,
  searchParams,
}: {
  params: Promise<{ domain: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { domain } = await params;
  const { lang } = await searchParams;
  const data = await getCourseConfig(domain);

  if (!data) return notFound();

  const currentLang = (lang as "it" | "en") || (data.defaultLanguage as "it" | "en") || "it";
  const content = data.languages[currentLang] || data.languages[data.defaultLanguage];

  return (
    <div className="flex h-screen bg-[#0a0a0c] text-[#e5e2e1] font-hanken overflow-hidden">
      {/* Sidebar Struttura Libro */}
      <MobileSidebar toggleId="ebook-sidebar-toggle">
        <div className="p-8 border-b border-white/5">
          <Link href={`/${domain}?lang=${currentLang}`} className="flex items-center gap-2 text-zinc-500 hover:text-white transition-colors mb-6 text-xs font-bold uppercase tracking-widest">
            <ChevronLeft className="w-4 h-4" />
            Torna alla Landing
          </Link>
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-16 premium-glass rounded-lg flex items-center justify-center text-accent-secondary border-white/10 shadow-xl overflow-hidden relative">
               <div className="absolute inset-0 bg-gradient-to-t from-accent-secondary/20 to-transparent" />
               <BookOpen className="w-6 h-6 relative z-10" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white text-contrast leading-tight truncate w-44">
                {content.ebookTitle}
              </h2>
              <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-1">
                {data.author}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-zinc-500 mt-6">
            <span>Progresso Lettura</span>
            <span className="text-accent-secondary">12%</span>
          </div>
          <div className="w-full bg-white/5 h-1 rounded-full mt-2 overflow-hidden">
            <div className="bg-accent-secondary h-full w-[12%] shadow-[0_0_10px_#ddb7ff]" />
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-1">
          {data.ebookChapters.map((chapter, idx) => (
            <ChapterLink key={idx} title={chapter[currentLang] || chapter.it} page={chapter.page} active={idx === 0} />
          ))}
        </nav>

        <div className="p-6 border-t border-white/5">
          <div className="flex gap-4 mb-6 justify-center">
             <Link href={`?lang=it`} className={`text-[10px] font-black ${currentLang === 'it' ? 'text-accent-primary' : 'text-zinc-600'}`}>IT</Link>
             <Link href={`?lang=en`} className={`text-[10px] font-black ${currentLang === 'en' ? 'text-accent-primary' : 'text-zinc-600'}`}>EN</Link>
          </div>
          <a
            href={`/api/ebook/${data.slug}/download?lang=${currentLang}`}
            download
            className="w-full py-3 rounded-xl text-xs font-black text-white flex items-center justify-center gap-2 premium-glass border-white/10 hover:opacity-90 transition-opacity"
            style={{background: 'linear-gradient(135deg, #ddb7ff 0%, #9b6dff 100%)', boxShadow: '0 0 20px rgba(221, 183, 255, 0.2)'}}
          >
            <Download className="w-4 h-4" />
            Download PDF
          </a>
        </div>
      </MobileSidebar>

      {/* Reader Area */}
      <main className="flex-1 flex flex-col relative bg-[#050505] overflow-hidden">
        {/* Top Reader Controls */}
        <header className="h-16 flex items-center justify-between px-8 border-b border-white/5 bg-black/40 backdrop-blur-md z-10">
          <div className="flex items-center gap-6">
            <SidebarToggleBtn toggleId="ebook-sidebar-toggle" className="p-2 premium-glass rounded-xl text-white lg:hidden mr-2">
              <Menu className="w-6 h-6" />
            </SidebarToggleBtn>
            <div className="flex items-center gap-2">
               <button className="p-2 text-zinc-500 hover:text-white transition-colors">
                  <Bookmark className="w-4 h-4" />
               </button>
               <button className="p-2 text-zinc-500 hover:text-white transition-colors">
                  <Share2 className="w-4 h-4" />
               </button>
            </div>
            <div className="h-4 w-px bg-white/10" />
            <div className="flex items-center gap-4 text-xs font-bold">
               <span className="text-zinc-600 uppercase tracking-widest">Pagina</span>
               <div className="flex items-center gap-1">
                  <input type="text" defaultValue="1" className="w-8 bg-white/5 border border-white/5 rounded-lg py-1 text-center text-white" />
                  <span className="text-zinc-600">/ 120</span>
               </div>
            </div>
          </div>

          <div className="flex items-center gap-4 uppercase font-black text-[10px] tracking-tighter text-zinc-600">
             {data.slug}.
          </div>
        </header>

        {/* Paper Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-8 lg:p-20 flex justify-center">
           <article className="max-w-3xl w-full premium-glass p-12 lg:p-20 rounded-[3rem] border border-white/5 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-accent-secondary/30 to-transparent" />
              
              <div className="prose prose-invert prose-zinc max-w-none">
                <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(content.ebookContent.replace(/\n/g, '<br/>')) }} className="text-zinc-300 leading-[2] font-medium text-lg" />
              </div>

              <div className="mt-20 pt-10 border-t border-white/5 flex justify-between items-center opacity-30">
                 <span className="text-[10px] font-black uppercase tracking-[0.4em]">{content.ebookTitle}</span>
                 <span className="text-[10px] font-black uppercase tracking-[0.4em]">Pagina 1</span>
              </div>
           </article>
        </div>

        {/* Bottom Navigation (Floating) */}
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-4 p-2 premium-glass rounded-2xl border border-white/10 shadow-2xl z-20">
           <button className="p-3 text-zinc-400 hover:text-white transition-colors rounded-xl hover:bg-white/5">
              <ChevronLeft className="w-5 h-5" />
           </button>
           <div className="h-6 w-px bg-white/10" />
           <span className="px-4 text-xs font-black uppercase tracking-widest text-white">Capitolo 1</span>
           <div className="h-6 w-px bg-white/10" />
           <button className="p-3 text-zinc-400 hover:text-white transition-colors rounded-xl hover:bg-white/5">
              <ChevronRight className="w-5 h-5" />
           </button>
        </div>
      </main>


    </div>
  );
}

function ChapterLink({ title, page, active = false }: { title: string; page: number; active?: boolean }) {
  return (
    <button className={`w-full flex items-center justify-between p-3 rounded-xl transition-all duration-300 ${
      active ? 'bg-accent-secondary/10 text-white' : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
    }`}>
      <span className={`text-xs font-bold truncate pr-4 ${active ? 'text-accent-secondary' : ''}`}>{title}</span>
      <span className="text-[9px] font-black text-zinc-600">P. {page}</span>
    </button>
  );
}
