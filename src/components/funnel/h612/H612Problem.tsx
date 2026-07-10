// ─── H612Problem — Thin wrapper ────────────────────────────

import { SharedProblem } from "@/components/funnel/shared/SharedProblem";
import type { H612LocaleContent, H612T } from "./types";

interface H612ProblemProps {
  problema?: string;
  lc?: H612LocaleContent;
  t: H612T;
}

export function H612Problem({ problema, lc, t }: H612ProblemProps) {
  return (
    <SharedProblem
      text={problema}
      badge={lc?.problem?.badge || t("the_problem", "The Problem")}
      badgeBg="transparent"
      badgeColor="#8e9192"
      align="left"
      headingColor="#ffffff"
      headingFont="'Noto Serif', serif"
      className="py-24"
    />
  );
}
