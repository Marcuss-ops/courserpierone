// ─── LumioLessons — Thin wrapper ──────────────────────────

import { SharedLessons } from "@/components/funnel/shared/SharedLessons";
import type { LessonItem } from "@/components/funnel/shared/SharedLessons";
import type { LumioLocaleContent, LumioT } from "./types";

interface LumioLessonsProps {
  lezioni?: LessonItem[];
  lc?: LumioLocaleContent;
  t: LumioT;
}

export function LumioLessons({ lezioni, lc, t }: LumioLessonsProps) {
  return (
    <SharedLessons
      lezioni={lezioni}
      variant="lumio"
      badgeText={lc?.lessons?.badge || t("what_learn", "Cosa Imparerai")}
      titleText={lc?.lessons?.title || t("course_lessons", "Lezioni del Corso")}
    />
  );
}
