// ─── SharedStory — Reusable story 2-col section ────────────
// Used by: Lumio ("lumio"), H612 ("h612"), Horizon ("horizon").
// All three share: 2-column grid (cover left, text right),
// same data parsing (storia.split("\n")), same conditional null.

import type { ReactNode } from "react";

interface SharedStoryProps {
  storia?: string;
  coverUrl?: string;
  badgeText: string;
  /** Label shown below the default placeholder icon. */
  placeholderLabel?: string;
  variant: "lumio" | "h612" | "horizon";
  /** Custom cover placeholder (e.g. H612 animated orbs). Falls back to variant default. */
  coverPlaceholder?: ReactNode;
}

const VARIANT_STYLES = {
  lumio: {
    coverBg: "#F0EFEB",
    coverRounded: "40px",
    coverHeight: "400px",
    /** Badge */
    badge: {
      background: "#F0EFEB",
      color: "#8C8880",
      fontWeight: 600,
      pill: true,
      tracking: "wider",
    } as const,
    /** Title */
    title: {
      fontFamily: undefined as string | undefined,
      color: "#1B1B1B",
      bold: true,
    } as const,
    /** Description */
    desc: { color: "#8C8880", fontFamily: undefined as string | undefined, lineHeight: 1.7 } as const,
    /** Default placeholder */
    placeholderCircleBg: "linear-gradient(135deg, #FF416C, #FF4B2B)",
    placeholderCircleRounded: "16px",
    placeholderCircleSize: "80px",
    placeholderIconSize: "text-3xl",
    placeholderTextColor: "#8C8880",
  },
  h612: {
    coverBg: "#201f1f",
    coverRounded: "16px",
    coverHeight: "450px",
    badge: {
      background: undefined as string | undefined,
      color: "#8e9192",
      fontWeight: 600,
      pill: false,
      tracking: "widest",
    } as const,
    title: {
      fontFamily: "'Noto Serif', serif",
      color: undefined as string | undefined,
      bold: false,
    } as const,
    desc: {
      color: "#c7c6c6",
      fontFamily: "'Manrope', sans-serif",
      lineHeight: undefined as number | undefined,
    } as const,
    placeholderCircleBg: "#2a2a2a",
    placeholderCircleRounded: "12px",
    placeholderCircleSize: "64px",
    placeholderIconSize: "text-2xl",
    placeholderTextColor: "#8e9192",
  },
  horizon: {
    coverBg: "#f3ede2",
    coverRounded: "24px",
    coverHeight: "400px",
    badge: {
      background: "#f3ede2",
      color: "#89726b",
      fontWeight: 700,
      pill: true,
      tracking: "wider",
    } as const,
    title: {
      fontFamily: undefined as string | undefined,
      color: "#1d1c15",
      bold: true,
    } as const,
    desc: { color: "#555555", fontFamily: undefined as string | undefined, lineHeight: undefined as number | undefined } as const,
    placeholderCircleBg: "#ff8a65",
    placeholderCircleRounded: "16px",
    placeholderCircleSize: "80px",
    placeholderIconSize: "text-3xl",
    placeholderTextColor: "#89726b",
  },
};

function defaultCoverPlaceholder(
  v: (typeof VARIANT_STYLES)[keyof typeof VARIANT_STYLES],
  label: string,
) {
  return (
    <div className="text-center">
      <div
        className="mx-auto mb-4 flex items-center justify-center"
        style={{
          background: v.placeholderCircleBg,
          borderRadius: v.placeholderCircleRounded,
          width: v.placeholderCircleSize,
          height: v.placeholderCircleSize,
        }}
      >
        <span className={`${v.placeholderIconSize} text-white`}>📖</span>
      </div>
      <p className="text-sm font-medium" style={{ color: v.placeholderTextColor }}>
        {label}
      </p>
    </div>
  );
}

export function SharedStory({
  storia,
  coverUrl,
  badgeText,
  placeholderLabel,
  variant,
  coverPlaceholder,
}: SharedStoryProps) {
  if (!storia) return null;

  const v = VARIANT_STYLES[variant];

  return (
    <section id="features" className="py-20">
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid items-center gap-12 md:grid-cols-2">
          {/* Cover / Placeholder */}
          <div
            className="relative flex items-center justify-center overflow-hidden"
            style={{
              background: v.coverBg,
              borderRadius: v.coverRounded,
              height: v.coverHeight,
            }}
          >
            {coverUrl ? (
              <img
                src={coverUrl}
                alt="Cover"
                className="h-full w-full object-cover"
              />
            ) : (
              coverPlaceholder ??
              defaultCoverPlaceholder(v, placeholderLabel || "Cover del Prodotto")
            )}
          </div>
          {/* Text */}
          <div>
            {v.badge.pill ? (
              <span
                className="mb-3 inline-block rounded-full px-3 py-1 text-xs uppercase"
                style={{
                  background: v.badge.background,
                  color: v.badge.color,
                  fontWeight: v.badge.fontWeight,
                  letterSpacing: "0.05em",
                }}
              >
                {badgeText}
              </span>
            ) : (
              <span
                className="mb-3 inline-block text-xs uppercase"
                style={{
                  color: v.badge.color,
                  fontWeight: v.badge.fontWeight,
                  letterSpacing: "0.1em",
                }}
              >
                {badgeText}
              </span>
            )}
            <h2
              className={`mt-3${v.title.bold ? " font-bold" : ""}`}
              style={{
                fontFamily: v.title.fontFamily,
                fontSize: "clamp(24px, 3vw, 36px)",
                lineHeight: 1.2,
                color: v.title.color,
              }}
            >
              {storia.split("\n")[0] ?? "La storia del prodotto"}
            </h2>
            <p
              className="mt-4 leading-relaxed"
              style={{
                color: v.desc.color,
                fontFamily: v.desc.fontFamily,
                lineHeight: v.desc.lineHeight,
              }}
            >
              {storia.split("\n").slice(1).join("\n") || storia}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
