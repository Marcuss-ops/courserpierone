// ─── SharedTestimonials — Quote + avatar testimonial section ─
// Used by: lumio, h612, horizon templates.
// Amish has its own card-grid Testimonials layout (not shared).

interface SharedTestimonialsProps {
  /** The testimonial quote text. Component returns null if falsy. */
  text?: string;
  /** Badge/eyebrow text above the quote. */
  badge?: string;
  /** Author name. */
  name?: string;
  /** Author role/location. */
  role?: string;
  /** Optional section ID for anchor navigation. */
  id?: string;
  /** Accent color for the quote mark gradient and avatar. */
  accentColor?: string;
  /** Badge background color. */
  badgeBg?: string;
  /** Badge text color. */
  badgeColor?: string;
  /** Quote text color. */
  textColor?: string;
  /** Name text color. */
  nameColor?: string;
  /** Role text color. */
  roleColor?: string;
  /** Avatar background gradient override. */
  avatarBg?: string;
  /** Extra class names. */
  className?: string;
}

export function SharedTestimonials({
  text,
  badge,
  name,
  role,
  id,
  accentColor = "#FF5E3A",
  badgeBg,
  badgeColor,
  textColor,
  nameColor,
  roleColor,
  avatarBg,
  className = "",
}: SharedTestimonialsProps) {
  if (!text) return null;

  return (
    <section id={id} className={`py-20 ${className}`}>
      <div className="mx-auto max-w-3xl px-6 text-center">
        {badge && (
          <span
            className="mb-4 inline-block rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider"
            style={{
              background: badgeBg ?? `${accentColor}18`,
              color: badgeColor ?? accentColor,
            }}
          >
            {badge}
          </span>
        )}
        <p
          className="mt-6 font-bold"
          style={{
            fontSize: "clamp(20px, 3vw, 32px)",
            lineHeight: 1.4,
            color: textColor ?? "inherit",
          }}
        >
          &ldquo;{text}&rdquo;
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <div
            className="h-10 w-10 rounded-full"
            style={{
              background:
                avatarBg ??
                `linear-gradient(135deg, ${accentColor}, ${accentColor}88)`,
            }}
          />
          <div className="text-left">
            <p
              className="text-sm font-semibold"
              style={{ color: nameColor ?? "inherit" }}
            >
              {name || "Student"}
            </p>
            <p
              className="text-xs"
              style={{ color: roleColor ?? "#6b7280" }}
            >
              {role || ""}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
