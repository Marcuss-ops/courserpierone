// ─── H612Lessons — Lesson list with numbered cards ────────

import type { H612LocaleContent, H612T } from "./types";

interface LessonItem {
  titolo: string;
  descrizione: string;
}

interface H612LessonsProps {
  lezioni?: LessonItem[];
  lc?: H612LocaleContent;
  t: H612T;
}

export function H612Lessons({ lezioni, lc, t }: H612LessonsProps) {
  if (!lezioni || lezioni.length === 0) return null;

  return (
    <section className="py-20">
      <div className="mx-auto max-w-6xl px-6">
        <span
          className="mb-4 inline-block text-xs font-semibold uppercase tracking-widest"
          style={{ color: "#8e9192" }}
        >
          {lc?.lessons?.badge || t("curriculum", "Curriculum")}
        </span>
        <h2
          className="mb-12"
          style={{
            fontFamily: "'Noto Serif', serif",
            fontSize: "clamp(24px, 3vw, 36px)",
          }}
        >
          {lc?.lessons?.title || "Lezioni del Corso"}
        </h2>
        <div className="flex flex-col gap-4">
          {lezioni.map((lez, i) => (
            <div
              key={i}
              className="group flex items-start gap-6 rounded-xl p-6 transition hover:bg-white/5"
              style={{
                background: "#1c1b1b",
                border: "1px solid #353434",
              }}
            >
              <span
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-sm font-bold"
                style={{ background: "#2a2a2a", color: "#ffffff" }}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <h3
                  className="font-medium"
                  style={{ fontFamily: "'Manrope', sans-serif" }}
                >
                  {lez.titolo}
                </h3>
                <p className="mt-1 text-sm" style={{ color: "#8e9192" }}>
                  {lez.descrizione}
                </p>
              </div>
              <div
                className="ml-auto mt-2 h-[2px] w-0 flex-shrink-0 transition-all group-hover:w-16"
                style={{
                  background: "linear-gradient(90deg, #4facfe, #00f2fe)",
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
