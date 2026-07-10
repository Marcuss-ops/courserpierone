// ─── LumioProblem — Thin wrapper ───────────────────────────

import { SharedProblem } from "@/components/funnel/shared/SharedProblem";
import type { LumioLocaleContent, LumioT } from "./types";

interface LumioProblemProps {
  problema?: string;
  lc?: LumioLocaleContent;
  t: LumioT;
}

export function LumioProblem({ problema, lc, t }: LumioProblemProps) {
  return (
    <SharedProblem
      text={problema}
      badge={lc?.problem?.badge || t("the_problem", "Il Problema")}
      badgeBg="#F0EFEB"
      badgeColor="#8C8880"
      headingColor="#1B1B1B"
    />
  );
}
