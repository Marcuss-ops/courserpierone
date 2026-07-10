// ─── H612Problem — Problem statement section ──────────────

import type { H612LocaleContent, H612T } from "./types";

interface H612ProblemProps {
  problema?: string;
  lc?: H612LocaleContent;
  t: H612T;
}

export function H612Problem({ problema, lc, t }: H612ProblemProps) {
  if (!problema) return null;

  return (
    <section className="py-24">
      <div className="mx-auto max-w-3xl px-6">
        <span
          className="mb-4 inline-block text-xs font-semibold uppercase tracking-widest"
          style={{ color: "#8e9192" }}
        >
          {lc?.problem?.badge ||
            t("the_problem", "The Problem")}
        </span>
        <h2
          className="mt-4"
          style={{
            fontFamily: "'Noto Serif', serif",
            fontSize: "clamp(28px, 4vw, 48px)",
            lineHeight: 1.2,
            letterSpacing: "-0.01em",
          }}
        >
          {problema}
        </h2>
      </div>
    </section>
  );
}
