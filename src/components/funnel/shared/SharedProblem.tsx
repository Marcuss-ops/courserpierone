// ─── SharedProblem — Badge + heading problem section ────────
// Used by: lumio, h612, horizon templates.
// Amish has its own 3-card Problem layout (not shared).

interface SharedProblemProps {
  /** The problem statement text. Component returns null if falsy. */
  text?: string;
  /** Badge/eyebrow text shown above the heading. */
  badge?: string;
  /** Accent color for badge background and heading underline. */
  accentColor?: string;
  /** Badge background color (CSS color). Default: derived from accentColor. */
  badgeBg?: string;
  /** Badge text color. Default: derived from accentColor. */
  badgeColor?: string;
  /** Text alignment. Default: "center". */
  align?: "center" | "left";
  /** Heading color. Default: inherit. */
  headingColor?: string;
  /** Optional custom font family for the heading. */
  headingFont?: string;
  /** Extra class names for the section. */
  className?: string;
}

export function SharedProblem({
  text,
  badge,
  accentColor = "#FF5E3A",
  badgeBg,
  badgeColor,
  align = "center",
  headingColor,
  headingFont,
  className = "",
}: SharedProblemProps) {
  if (!text) return null;

  return (
    <section className={`py-20 ${className}`}>
      <div className={`mx-auto max-w-3xl px-6 ${align === "left" ? "" : "text-center"}`}>
        {badge && (
          <span
            className="mb-4 inline-block rounded-full px-4 py-1 text-xs font-bold uppercase tracking-wider"
            style={{
              background: badgeBg ?? `${accentColor}18`,
              color: badgeColor ?? accentColor,
            }}
          >
            {badge}
          </span>
        )}
        <h2
          className="mt-4 font-bold"
          style={{
            fontSize: "clamp(28px, 4vw, 48px)",
            lineHeight: 1.2,
            letterSpacing: "-0.02em",
            color: headingColor ?? "inherit",
            textWrap: "balance",
            ...(headingFont ? { fontFamily: headingFont } : {}),
          }}
        >
          {text}
        </h2>
      </div>
    </section>
  );
}
