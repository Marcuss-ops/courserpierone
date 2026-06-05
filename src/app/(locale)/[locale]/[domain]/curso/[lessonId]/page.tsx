import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";
import type { Metadata } from "next";
import { 
  ChevronLeft, 
  ChevronRight,
  Menu, 
  Lock
} from "lucide-react";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth";
import { getCourseConfig } from "@/lib/config/white-label-data";
import { AnalyticsTracker } from "@/components/course/analytics-tracker";
import { LessonProgressButton, ProgressBar } from "@/components/course/lesson-progress-button";
import { VideoPaywall } from "@/components/course/video-paywall";
import { LessonNotes } from "@/components/course/lesson-notes";
import { LessonAssets } from "@/components/course/lesson-assets";
import { TrackLessonView } from "@/components/course/track-lesson-view";
import { MobileSidebar } from "@/components/layout/mobile-sidebar";
import { SidebarToggleBtn } from "@/components/layout/sidebar-toggle-btn";
import { AccessGate } from "@/components/course/access-gate";
import { loadLocaleContentSafe } from "@/lib/i18n/load-locale-content";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; domain: string; lessonId: string }>;
}): Promise<Metadata> {
  const { locale, domain, lessonId } = await params;

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

  const lesson = course.lessons.find(l => l.id === lessonId) || course.lessons[0];
  const lessonTitle = lesson?.titles[locale] ?? lesson?.titles[lang] ?? lesson?.titles[course.defaultLanguage] ?? "Lezione";
  const courseTitle = content?.title || domain;

  const title = `${lessonTitle} — ${courseTitle}`;
  const description = lesson?.descriptions[locale] ?? lesson?.descriptions[lang] ?? `Guarda la lezione "${lessonTitle}" del corso ${courseTitle}.`;
  const ogImage = `${baseUrl}/api/og?title=${encodeURIComponent(lessonTitle)}&author=${encodeURIComponent(course.author || "")}&accent=${encodeURIComponent(course.accentColor || "#C9840D")}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${baseUrl}/${locale}/${domain}/curso/${lessonId}`,
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
      canonical: `${baseUrl}/${locale}/${domain}/curso/${lessonId}`,
    },
  };
}

