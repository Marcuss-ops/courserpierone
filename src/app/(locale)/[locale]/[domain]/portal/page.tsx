import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";
import { 
  Play, 
  BookOpen, 
  Send, 
  Sparkles, 
  GraduationCap, 
  ArrowRight,
  LogOut,
  ChevronLeft
} from "lucide-react";
import { getCourseConfig } from "@/lib/config/white-label-data";
import { AccessGate } from "@/components/course/access-gate";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth";

export default async function ProductPortalPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; domain: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { domain } = await params;
  const { lang } = await searchParams;
  
  const course = await getCourseConfig(domain);
  if (!course) return notFound();

  const session = await getServerSession(authOptions);
  const isAuthenticated = !!session?.user?.email;

  const currentLang = lang || (course.defaultLanguage as string) || "en";
  const content = course.languages[currentLang] || course.languages[course.defaultLanguage];

  // Verifica se la community è configurata ed attiva
  const hasCommunity = course.groupSection && course.groupSection.isActive !== false;

  return (
    <AccessGate productSlug={domain} courseTitle={content.title}>
      <div className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f] font-sans overflow-x-hidden relative">
        {/* Top Navigation */}
        <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-zinc-200/80">
          <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
            <Link href="/dashboard" className="flex items-center gap-2 text-zinc-500 hover:text-zinc-800 transition-colors text-xs font-bold uppercase tracking-widest">
              <ChevronLeft className="w-4 h-4" />
              Dashboard
            </Link>

            <span className="text-xl font-black tracking-tighter text-zinc-900 uppercase">{course.slug}.</span>

            <div className="flex items-center gap-4">
              {isAuthenticated && (
                <a
                  href="/api/auth/signout"
                  className="p-2.5 bg-zinc-100 hover:bg-zinc-200 rounded-xl text-zinc-600 hover:text-red-500 transition-all border border-zinc-200"
                >
                  <LogOut className="w-4 h-4" />
                </a>
              )}
            </div>
          </div>
        </nav>

        {/* Main Content */}
        <main className="max-w-5xl mx-auto px-6 py-16 md:py-24 space-y-12">
          {/* Header */}
          <div className="text-center space-y-4 max-w-2xl mx-auto">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-zinc-200/60 rounded-full border border-zinc-300/40">
              <Sparkles className="w-3.5 h-3.5 text-accent-primary animate-pulse" />
              <span className="text-[10px] font-black text-zinc-700 uppercase tracking-widest">
                Accesso Garantito
              </span>
            </div>
            <h1 className="text-4xl md:text-5xl font-extrabold text-zinc-900 tracking-tight leading-tight">
              {content.title}
            </h1>
            <p className="text-zinc-500 text-sm md:text-base font-medium leading-relaxed">
              Benvenuto nella tua area privata. Scegli a quale sezione accedere per iniziare subito il tuo percorso.
            </p>
          </div>

          {/* Hub Selection Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 pt-8">
            {/* Card 1: Corso Video */}
            <Link
              href={`/${domain}/curso/lesson-1?lang=${currentLang}`}
              className="group bg-white rounded-[1.5rem] p-8 border border-zinc-200/80 shadow-sm hover:shadow-md transition-all duration-300 hover:scale-[1.01] flex flex-col justify-between min-h-[320px] relative overflow-hidden"
            >
              <div className="space-y-6 relative z-10">
                <div className="w-14 h-14 bg-zinc-50 rounded-2xl flex items-center justify-center border border-zinc-200 group-hover:scale-105 transition-transform duration-500">
                  <Play className="w-6 h-6 text-accent-primary fill-current" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-zinc-900 group-hover:text-accent-primary transition-colors">
                    Corso Video
                  </h3>
                  <p className="text-zinc-500 text-xs mt-2 font-medium leading-relaxed">
                    Accedi alle video lezioni, guarda le spiegazioni dettagliate e traccia il tuo progresso.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-6 border-t border-zinc-100 relative z-10">
                <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                  {course.lessons.length} Lezioni
                </span>
                <span className="flex items-center gap-1 text-[10px] font-black text-accent-primary uppercase tracking-widest group-hover:gap-2 transition-all">
                  Inizia <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </Link>

            {/* Card 2: eBook */}
            <Link
              href={`/${domain}/ebook?lang=${currentLang}`}
              className="group bg-white rounded-[1.5rem] p-8 border border-zinc-200/80 shadow-sm hover:shadow-md transition-all duration-300 hover:scale-[1.01] flex flex-col justify-between min-h-[320px] relative overflow-hidden"
            >
              <div className="space-y-6 relative z-10">
                <div className="w-14 h-14 bg-zinc-50 rounded-2xl flex items-center justify-center border border-zinc-200 group-hover:scale-105 transition-transform duration-500">
                  <BookOpen className="w-6 h-6 text-accent-secondary" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-zinc-900 group-hover:text-accent-secondary transition-colors">
                    Libro Digitale
                  </h3>
                  <p className="text-zinc-500 text-xs mt-2 font-medium leading-relaxed">
                    Leggi la guida completa in formato eBook direttamente dal lettore web o scarica il PDF offline.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-6 border-t border-zinc-100 relative z-10">
                <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                  Formato PDF / Web
                </span>
                <span className="flex items-center gap-1 text-[10px] font-black text-accent-secondary uppercase tracking-widest group-hover:gap-2 transition-all">
                  Leggi <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </Link>

            {/* Card 3: Community / Gruppo Privato */}
            {hasCommunity ? (
              <a
                href={course.groupSection?.link}
                target="_blank"
                rel="noopener noreferrer"
                className="group bg-white rounded-[1.5rem] p-8 border border-zinc-200/80 shadow-sm hover:shadow-md transition-all duration-300 hover:scale-[1.01] flex flex-col justify-between min-h-[320px] relative overflow-hidden"
              >
                <div className="space-y-6 relative z-10">
                  <div className="w-14 h-14 bg-zinc-50 rounded-2xl flex items-center justify-center border border-zinc-200 group-hover:scale-105 transition-transform duration-500">
                    <Send className="w-6 h-6 text-accent-tertiary fill-current" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-zinc-900 group-hover:text-accent-tertiary transition-colors">
                      Gruppo Riservato
                    </h3>
                    <p className="text-zinc-500 text-xs mt-2 font-medium leading-relaxed">
                      Entra nel canale privato per scambiare idee, ricevere supporto in tempo reale e collaborare.
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-6 border-t border-zinc-100 relative z-10">
                  <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                    Community privata
                  </span>
                  <span className="flex items-center gap-1 text-[10px] font-black text-accent-tertiary uppercase tracking-widest group-hover:gap-2 transition-all">
                    Unisciti <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </a>
            ) : (
              /* Fallback Card se la community non è impostata */
              <div
                className="bg-white rounded-[1.5rem] p-8 border border-zinc-200/80 shadow-sm flex flex-col justify-between min-h-[320px] relative overflow-hidden opacity-50"
              >
                <div className="space-y-6">
                  <div className="w-14 h-14 bg-zinc-50 rounded-2xl flex items-center justify-center border border-zinc-200">
                    <GraduationCap className="w-6 h-6 text-zinc-400" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-zinc-400">
                      Risorse Extra
                    </h3>
                    <p className="text-zinc-550 text-xs mt-2 font-medium leading-relaxed">
                      Nuove funzionalità e risorse aggiuntive verranno pubblicate prossimamente in questa area.
                    </p>
                  </div>
                </div>
                <div className="pt-6 border-t border-zinc-100 text-[9px] font-black text-zinc-400 uppercase tracking-widest">
                  Prossimamente
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </AccessGate>
  );
}
