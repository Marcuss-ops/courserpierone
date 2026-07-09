import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";
import type { Metadata } from "next";
import { 
  Play, 
  BookOpen, 
  Sparkles,
  ArrowRight,
  LogOut
} from "lucide-react";
import { getCourseConfig } from "@/lib/config/white-label-data";
import { AccessGate } from "@/components/course/access-gate";
import { getServerUser } from "@/lib/supabase/get-user";
import { loadLocaleContentCached } from "@/lib/i18n/load-locale-content";
import { prisma } from "@/lib/db/prisma";
import nextDynamic from "next/dynamic";

const ChatModal = nextDynamic(() => import("@/components/chat/chat-modal").then(m => ({ default: m.ChatModal })));

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
  const title = seo?.title || `Area Studente — ${content.title}`;
  const description = seo?.description || "Accedi al tuo corso, guarda le video lezioni e leggi l'eBook.";
  const ogImage = `${baseUrl}/api/og?title=${encodeURIComponent(content.title)}&author=${encodeURIComponent(course.author || "")}&accent=${encodeURIComponent(course.accentColor || "#C9840D")}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${baseUrl}/${locale}/${domain}/portal`,
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
      canonical: `${baseUrl}/${locale}/${domain}/portal`,
    },
  };
}

export default async function ProductPortalPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; domain: string }>;
  searchParams: Promise<{ lang?: string; onboarded?: string }>;
}) {
  const { domain, locale } = await params;
  const { lang, onboarded } = await searchParams;
  
  const course = await getCourseConfig(domain);
  if (!course) return notFound();

  const { user, dbUser } = await getServerUser();
  const isAuthenticated = !!user?.email;

  // ── Trova il creator (admin) e il product ID per i DM ──
  const [creator, product] = isAuthenticated && dbUser?.role !== "admin"
    ? await Promise.all([
        prisma.user.findFirst({
          where: { role: "admin" },
          select: { id: true, name: true },
        }),
        prisma.product.findUnique({
          where: { slug: domain },
          select: { id: true },
        }),
      ])
    : [null, null];

  const currentLang = lang || (course.defaultLanguage as string) || "en";
  const content = course.languages[currentLang] || course.languages[course.defaultLanguage];

  // Load locale content for translations (cached via Redis)
  const localeContent = await loadLocaleContentCached(domain, currentLang);
  const lc = localeContent.portal;

  // Warm accent from product config, fallback to amber #C9840D
  const accent = course.accentColor ?? "#C9840D";
  const isVideoComingSoon = domain === "amish-secrets";
  const hasVideoLessons = (course.lessons ?? []).some((lesson) =>
    Object.values(lesson.videos ?? {}).some((videoUrl) => Boolean(videoUrl && videoUrl.trim()))
  );

  const COMING_SOON_TRANSLATIONS: Record<string, string> = {
    it: "Prossimamente",
    en: "Coming Soon",
    es: "Próximamente",
    fr: "Bientôt disponible",
    de: "Demnächst",
    pt: "Em breve",
    default: "Coming Soon"
  };
  const langKey = currentLang.split("-")[0]?.toLowerCase() ?? "en";
  const comingSoonText = COMING_SOON_TRANSLATIONS[langKey] ?? COMING_SOON_TRANSLATIONS.default;

  // ID della prima lezione (per quick-start dopo acquisto)
  const firstLessonId = course.lessons?.[0]?.id ?? "lesson-1";

  return (
    <AccessGate productSlug={domain} courseTitle={content.title}>
      <div className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f] font-sans overflow-x-hidden relative">
        {/* Top Navigation */}
        <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-zinc-200/80">
          <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-center">
            <span className="text-xl font-black tracking-tighter text-zinc-900 uppercase">{course.slug}.</span>

            {isAuthenticated && (
              <a
                href="/auth/signout"
                className="absolute right-6 p-2.5 bg-zinc-100 hover:bg-zinc-200 rounded-xl text-zinc-600 hover:text-red-500 transition-all border border-zinc-200"
              >
                <LogOut className="w-4 h-4" />
              </a>
            )}
          </div>
        </nav>

        {/* Hero Section */}
        <div className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-50 via-orange-50/40 to-[#f5f5f7]" />
          <div className="absolute top-0 right-0 w-96 h-96 bg-amber-200/20 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/3" />
          <div className="absolute bottom-0 left-0 w-72 h-72 bg-orange-200/15 rounded-full blur-[80px] translate-y-1/2 -translate-x-1/3" />
          
          <main className="relative max-w-5xl mx-auto px-6 pt-16 pb-8 md:pt-24 md:pb-12 space-y-12">
            {/* Header */}
            <div className="text-center space-y-4 max-w-2xl mx-auto">
              <div 
                className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border"
                style={{ 
                  backgroundColor: `${accent}10`,
                  borderColor: `${accent}30`
                }}
              >
                <Sparkles className="w-3.5 h-3.5 animate-pulse" style={{ color: accent }} />
                <span 
                  className="text-[10px] font-black uppercase tracking-widest"
                  style={{ color: accent }}
                >
                  {lc.access_badge || "Access Guaranteed"}
                </span>
              </div>
              <h1 className="text-4xl md:text-5xl font-extrabold text-zinc-900 tracking-tight leading-tight">
                {content.title}
              </h1>
              <p className="text-zinc-500 text-sm md:text-base font-medium leading-relaxed">
                {lc.welcome_text || "Welcome to your private area. Choose which section to access to start your journey right away."}
              </p>
              {onboarded === "1" && (
                <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-green-50 border border-green-200 text-green-700 text-xs font-bold animate-fadeIn">
                  <Sparkles className="w-4 h-4" />
                  {lc.onboarded_toast || "Accesso garantito! Inizia subito con la prima lezione."}
                </div>
              )}
            </div>
          </main>
        </div>

        {/* Hub Selection Cards */}
        <main className="max-w-5xl mx-auto px-6 py-8 md:py-12 space-y-12">
          <div className={`grid grid-cols-1 ${(hasVideoLessons || isVideoComingSoon) ? "md:grid-cols-2" : ""} gap-8`}>
            {(hasVideoLessons || isVideoComingSoon) && (
              isVideoComingSoon ? (
                <div
                  className="group bg-white/75 rounded-[1.5rem] p-8 shadow-sm transition-all duration-300 flex flex-col justify-between min-h-[320px] relative overflow-hidden border border-zinc-200/50 opacity-80"
                >
                  <div className="space-y-6 relative z-10">
                    <div 
                      className="w-14 h-14 rounded-2xl flex items-center justify-center"
                      style={{ backgroundColor: `${accent}08`, border: `1px solid ${accent}15` }}
                    >
                      <Play className="w-6 h-6 fill-current text-zinc-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-3">
                        <h3 className="text-xl font-bold text-zinc-500">
                          {lc.video_title || "Video Course"}
                        </h3>
                        <span 
                          className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest text-white shrink-0"
                          style={{ backgroundColor: accent }}
                        >
                          {comingSoonText}
                        </span>
                      </div>
                      <p className="text-zinc-400 text-xs mt-2 font-medium leading-relaxed">
                        {lc.video_desc || "Access video lessons, watch detailed explanations and track your progress."}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-6 border-t border-zinc-100 relative z-10">
                    <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                      {course.lessons?.length || 0} {lc.lessons_count_label || "Lessons"}
                    </span>
                    <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-zinc-400">
                      {comingSoonText}
                    </span>
                  </div>
                </div>
              ) : (
                <Link
                  href={`/${locale}/${domain}/curso/${firstLessonId}?lang=${currentLang}`}
                  className="group bg-white rounded-[1.5rem] p-8 shadow-sm hover:shadow-lg transition-all duration-300 hover:scale-[1.02] flex flex-col justify-between min-h-[320px] relative overflow-hidden border border-zinc-200/60"
                >
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-br from-amber-50/50 via-transparent to-orange-50/30" />
                  
                  <div className="space-y-6 relative z-10">
                    <div 
                      className="w-14 h-14 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform duration-500"
                      style={{ backgroundColor: `${accent}12`, border: `1px solid ${accent}20` }}
                    >
                      <Play className="w-6 h-6 fill-current" style={{ color: accent }} />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-zinc-900">
                        {lc.video_title || "Video Course"}
                      </h3>
                      <p className="text-zinc-500 text-xs mt-2 font-medium leading-relaxed">
                        {lc.video_desc || "Access video lessons, watch detailed explanations and track your progress."}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-6 border-t border-zinc-100 relative z-10">
                    <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                      {course.lessons.length} {lc.lessons_count_label || "Lessons"}
                    </span>
                    <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest group-hover:gap-2 transition-all" style={{ color: accent }}>
                      {lc.start_label || "Start"} <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </Link>
              )
            )}
            {/* Card 2: eBook */}
            <Link
              href={`/${locale}/${domain}/ebook?lang=${currentLang}`}
              className="group bg-white rounded-[1.5rem] p-8 shadow-sm hover:shadow-lg transition-all duration-300 hover:scale-[1.02] flex flex-col justify-between min-h-[320px] relative overflow-hidden border border-zinc-200/60"
            >
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-br from-orange-50/50 via-transparent to-amber-50/30" />
              
              <div className="space-y-6 relative z-10">
                <div 
                  className="w-14 h-14 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform duration-500"
                  style={{ backgroundColor: `${accent}12`, border: `1px solid ${accent}20` }}
                >
                  <BookOpen className="w-6 h-6" style={{ color: accent }} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-zinc-900">
                    {lc.ebook_title || "Digital Book"}
                  </h3>
                  <p className="text-zinc-500 text-xs mt-2 font-medium leading-relaxed">
                    {lc.ebook_desc || "Read the complete guide in eBook format directly from the web reader or download the offline PDF."}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-6 border-t border-zinc-100 relative z-10">
                <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                  {lc.format_label || "PDF / Web Format"}
                </span>
                <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest group-hover:gap-2 transition-all" style={{ color: accent }}>
                  {lc.read_label || "Read"} <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </Link>
          </div>

          {/* DM: Scrivi al creator — visibile solo a studenti autenticati */}
          {isAuthenticated && dbUser && creator && (
            <div className="flex justify-center pt-4 border-t border-zinc-100">
              <ChatModal
                currentUserId={dbUser.id}
                currentUserName={dbUser.name || "Studente"}
                creatorId={creator.id}
                creatorName={creator.name || course.author}
                productId={product?.id || undefined}
              />
            </div>
          )}
        </main>

      </div>
    </AccessGate>
  );
}
