// ─── LumioLessons — Grid of lesson cards ───────────────────

import type { LumioLocaleContent, LumioT } from "./types";

interface LessonItem {
  titolo: string;
  descrizione: string;
}

interface LumioLessonsProps {
  lezioni?: LessonItem[];
  lc?: LumioLocaleContent;
  t: LumioT;
}

export function LumioLessons({ lezioni, lc, t }: LumioLessonsProps) {
  if (!lezioni || lezioni.length === 0) return null;

  return (
    <section className="py-20">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-12 text-center">
          <span
            className="mb-3 inline-block rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider"
            style={{ background: "#F0EFEB", color: "#8C8880" }}
          >
            {lc?.lessons?.badge || t("what_learn", "Cosa Imparerai")}
          </span>
          <h2
            className="mt-3 font-bold"
            style={{
              fontSize: "clamp(24px, 3vw, 36px)",
              color: "#1B1B1B",
            }}
          >
            {lc?.lessons?.title || t("course_lessons", "Lezioni del Corso")}
          </h2>
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {lezioni.map((lez, i) => (
            <div
              key={i}
              className="group rounded-3xl p-6 transition hover:-translate-y-1"
              style={{
                background: "#FFFDF8",
                border: "1px solid #D9D7D0",
              }}
            >
              <div
                className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl text-sm font-bold text-white"
                style={{
                  background: "linear-gradient(135deg, #8A2387, #E94057)",
                }}
              >
                {i + 1}
              </div>
              <h3 className="font-semibold" style={{ color: "#1B1B1B" }}>
                {lez.titolo}
              </h3>
              <p
                className="mt-2 text-sm leading-relaxed"
                style={{ color: "#8C8880" }}
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
