// ─── LumioProblem — Problem statement section ──────────────

import type { LumioLocaleContent, LumioT } from "./types";

interface LumioProblemProps {
  problema?: string;
  lc?: LumioLocaleContent;
  t: LumioT;
}

export function LumioProblem({ problema, lc, t }: LumioProblemProps) {
  if (!problema) return null;

  return (
    <section className="py-20">
      <div className="mx-auto max-w-3xl px-6 text-center">
        <span
          className="mb-4 inline-block rounded-full px-4 py-1 text-xs font-semibold uppercase tracking-wider"
          style={{ background: "#F0EFEB", color: "#8C8880" }}
        >
          {lc?.problem?.badge || t("the_problem", "Il Problema")}
        </span>
        <h2
          className="mt-4 font-bold"
          style={{
            fontSize: "clamp(28px, 4vw, 49px)",
            lineHeight: 1.2,
            letterSpacing: "-0.02em",
            color: "#1B1B1B",
            textWrap: "balance",
          }}
        >
          {problema}
        </h2>
      </div>
    </section>
  );
}
