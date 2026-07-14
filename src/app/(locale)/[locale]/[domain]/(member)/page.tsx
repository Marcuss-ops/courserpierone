import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";
import type { Metadata } from "next";
import {
  Play,
  BookOpen,
  Download,
  ChevronRight,
  Check,
  Sparkles,
} from "lucide-react";
import { getCourseConfig } from "@/lib/config/white-label-data";
import { getServerUser } from "@/lib/supabase/get-user";
import { loadLocaleContentCached } from "@/lib/i18n/load-locale-content";
import { prisma } from "@/lib/db/prisma";

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
  const content =
    course.languages[locale] ??
    course.languages[lang] ??
    course.languages[course.defaultLanguage];
  if (!content) return {};

  const title = `${content.title} — Corso`;
  const ogImage = `${baseUrl}/api/og?title=${encodeURIComponent(content.title)}&author=${encodeURIComponent(course.author || "")}&accent=${encodeURIComponent(course.accentColor || "#C9840D")}`;

  return {
    title,
    description: content.description,
    openGraph: {
      title,
      description: content.description,
      url: `${baseUrl}/${locale}/${domain}`,
      type: "website",
      siteName: "Courssy",
      locale: locale.replace("-", "_"),
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: content.description,
      images: [ogImage],
    },
    alternates: { canonical: `${baseUrl}/${locale}/${domain}/` },
  };
}

