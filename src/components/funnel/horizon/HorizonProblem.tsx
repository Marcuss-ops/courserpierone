// ─── HorizonProblem — Thin wrapper ─────────────────────────

import { SharedProblem } from "@/components/funnel/shared/SharedProblem";
import type { HorizonLocaleContent } from "./types";

interface HorizonProblemProps {
  problema?: string;
  lc?: HorizonLocaleContent;
}

export function HorizonProblem({ problema, lc }: HorizonProblemProps) {
  return (
    <SharedProblem
      text={problema}
      badge={lc?.problem?.badge || "Il Problema"}
      badgeBg="#f3ede2"
      badgeColor="#89726b"
      headingColor="#1d1c15"
    />
  );
}
