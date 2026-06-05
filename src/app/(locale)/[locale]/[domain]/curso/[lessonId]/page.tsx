import Link from "next/link";
import { notFound } from "next/navigation";
import { 
  ChevronLeft, 
  ChevronRight,
  Menu, 
  Layout,
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

  return (
    <AccessGate productSlug={domain} courseTitle={course.languages[currentLang].title}>
      <AnalyticsTracker productSlug={domain} />
      <TrackLessonView lessonId={currentLesson.id} isAuthenticated={isAuthenticated} />
      
      <div className={`flex h-screen font-hanken overflow-hidden transition-colors duration-300 ${
        isLight ? "bg-[#f8f9fa] text-[#1b1b1b]" : "bg-[#050505] text-[#e5e2e1]"
      }`}>
        {/* Main Content Area */}
        <main className="flex-1 flex flex-col relative overflow-hidden">
          {/* Top Navigation */}
          <header className={`h-20 flex items-center justify-between px-8 border-b transition-all duration-500 opacity-35 hover:opacity-100 z-10 ${
            isLight ? "border-zinc-200 bg-white/80" : "border-white/5 bg-black/40"
          } backdrop-blur-md`}>
            <div className="flex items-center gap-4 lg:hidden">
              <SidebarToggleBtn toggleId="course-sidebar-toggle" className={`p-2 rounded-xl ${isLight ? "bg-zinc-100 text-zinc-800" : "premium-glass text-white"}`}>
                <Menu className="w-6 h-6" />
              </SidebarToggleBtn>
              <span className={`font-black text-lg tracking-tighter uppercase ${isLight ? "text-zinc-950" : "text-white"}`}>{course.slug}.</span>
            </div>

            <div className="hidden lg:block">
              <span className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.3em]">Modulo • {course.languages[currentLang].title}</span>
              <h3 className={`text-sm font-bold mt-0.5 ${isLight ? "text-zinc-950" : "text-white"}`}>{currentLesson.titles[currentLang]}</h3>
            </div>

            <div className="flex items-center gap-4">
              <Link 
                href={`?lang=${currentLang}&theme=${isLight ? "dark" : "light"}`}
                className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-colors ${
                  isLight 
                    ? "border-zinc-200 bg-zinc-100 text-zinc-700 hover:bg-zinc-200" 
                    : "border-white/5 bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10"
                }`}
              >
                {isLight ? "Dark Mode" : "Light Mode"}
              </Link>
              {isAuthenticated ? (
                <Link href="/dashboard" className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-colors ${
                  isLight 
                    ? "border-zinc-200 bg-zinc-100 text-zinc-700 hover:bg-zinc-200" 
                    : "border-white/5 bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10"
                }`}>
                  Dashboard
                </Link>
              ) : null}
            </div>
          </header>

          {/* Video & Info Section */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 lg:p-12">
            <div className="max-w-5xl mx-auto space-y-12">
              {/* Video Player with Paywall */}
              <div className="relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-accent-primary/20 to-accent-secondary/20 rounded-[2.5rem] blur-xl opacity-50 group-hover:opacity-100 transition duration-1000"></div>
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
                          Precedente
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
                          Successiva
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
          <div className={`flex flex-col h-full opacity-35 hover:opacity-100 focus-within:opacity-100 transition-opacity duration-300 ${
            isLight ? "bg-white border-l border-zinc-200 text-zinc-800" : "bg-[#0c0c0e] border-l border-white/5 text-zinc-200"
          }`}>
            <div className={`p-8 border-b ${isLight ? "border-zinc-200" : "border-white/5"}`}>
              <Link href={`/${domain}?lang=${currentLang}`} className={`flex items-center gap-2 transition-colors mb-6 text-xs font-bold uppercase tracking-widest ${
                isLight ? "text-zinc-400 hover:text-zinc-800" : "text-zinc-500 hover:text-white"
              }`}>
                <ChevronLeft className="w-4 h-4" />
                Torna alla Landing
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
                  className={`flex items-start gap-4 p-4 rounded-2xl transition-all duration-300 group ${
                    lesson.id === lessonId
                      ? (isLight ? "bg-zinc-100 border border-zinc-300/50 shadow-md" : "premium-glass border-white/10 shadow-lg")
                      : "hover:bg-white/5"
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
                          In riproduzione
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