export default async function CoursePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; domain: string; lessonId: string }>;
  searchParams: Promise<{ lang?: string; token?: string; theme?: string }>;
}) {
  const { domain, lessonId } = await params;
  const { lang, theme } = await searchParams;
  const isDark = theme === "dark";
  const isLight = !isDark;
  const course = await getCourseConfig(domain);

  if (!course) return notFound();

  const session = await getServerSession(authOptions);
  const isAuthenticated = !!session?.user?.email;

  const currentLang = lang || (course.defaultLanguage as string) || "en";
  const currentLesson = course.lessons.find((l) => l.id === lessonId) || course.lessons[0];

  const currentIdx = course.lessons.findIndex((l) => l.id === currentLesson.id);
  const prevLesson = currentIdx > 0 ? course.lessons[currentIdx - 1] : null;
  const nextLesson = currentIdx < course.lessons.length - 1 ? course.lessons[currentIdx + 1] : null;

  const localeContent = loadLocaleContentSafe(domain, currentLang);
  const lc = localeContent.course;

  return (
    <AccessGate productSlug={domain} courseTitle={course.languages[currentLang].title}>
      <AnalyticsTracker productSlug={domain} />
      <TrackLessonView lessonId={currentLesson.id} isAuthenticated={isAuthenticated} />
      
      <div className={`flex h-screen font-sans overflow-hidden transition-colors duration-300 ${
        isLight ? "bg-[#f5f5f7] text-[#1d1d1f]" : "bg-[#1c1c1e] text-[#f5f5f7]"
      }`}>
        {/* Main Content Area */}
        <main className="flex-1 flex flex-col relative overflow-hidden">
          {/* Floating Sidebar Toggle (mobile only) */}
          <div className="absolute top-4 left-4 z-20 lg:hidden">
            <SidebarToggleBtn toggleId="course-sidebar-toggle" className={`p-2.5 rounded-xl shadow-md ${isLight ? "bg-white border border-zinc-200 text-zinc-800" : "premium-glass text-white"}`}>
              <Menu className="w-5 h-5" />
            </SidebarToggleBtn>
          </div>

          {/* Video & Info Section */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 lg:p-12">
            <div className="max-w-5xl mx-auto space-y-12">
              {/* Video Player with Paywall */}
              <div className="relative">
                <VideoPaywall
                  videoUrl={currentLesson.videos[currentLang]}
                  title={currentLesson.titles[currentLang]}
                  productSlug={domain}
                  isAuthenticated={isAuthenticated}
                  locale={currentLang}
                  previewDuration={120}
                />
              </div>

              {/* Lesson Details */}
              <div className="space-y-8 pb-12">
                <div className="space-y-8">
                  <div>
                    <h1 className={`text-4xl font-black tracking-tight mb-4 ${
                      isLight ? "text-zinc-900" : "text-white text-contrast"
                    }`}>
                      {currentLesson.titles[currentLang]}
                    </h1>
                    <p className={`leading-relaxed text-lg font-medium mb-8 ${
                      isLight ? "text-zinc-650" : "text-zinc-400"
                    }`}>
                      {currentLesson.descriptions[currentLang]}
                    </p>
                    
                    {/* Lezione Navigazione */}
                    <div className={`flex justify-between items-center pt-6 border-t ${
                      isLight ? "border-zinc-200" : "border-white/5"
                    }`}>
                      {prevLesson ? (
                        <Link
                          href={`/${domain}/curso/${prevLesson.id}?lang=${currentLang}${isDark ? "&theme=dark" : ""}`}
                          className={`flex items-center gap-2 px-5 py-3 rounded-xl text-xs font-bold transition-all border ${
                            isLight 
                              ? "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 border-zinc-200" 
                              : "premium-glass text-zinc-400 hover:text-white border-white/5"
                          }`}
                        >
                          <ChevronLeft className="w-4 h-4" />
                          {lc.prev_lesson || "Previous"}
                        </Link>
                      ) : (
                        <div />
                      )}

                      {nextLesson ? (
                        <Link
                          href={`/${domain}/curso/${nextLesson.id}?lang=${currentLang}${isDark ? "&theme=dark" : ""}`}
                          className={`flex items-center gap-2 px-5 py-3 rounded-xl text-xs font-bold transition-all border ${
                            isLight 
                              ? "bg-zinc-100 text-accent-primary hover:bg-zinc-200 border-zinc-200" 
                              : "premium-glass text-accent-primary hover:text-white border-white/5"
                          }`}
                        >
                          {lc.next_lesson || "Next"}
                          <ChevronRight className="w-4 h-4" />
                        </Link>
                      ) : (
                        <div />
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-4">
                    <LessonAssets 
                      lessonId={currentLesson.id} 
                      locale={currentLang} 
                      isAuthenticated={isAuthenticated}
                    />
                    <LessonProgressButton 
                      lessonId={currentLesson.id} 
                      productSlug={domain} 
                      isAuthenticated={isAuthenticated}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>

        {/* Sidebar Lezioni on the Right */}
        <MobileSidebar toggleId="course-sidebar-toggle">
          <div className={`flex flex-col h-full ${
            isLight ? "bg-white border-l border-zinc-200/80 text-zinc-800" : "bg-[#2c2c2e] border-l border-white/10 text-zinc-200"
          }`}>
            <div className={`p-8 border-b ${isLight ? "border-zinc-200" : "border-white/5"}`}>
              <Link href={`/${domain}/portal?lang=${currentLang}`} className={`flex items-center gap-2 transition-all duration-200 mb-6 text-[10px] font-black uppercase tracking-[0.2em] ${
                isLight ? "text-zinc-400 hover:text-zinc-900" : "text-zinc-500 hover:text-zinc-200"
              }`}>
                <ChevronLeft className="w-4 h-4" />
                {lc.back_to_course || "Back to Course"}
              </Link>
              <h2 className={`text-xl font-black leading-tight ${isLight ? "text-zinc-900" : "text-white text-contrast"}`}>
                {course.languages[currentLang].title}
              </h2>
              <ProgressBar 
                productSlug={domain} 
                totalLessons={course.lessons.length} 
                isAuthenticated={isAuthenticated}
              />
            </div>

            <nav className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-2">
              {course.lessons.map((lesson) => (
                <Link
                  key={lesson.id}
                  href={`/${domain}/curso/${lesson.id}?lang=${currentLang}${isDark ? "&theme=dark" : ""}`}
                  className={`flex items-start gap-4 p-4 rounded-2xl transition-all duration-200 group ${
                    lesson.id === lessonId
                      ? (isLight ? "bg-zinc-100 border border-zinc-200 shadow-sm" : "bg-white/10 border border-white/10 shadow-sm")
                      : (isLight ? "hover:bg-zinc-50 border border-transparent hover:border-zinc-200/60" : "hover:bg-white/5 border border-transparent hover:border-white/10")
                  }`}
                >
                  <div className="mt-1">
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center text-[10px] font-black ${
                      lesson.id === lessonId 
                        ? 'border-accent-primary text-accent-primary' 
                        : (isLight ? 'border-zinc-300 text-zinc-400' : 'border-zinc-700 text-zinc-500')
                    }`}>
                      {lesson.number}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className={`text-sm font-bold leading-tight mb-1 truncate ${
                      lesson.id === lessonId 
                        ? (isLight ? 'text-zinc-950 font-black' : 'text-white') 
                        : (isLight ? 'text-zinc-600 group-hover:text-zinc-900' : 'text-zinc-400 group-hover:text-zinc-200')
                    }`}>
                      {lesson.titles[currentLang]}
                    </h4>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-tighter">
                        {lesson.duration}
                      </span>
                      {lesson.id === lessonId && (
                        <span className="flex items-center gap-1 text-[9px] font-black text-accent-primary uppercase animate-pulse">
                          <div className="w-1 h-1 rounded-full bg-accent-primary" />
                          {lc.now_playing || "Now Playing"}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </nav>

            <div className={`p-6 border-t flex justify-between items-center ${isLight ? "border-zinc-200" : "border-white/5"}`}>
              <div className="flex gap-4">
                 <Link href={`?lang=it${isDark ? "&theme=dark" : ""}`} className={`text-[10px] font-black ${currentLang === 'it' ? 'text-accent-primary' : 'text-zinc-600'}`}>IT</Link>
                 <Link href={`?lang=en${isDark ? "&theme=dark" : ""}`} className={`text-[10px] font-black ${currentLang === 'en' ? 'text-accent-primary' : 'text-zinc-600'}`}>EN</Link>
              </div>
              <div className="flex items-center gap-3">
                {isAuthenticated ? (
                  <Link href="/dashboard" className={`px-3 py-2 rounded-xl text-[9px] font-black transition-colors border ${
                    isLight 
                      ? "bg-zinc-100 text-zinc-600 hover:text-zinc-900 border-zinc-200" 
                      : "premium-glass text-zinc-400 hover:text-white border-white/5"
                  }`}>
                    {session.user?.email?.split("@")[0]}
                  </Link>
                ) : (
                  <Link href={`/login?productId=${domain}`} className={`p-3 rounded-xl transition-colors border ${
                    isLight 
                      ? "bg-zinc-100 text-zinc-600 hover:text-zinc-900 border-zinc-200" 
                      : "premium-glass text-zinc-400 hover:text-white border-white/5"
                  }`}>
                    <Lock className="w-4 h-4" />
                  </Link>
                )}
              </div>
            </div>
          </div>
        </MobileSidebar>
      </div>
    </AccessGate>
  );
}
