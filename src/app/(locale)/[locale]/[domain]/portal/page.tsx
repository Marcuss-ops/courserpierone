import Link from "next/link";
import { notFound } from "next/navigation";
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
      <div className="min-h-screen bg-[#050505] text-[#e5e2e1] font-hanken overflow-x-hidden relative">
        {/* Background Gradients */}
        <div className="absolute -top-40 -right-40 w-[500px] h-[500px] bg-accent-primary/5 rounded-full blur-[120px] -z-10" />
        <div className="absolute -bottom-40 -left-40 w-[400px] h-[400px] bg-accent-secondary/5 rounded-full blur-[120px] -z-10" />

        {/* Top Navigation */}
        <nav className="sticky top-0 z-50 bg-black/60 backdrop-blur-xl border-b border-white/5">
          <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
            <Link href="/dashboard" className="flex items-center gap-2 text-zinc-500 hover:text-white transition-colors text-xs font-bold uppercase tracking-widest">
              <ChevronLeft className="w-4 h-4" />
              Dashboard
            </Link>

            <span className="text-xl font-black tracking-tighter text-white uppercase">{course.slug}.</span>

            <div className="flex items-center gap-4">
              {isAuthenticated && (
                <a
                  href="/api/auth/signout"
                  className="p-2.5 premium-glass rounded-xl text-zinc-500 hover:text-red-400 transition-all border border-white/5 hover:border-red-500/20"
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
            <div className="inline-flex items-center gap-2 px-4 py-1.5 premium-glass rounded-full border border-white/5">
              <Sparkles className="w-3.5 h-3.5 text-accent-primary animate-pulse" />
              <span className="text-[10px] font-black text-accent-primary uppercase tracking-widest">
                Accesso Garantito
              </span>
            </div>
            <h1 className="text-4xl md:text-6xl font-black text-white text-contrast tracking-tight leading-none">
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
              className="group premium-glass rounded-[2rem] p-8 border border-white/5 hover:border-accent-primary/20 transition-all duration-500 flex flex-col justify-between min-h-[320px] relative overflow-hidden"
            >
              <div className="absolute -right-8 -top-8 w-32 h-32 bg-accent-primary/5 rounded-full blur-2xl group-hover:bg-accent-primary/10 transition-all duration-700" />
              
              <div className="space-y-6 relative z-10">
                <div className="w-14 h-14 premium-glass rounded-2xl flex items-center justify-center border border-white/10 group-hover:scale-105 transition-transform duration-500">
                  <Play className="w-6 h-6 text-accent-primary fill-current" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white text-contrast group-hover:text-accent-primary transition-colors">
                    Corso Video
                  </h3>
                  <p className="text-zinc-500 text-xs mt-2 font-medium leading-relaxed">
                    Accedi alle video lezioni, guarda le spiegazioni dettagliate e traccia il tuo progresso.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-6 border-t border-white/5 relative z-10">
                <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">
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
              className="group premium-glass rounded-[2rem] p-8 border border-white/5 hover:border-accent-secondary/20 transition-all duration-500 flex flex-col justify-between min-h-[320px] relative overflow-hidden"
            >
              <div className="absolute -right-8 -top-8 w-32 h-32 bg-accent-secondary/5 rounded-full blur-2xl group-hover:bg-accent-secondary/10 transition-all duration-700" />
              
              <div className="space-y-6 relative z-10">
                <div className="w-14 h-14 premium-glass rounded-2xl flex items-center justify-center border border-white/10 group-hover:scale-105 transition-transform duration-500">
                  <BookOpen className="w-6 h-6 text-accent-secondary" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white text-contrast group-hover:text-accent-secondary transition-colors">
                    Libro Digitale
                  </h3>
                  <p className="text-zinc-500 text-xs mt-2 font-medium leading-relaxed">
                    Leggi la guida completa in formato eBook direttamente dal lettore web o scarica il PDF offline.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-6 border-t border-white/5 relative z-10">
                <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">
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
                className="group premium-glass rounded-[2rem] p-8 border border-white/5 hover:border-accent-tertiary/20 transition-all duration-500 flex flex-col justify-between min-h-[320px] relative overflow-hidden"
              >
                <div className="absolute -right-8 -top-8 w-32 h-32 bg-accent-tertiary/5 rounded-full blur-2xl group-hover:bg-accent-tertiary/10 transition-all duration-700" />
                
                <div className="space-y-6 relative z-10">
                  <div className="w-14 h-14 premium-glass rounded-2xl flex items-center justify-center border border-white/10 group-hover:scale-105 transition-transform duration-500">
                    <Send className="w-6 h-6 text-accent-tertiary fill-current" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white text-contrast group-hover:text-accent-tertiary transition-colors">
                      Gruppo Riservato
                    </h3>
                    <p className="text-zinc-500 text-xs mt-2 font-medium leading-relaxed">
                      Entra nel canale privato per scambiare idee, ricevere supporto in tempo reale e collaborare.
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-6 border-t border-white/5 relative z-10">
                  <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">
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
                className="premium-glass rounded-[2rem] p-8 border border-white/5 flex flex-col justify-between min-h-[320px] relative overflow-hidden opacity-50"
              >
                <div className="space-y-6">
                  <div className="w-14 h-14 premium-glass rounded-2xl flex items-center justify-center border border-white/5">
                    <GraduationCap className="w-6 h-6 text-zinc-600" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-zinc-400">
                      Risorse Extra
                    </h3>
                    <p className="text-zinc-600 text-xs mt-2 font-medium leading-relaxed">
                      Nuove funzionalità e risorse aggiuntive verranno pubblicate prossimamente in questa area.
                    </p>
                  </div>
                </div>
                <div className="pt-6 border-t border-white/5 text-[9px] font-black text-zinc-600 uppercase tracking-widest">
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
