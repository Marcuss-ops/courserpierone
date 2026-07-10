// ─── SharedLessons — Reusable lessons grid section ──────────
// Used by: Lumio ("lumio"), Horizon ("horizon").
// Both share: numbered cards in a 3-column responsive grid.
// H612 uses a different list layout → not covered here.

interface LessonItem {
  titolo: string;
  descrizione: string;
}

export type { LessonItem };

interface SharedLessonsProps {
  lezioni?: LessonItem[];
  variant: "lumio" | "horizon";
  badgeText: string;
  titleText: string;
}

const VARIANT_STYLES = {
  lumio: {
    section: "py-20",
    sectionStyle: {} as React.CSSProperties,
    badge: {
      background: "#F0EFEB",
      color: "#8C8880",
      fontWeight: 600,
    } as React.CSSProperties,
    title: { color: "#1B1B1B" } as React.CSSProperties,
    card: {
      background: "#FFFDF8",
      border: "1px solid #D9D7D0",
    } as React.CSSProperties,
    cardTitle: { color: "#1B1B1B" } as React.CSSProperties,
    cardDesc: { color: "#8C8880" } as React.CSSProperties,
    numberBg: { background: "linear-gradient(135deg, #8A2387, #E94057)" } as React.CSSProperties,
  },
  horizon: {
    section: "py-20",
    sectionStyle: { background: "#fff9ee" } as React.CSSProperties,
    badge: {
      background: "#f3ede2",
      color: "#89726b",
      fontWeight: 700,
    } as React.CSSProperties,
    title: { color: "#1d1c15" } as React.CSSProperties,
    card: {
      background: "rgba(255,255,255,0.6)",
      backdropFilter: "blur(10px)",
      border: "1px solid rgba(255,255,255,0.8)",
      boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
    } as React.CSSProperties,
    cardTitle: { color: "#1d1c15" } as React.CSSProperties,
    cardDesc: { color: "#555555" } as React.CSSProperties,
    numberBg: { background: "#FF5E3A" } as React.CSSProperties,
  },
};

export function SharedLessons({
  lezioni,
  variant,
  badgeText,
  titleText,
}: SharedLessonsProps) {
  if (!lezioni || lezioni.length === 0) return null;

  const s = VARIANT_STYLES[variant];

  return (
    <section className={s.section} style={s.sectionStyle}>
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-12 text-center">
          <span
            className="mb-3 inline-block rounded-full px-3 py-1 text-xs uppercase tracking-wider"
            style={s.badge}
          >
            {badgeText}
          </span>
          <h2
            className="mt-3 font-bold"
            style={{
              fontSize: "clamp(24px, 3vw, 36px)",
              color: s.title.color,
            }}
          >
            {titleText}
          </h2>
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {lezioni.map((lez, i) => (
            <div
              key={i}
              className="group rounded-3xl p-6 transition hover:-translate-y-1"
              style={s.card}
            >
              <div
                className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl text-sm font-bold text-white"
                style={s.numberBg}
              >
                {i + 1}
              </div>
              <h3 className="font-semibold" style={s.cardTitle}>
                {lez.titolo}
              </h3>
              <p
                className="mt-2 text-sm leading-relaxed"
                style={s.cardDesc}
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
