import Link from "next/link";
import { Play, BookOpen, ChevronRight } from "lucide-react";
import { ProgressBar } from "./progress-bar";
import { getUiTranslations, uiT, localeToLanguage } from "@/lib/i18n";

interface CourseCardProps {
  slug: string;
  coverUrl: string | null;
  lessonCount: number;
  completedLessons: number;
  purchasedAt: Date;
  href: string;
  lang?: string; // 2-letter locale (e.g. "it", "en", "es"); defaults to "it"
}

export function CourseCard({
  slug,
  coverUrl,
  lessonCount,
  completedLessons,
  purchasedAt,
  href,
  lang = "it",
}: CourseCardProps) {
  const title = slug
    .split("-")
    .map((w) => (w[0] ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
  const progress = lessonCount > 0 ? Math.round((completedLessons / lessonCount) * 100) : 0;
  const isCompleted = lessonCount > 0 && completedLessons >= lessonCount;

  const t = getUiTranslations(lang);
  const formatterLocale = lang === "en" ? "en-US" : lang === "es" ? "es-ES" : "it-IT";
  const purchasedDate = new Date(purchasedAt).toLocaleDateString(formatterLocale, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <Link
      href={href}
      className="group flex flex-col bg-cream-card border border-cream-border rounded-[24px] overflow-hidden shadow-md shadow-black/20 hover:shadow-xl hover:shadow-black/40 hover:-translate-y-1 transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream-dark-gold focus-visible:ring-offset-2 focus-visible:ring-offset-cream-dark-bg"
    >
      <div className="aspect-[3/2] bg-gradient-to-br from-[#FFF9F0] to-[#F5E6D3] relative overflow-hidden">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt={title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <BookOpen className="w-14 h-14 text-cream-gold/30" />
          </div>
        )}
        {isCompleted && (
          <div className="absolute top-4 right-4 px-3 py-1.5 bg-[#1B5E20] text-white text-[10px] font-semibold rounded-full uppercase tracking-wider flex items-center gap-1.5 shadow-md">
            <span className="w-1.5 h-1.5 bg-white rounded-full" />
            {t.dashCourseCardCompleted}
          </div>
        )}
        <div className="absolute bottom-4 left-4 flex items-center gap-1.5 px-3 py-1.5 bg-cream-card/95 backdrop-blur rounded-full shadow-md">
          <Play className="w-3 h-3 text-cream-espresso fill-cream-espresso" />
          <span className="text-[10px] font-semibold text-cream-text">
            {uiT(t, "dashCourseCardLessonCount", { n: lessonCount })}
          </span>
        </div>
      </div>

      <div className="flex-1 flex flex-col p-6 space-y-4">
        <div className="space-y-1">
          <h3 className="font-serif text-xl text-cream-text leading-tight group-hover:text-cream-espresso transition-colors line-clamp-2">
            {title}
          </h3>
          <p className="text-xs text-cream-text-soft font-light">
            {uiT(t, "dashCourseCardPurchasedOn", { date: purchasedDate })}
          </p>
        </div>

        <div className="pt-3 border-t border-cream-border-soft">
          <ProgressBar value={progress} label={t.dashCourseCardProgressLabel} tone={isCompleted ? "green" : "warm"} />
        </div>

        <div className="flex items-center justify-end pt-1">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-cream-espresso group-hover:gap-2.5 transition-all">
            {isCompleted ? t.dashCourseCardResumeReview : progress > 0 ? t.dashCourseCardResumeContinue : t.dashCourseCardResumeStart}
            <ChevronRight className="w-3.5 h-3.5" />
          </div>
        </div>
      </div>
    </Link>
  );
}
