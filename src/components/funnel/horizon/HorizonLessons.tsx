// ─── HorizonLessons — Thin wrapper ────────────────────────

import { SharedLessons } from "@/components/funnel/shared/SharedLessons";
import type { LessonItem } from "@/components/funnel/shared/SharedLessons";
import type { HorizonLocaleContent } from "./types";

interface HorizonLessonsProps {
  lezioni?: LessonItem[];
  lc?: HorizonLocaleContent;
}

export function HorizonLessons({ lezioni, lc }: HorizonLessonsProps) {
  return (
    <SharedLessons
      lezioni={lezioni}
      variant="horizon"
      badgeText={lc?.lessons?.badge || "Cosa Imparerai"}
      titleText={lc?.lessons?.title || "Lezioni del Corso"}
    />
  );
}
