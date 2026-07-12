import { BookOpen, TrendingUp } from "lucide-react";
import { ProgressBar } from "./progress-bar";
import { getUiTranslations, uiT } from "@/lib/i18n";

interface StatsBentoProps {
  courseCount: number;
  completedLessons: number;
  totalLessons: number;
  progressPercent: number;
  lang?: string;
}

export function StatsBento({ courseCount, completedLessons, totalLessons, progressPercent, lang = "it" }: StatsBentoProps) {
  const t = getUiTranslations(lang);

  // Pluralization for the courseCount label: 0 → zero, 1 → one, >1 → many
  const coursesLabel =
    courseCount === 0
      ? t.dashStatsCoursesZero
      : courseCount === 1
      ? t.dashStatsCoursesOne
      : uiT(t, "dashStatsCoursesMany", { n: courseCount });

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-5">
      {/* Main progress card — cream on dark, high contrast */}
      <div className="md:col-span-2 relative overflow-hidden bg-cream-card border border-cream-border rounded-[28px] p-7 shadow-md shadow-black/20 hover:shadow-lg hover:shadow-black/30 transition-shadow duration-300">
        <div className="flex items-start justify-between mb-6">
          <div>
            <p className="text-[10px] font-semibold text-cream-text-soft uppercase tracking-widest mb-2">
              {t.dashStatsProgressHeader}
            </p>
            <p className="font-serif text-5xl text-cream-text leading-none tabular-nums">
              {progressPercent}
              <span className="text-2xl text-cream-text-soft">%</span>
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#FFF5E6] to-[#FFE4C4] flex items-center justify-center shadow-sm">
            <TrendingUp className="w-5 h-5 text-cream-gold" />
          </div>
        </div>
        <ProgressBar value={progressPercent} showValue={false} className="mt-4" />
        <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-cream-text-soft">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-cream-gold" />
            <span>
              <strong className="text-cream-text font-semibold">{completedLessons}</strong>{" "}
              {uiT(t, "dashStatsLessonsCompleted", { n: completedLessons })}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-cream-border" />
            <span>
              <strong className="text-cream-text font-semibold">{totalLessons}</strong>{" "}
              {t.dashStatsTotalLabel}
            </span>
          </div>
        </div>
      </div>

      {/* Courses stat — cream card */}
      <div className="bg-cream-card border border-cream-border rounded-[28px] p-7 shadow-md shadow-black/20 hover:shadow-lg hover:shadow-black/30 transition-shadow duration-300">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#FFF0E5] to-[#FFD9B8] flex items-center justify-center mb-6 shadow-sm">
          <BookOpen className="w-5 h-5 text-cream-orange" />
        </div>
        <p className="text-[10px] font-semibold text-cream-text-soft uppercase tracking-widest mb-2">
          {t.dashStatsCoursesHeader}
        </p>
        <p className="font-serif text-4xl text-cream-text leading-none mb-2 tabular-nums">{courseCount}</p>
        <p className="text-xs text-cream-text-soft font-light">
          {coursesLabel}
        </p>
      </div>
    </div>
  );
}