export default async function CourseCorsoTab({
  params,
}: {
  params: Promise<{ locale: string; domain: string }>;
}) {
  const { locale, domain } = await params;

  const course = await getCourseConfig(domain);
  if (!course) return notFound();

  const { dbUser } = await getServerUser();
  const lang2 = locale.split("-")[0]?.toLowerCase() ?? "en";
  const content =
    course.languages[locale] ?? course.languages[lang2] ?? course.languages[course.defaultLanguage];
  if (!content) return notFound();

  const lc = (await loadLocaleContentCached(domain, lang2)).portal;
  const accent = course.accentColor ?? "#C9840D";

  // Per-lesson completion progress for the current user — drives the
  // checkmarks / accent-filled ring on each lesson card. Empty for admins.
  const completedLessonIds = new Set<string>();
  if (dbUser) {
    const productRow = await prisma.product.findUnique({
      where: { slug: domain },
      select: { id: true },
    });
    if (productRow) {
      const progressRows = await prisma.lessonProgress.findMany({
        where: {
          userId: dbUser.id,
          completed: true,
          lesson: { productId: productRow.id },
        },
        select: { lessonId: true },
      });
      for (const r of progressRows) completedLessonIds.add(r.lessonId);
    }
  }

  const hasVideoLessons = course.lessons.some((l) =>
    Object.values(l.videos ?? {}).some((v) => v?.trim())
  );

  const basePath = `/${locale}/${domain}`;

  // Locale fallbacks for this tab
  const t = {
    welcomeBack: (lang2 === "it" ? "Bentornato" : "Welcome back"),
    keepGoing: (lang2 === "it" ? "Continua il tuo percorso" : "Keep going"),
    progressLabel: (lang2 === "it" ? "Lezioni completate" : "Lessons completed"),
    lessonsTitle:
      lc.tab_corso_lessons_title ||
      (lang2 === "it" ? "Programma del Corso" : "Course Curriculum"),
    lessonsSubtitle:
      lc.tab_corso_lessons_subtitle ||
      (lang2 === "it"
        ? "Tutte le lezioni in ordine. Clicca per iniziare o riprendere."
        : "All lessons in order. Click to start or resume."),
    startLesson: (lang2 === "it" ? "Inizia" : "Start"),
    resumeLesson: (lang2 === "it" ? "Riprendi" : "Resume"),
    reviewLesson: (lang2 === "it" ? "Rivedi" : "Review"),
    ebookTitle:
      lc.tab_corso_ebook_title ||
      (lang2 === "it" ? "Libro Digitale" : "Digital Book"),
    ebookDesc:
      lc.tab_corso_ebook_desc ||
      (lang2 === "it"
        ? "Leggi la guida completa nel lettore web o scarica il PDF offline."
        : "Read the complete guide in the web reader or download the offline PDF."),
    ebookCta: (lang2 === "it" ? "Leggi" : "Read"),
    downloadablesTitle:
      lc.tab_corso_dl_title || (lang2 === "it" ? "Risorse" : "Resources"),
    downloadablesDesc:
      lc.tab_corso_dl_desc ||
      (lang2 === "it"
        ? "Checklist, fogli Excel e materiali extra."
        : "Checklists, Excel sheets, and extra materials."),
  };

  const completedCount = completedLessonIds.size;
  const totalLessons = course.lessons.length;
  const progressPct =
    totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;

  return (
    <div className="space-y-10">
      {/* Welcome / Header */}
      <header className="space-y-4">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-cream-dark-gold/15 border border-cream-dark-gold/30 text-cream-dark-gold text-[10px] font-black uppercase tracking-widest">
          <Sparkles className="w-3 h-3" />
          {t.welcomeBack}, {dbUser?.name ?? dbUser?.email?.split("@")[0] ?? "👋"}
        </div>
        <h1 className="font-serif text-3xl md:text-5xl text-cream-dark-text leading-tight tracking-tight">
          {content.title}
        </h1>
        <p className="text-cream-dark-text-soft font-light leading-relaxed max-w-3xl">
          {content.description}
        </p>

        {/* Progress strip */}
        {hasVideoLessons && totalLessons > 0 && (
          <div className="bg-cream-dark-surface border border-cream-dark-border rounded-2xl p-5 flex items-center gap-4 mt-2">
            <div className="shrink-0">
              <div className="relative w-14 h-14">
                <svg viewBox="0 0 36 36" className="w-14 h-14 -rotate-90">
                  <circle
                    cx="18"
                    cy="18"
                    r="15"
                    stroke="#2A2A2E"
                    strokeWidth="3"
                    fill="none"
                  />
                  <circle
                    cx="18"
                    cy="18"
                    r="15"
                    stroke={accent}
                    strokeWidth="3"
                    fill="none"
                    strokeDasharray={`${(progressPct / 100) * 94.25} 94.25`}
                    strokeLinecap="round"
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-cream-dark-text">
                  {progressPct}%
                </span>
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-cream-dark-text">
                {t.keepGoing}
              </p>
              <p className="text-xs text-cream-dark-text-soft mt-1 font-light">
                {completedCount} / {totalLessons} {t.progressLabel}
              </p>
            </div>
          </div>
        )}
      </header>

      {/* Lessons list */}
      <section className="space-y-4">
        <div>
          <h2 className="font-serif text-xl md:text-2xl text-cream-dark-text leading-tight">
            {t.lessonsTitle}
          </h2>
          <p className="text-sm text-cream-dark-text-soft font-light mt-1">
            {t.lessonsSubtitle}
          </p>
        </div>
        <div className="space-y-3">
          {course.lessons.map((lesson, idx) => {
            const isCompleted = completedLessonIds.has(lesson.id);
            const lessonTitle =
              lesson.titles[locale] ??
              lesson.titles[lang2] ??
              Object.values(lesson.titles)[0] ??
              `Lesson ${idx + 1}`;
            const lessonDesc =
              lesson.descriptions[locale] ??
              lesson.descriptions[lang2] ??
              "";

            const cta =
              isCompleted
                ? t.reviewLesson
                : completedCount > 0
                  ? t.resumeLesson
                  : t.startLesson;

            return (
              <Link
                key={lesson.id}
                href={`${basePath}/curso/${lesson.id}?lang=${lang2}`}
                className="group block bg-cream-dark-surface border border-cream-dark-border rounded-2xl p-5 hover:border-cream-dark-gold/40 hover:bg-cream-dark-surface/80 hover:-translate-y-0.5 transition-all shadow-md shadow-black/20"
              >
                <div className="flex items-start gap-4">
                  <div
                    className={[
                      "shrink-0 w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs border",
                      isCompleted
                        ? "bg-cream-dark-gold/30 text-cream-dark-gold border-cream-dark-gold/40"
                        : "bg-cream-dark-bg text-cream-dark-text-soft border-cream-dark-border",
                    ].join(" ")}
                  >
                    {isCompleted ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <Play className="w-4 h-4 fill-current" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-serif text-base text-cream-dark-text font-bold leading-tight">
                      {lessonTitle}
                    </h3>
                    {lessonDesc && (
                      <p className="text-xs text-cream-dark-text-soft font-light mt-1 line-clamp-2 leading-relaxed">
                        {lessonDesc}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-[10px] text-cream-dark-text-soft font-medium">
                      {lesson.duration && (
                        <span>{lesson.duration}</span>
                      )}
                      {lesson.number && (
                        <span className="text-cream-dark-text-soft/60">
                          · Lesson {lesson.number}
                        </span>
                      )}
                    </div>
                  </div>
                  <div
                    className="shrink-0 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg group-hover:gap-2 transition-all"
                    style={{ color: accent }}
                  >
                    {cta}
                    <ChevronRight className="w-3 h-3" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* eBook + Downloadables — side by side */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Link
          href={`${basePath}/ebook?lang=${lang2}`}
          className="group block bg-cream-dark-surface border border-cream-dark-border rounded-2xl p-6 hover:border-cream-dark-gold/40 hover:-translate-y-0.5 transition-all shadow-md shadow-black/20"
        >
          <div className="flex items-start gap-4">
            <div
              className="shrink-0 w-12 h-12 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: `${accent}15`, border: `1px solid ${accent}25` }}
            >
              <BookOpen className="w-5 h-5" style={{ color: accent }} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-serif text-lg text-cream-dark-text font-bold leading-tight">
                {t.ebookTitle}
              </h3>
              <p className="text-xs text-cream-dark-text-soft font-light mt-1 leading-relaxed">
                {t.ebookDesc}
              </p>
              <span
                className="inline-flex items-center gap-1 mt-3 text-[10px] font-black uppercase tracking-widest group-hover:gap-2 transition-all"
                style={{ color: accent }}
              >
                {t.ebookCta} <ChevronRight className="w-3 h-3" />
              </span>
            </div>
          </div>
        </Link>
        <Link
          href={`${basePath}/download?lang=${lang2}`}
          className="group block bg-cream-dark-surface border border-cream-dark-border rounded-2xl p-6 hover:border-cream-dark-gold/40 hover:-translate-y-0.5 transition-all shadow-md shadow-black/20"
        >
          <div className="flex items-start gap-4">
            <div
              className="shrink-0 w-12 h-12 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: `${accent}15`, border: `1px solid ${accent}25` }}
            >
              <Download className="w-5 h-5" style={{ color: accent }} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-serif text-lg text-cream-dark-text font-bold leading-tight">
                {t.downloadablesTitle}
              </h3>
              <p className="text-xs text-cream-dark-text-soft font-light mt-1 leading-relaxed">
                {t.downloadablesDesc}
              </p>
              <span
                className="inline-flex items-center gap-1 mt-3 text-[10px] font-black uppercase tracking-widest group-hover:gap-2 transition-all"
                style={{ color: accent }}
              >
                {lang2 === "it" ? "Scarica" : "Download"} <ChevronRight className="w-3 h-3" />
              </span>
            </div>
          </div>
        </Link>
      </section>
    </div>
  );
}
