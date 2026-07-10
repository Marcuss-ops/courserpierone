// ─── HorizonProblem — Problem statement section ────────────

import type { HorizonLocaleContent } from "./types";

interface HorizonProblemProps {
  problema?: string;
  lc?: HorizonLocaleContent;
}

export function HorizonProblem({ problema, lc }: HorizonProblemProps) {
  if (!problema) return null;

  return (
    <section className="py-20">
      <div className="mx-auto max-w-3xl px-6 text-center">
        <span
          className="mb-4 inline-block rounded-full px-4 py-1 text-xs font-bold uppercase tracking-wider"
          style={{ background: "#f3ede2", color: "#89726b" }}
        >
          {lc?.problem?.badge || "Il Problema"}
        </span>
        <h2
          className="mt-4 font-bold"
          style={{
            fontSize: "clamp(28px, 4vw, 48px)",
            lineHeight: 1.2,
            letterSpacing: "-0.02em",
            color: "#1d1c15",
            textWrap: "balance",
          }}
        >
          {problema}
        </h2>
      </div>
    </section>
  );
}
