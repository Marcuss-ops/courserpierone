// ─── HorizonLessons — Grid of numbered lesson cards ────────

import type { HorizonLocaleContent } from "./types";

interface HorizonLessonsProps {
  lezioni?: { titolo: string; descrizione: string }[];
  lc?: HorizonLocaleContent;
}

export function HorizonLessons({ lezioni, lc }: HorizonLessonsProps) {
  if (!lezioni || lezioni.length === 0) return null;

  return (
    <section className="py-20" style={{ background: "#fff9ee" }}>
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-12 text-center">
          <span
            className="mb-3 inline-block rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider"
            style={{ background: "#f3ede2", color: "#89726b" }}
          >
            {lc?.lessons?.badge || "Cosa Imparerai"}
          </span>
          <h2
            className="mt-3 font-bold"
            style={{
              fontSize: "clamp(24px, 3vw, 36px)",
              color: "#1d1c15",
            }}
          >
            {lc?.lessons?.title || "Lezioni del Corso"}
          </h2>
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {lezioni.map((lez, i) => (
            <div
              key={i}
              className="group rounded-3xl p-6 transition hover:-translate-y-1"
              style={{
                background: "rgba(255,255,255,0.6)",
                backdropFilter: "blur(10px)",
                border: "1px solid rgba(255,255,255,0.8)",
                boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
              }}
            >
              <div
                className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl text-sm font-bold text-white"
                style={{ background: "#FF5E3A" }}
              >
                {i + 1}
              </div>
              <h3 className="font-semibold" style={{ color: "#1d1c15" }}>
                {lez.titolo}
              </h3>
              <p
                className="mt-2 text-sm leading-relaxed"
                style={{ color: "#555555" }}
              >
                {lez.descrizione}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
