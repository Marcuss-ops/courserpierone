import Link from "next/link";
import { notFound } from "next/navigation";
import { 
  ChevronLeft, 
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

export default async function CoursePage({
  params,
  searchParams,
}: {
  params: Promise<{ domain: string; lessonId: string }>;
  searchParams: Promise<{ lang?: string; token?: string }>;
}) {
  const { domain, lessonId } = await params;
  const { lang } = await searchParams;
  const course = await getCourseConfig(domain);

  if (!course) return notFound();

  const session = await getServerSession(authOptions);
  const isAuthenticated = !!session?.user?.email;

  const currentLang = (lang as "it" | "en") ?? (course.defaultLanguage as "it" | "en") ?? "it";
  const currentLesson = course.lessons.find((l) => l.id === lessonId) || course.lessons[0];

  return (
    <>
      <AnalyticsTracker productSlug={domain} />
      <TrackLessonView lessonId={currentLesson.id} isAuthenticated={isAuthenticated} />
      
      <div className="flex h-screen bg-[#050505] text-[#e5e2e1] font-hanken overflow-hidden">
        {/* Sidebar Lezioni */}
        <MobileSidebar toggleId="course-sidebar-toggle">
          <div className="p-8 border-b border-white/5">
            <Link href={`/${domain}?lang=${currentLang}`} className="flex items-center gap-2 text-zinc-500 hover:text-white transition-colors mb-6 text-xs font-bold uppercase tracking-widest">
              <ChevronLeft className="w-4 h-4" />
              Torna alla Landing
            </Link>
            <h2 className="text-xl font-black text-white text-contrast leading-tight">
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
                href={`/${domain}/curso/${lesson.id}?lang=${currentLang}`}
                className={`flex items-start gap-4 p-4 rounded-2xl transition-all duration-300 group ${
                  lesson.id === lessonId
                    ? "premium-glass border-white/10 shadow-lg"
                    : "hover:bg-white/5"
                }`}
              >
                <div className="mt-1">
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center text-[10px] font-black ${
                    lesson.id === lessonId ? 'border-accent-primary text-accent-primary' : 'border-zinc-700 text-zinc-500'
                  }`}>
                    {lesson.number}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className={`text-sm font-bold leading-tight mb-1 truncate ${
                    lesson.id === lessonId ? 'text-white' : 'text-zinc-400 group-hover:text-zinc-200'
                  }`}>
                    {lesson.titles[currentLang]}
                  </h4>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-medium text-zinc-600 uppercase tracking-tighter">
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

          <div className="p-6 border-t border-white/5 flex justify-between items-center">
            <div className="flex gap-4">
               <Link href={`?lang=it`} className={`text-[10px] font-black ${currentLang === 'it' ? 'text-accent-primary' : 'text-zinc-600'}`}>IT</Link>
               <Link href={`?lang=en`} className={`text-[10px] font-black ${currentLang === 'en' ? 'text-accent-primary' : 'text-zinc-600'}`}>EN</Link>
            </div>
            <div className="flex items-center gap-3">
              {isAuthenticated ? (
                <Link href="/dashboard" className="premium-glass px-3 py-2 rounded-xl text-[9px] font-black text-zinc-400 hover:text-white transition-colors border border-white/5">
                  {session.user?.email?.split("@")[0]}
                </Link>
              ) : (
                <Link href={`/login?productId=${domain}`} className="premium-glass p-3 rounded-xl text-zinc-400 hover:text-white transition-colors border border-white/5">
                  <Lock className="w-4 h-4" />
                </Link>
              )}
            </div>
          </div>
        </MobileSidebar>

        {/* Main Content Area */}
        <main className="flex-1 flex flex-col relative overflow-hidden">
          {/* Top Navigation */}
          <header className="h-20 flex items-center justify-between px-8 border-b border-white/5 bg-black/40 backdrop-blur-md z-10">
            <div className="flex items-center gap-4 lg:hidden">
              <SidebarToggleBtn toggleId="course-sidebar-toggle" className="p-2 premium-glass rounded-xl text-white">
                <Menu className="w-6 h-6" />
              </SidebarToggleBtn>
              <span className="font-black text-white text-lg tracking-tighter uppercase">{course.slug}.</span>
            </div>

            <div className="hidden lg:block">
              <span className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.3em]">Modulo • {course.languages[currentLang].title}</span>
              <h3 className="text-sm font-bold text-white mt-0.5">{currentLesson.titles[currentLang]}</h3>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex -space-x-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="w-8 h-8 rounded-full border-2 border-[#050505] bg-zinc-800 flex items-center justify-center text-[10px] font-bold overflow-hidden">
                    <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${i + 10}`} alt="User" />
                  </div>
                ))}
                <div className="w-8 h-8 rounded-full border-2 border-[#050505] bg-zinc-900 flex items-center justify-center text-[10px] font-bold text-zinc-500">
                  +12
                </div>
              </div>
              <button className="p-2.5 premium-glass rounded-xl text-zinc-400 hover:text-white transition-all">
                <Layout className="w-5 h-5" />
              </button>
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
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 pb-12">
                <div className="lg:col-span-2 space-y-8">
                  <div>
                    <h1 className="text-4xl font-black text-white text-contrast tracking-tight mb-4">
                      {currentLesson.titles[currentLang]}
                    </h1>
                    <p className="text-zinc-400 leading-relaxed text-lg font-medium">
                      {currentLesson.descriptions[currentLang]}
                    </p>
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

                <div className="space-y-6">
                  <LessonNotes 
                    lessonId={currentLesson.id} 
                    locale={currentLang} 
                    isAuthenticated={isAuthenticated}
                  />
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
