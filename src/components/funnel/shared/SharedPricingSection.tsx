// ─── SharedPricingSection — Reusable pricing/CTA section ────
// Used by: Lumio ("dark"), H612 ("orbs")

import type { ReactNode } from "react";

interface SharedPricingSectionProps {
  /** Section title (CTA text). */
  title: string;
  /** Price description text below the title. */
  description: string;
  /** CTA button label. */
  ctaLabel: string;
  /** Visual variant. */
  variant?: "dark" | "orbs";
  /** Optional custom button element (if you need TrackedCtaButton). */
  button?: ReactNode;
}

const VARIANT_STYLES = {
  dark: {
    section: "py-20",
    container: {
      background: "#1B1B1B",
      borderRadius: "40px",
      padding: "3rem",
    } as React.CSSProperties,
    title: {
      fontFamily: "inherit" as string,
      color: "#ffffff",
    },
    description: { color: "#9ca3af" },
    buttonStyle: {
      background: "linear-gradient(135deg, #FF416C, #FF4B2B)",
      boxShadow: "0 4px 20px rgba(255,65,108,0.4)",
      borderRadius: "9999px",
    } as React.CSSProperties,
  },
  orbs: {
    section: "py-24 relative overflow-hidden",
    container: {
      /* unused — only dark variant has a container */
    } as React.CSSProperties,
    title: {
      fontFamily: "'Noto Serif', serif",
      color: "#ffffff",
    },
    description: { color: "#c7c6c6" },
    buttonStyle: {
      background: "#ffffff",
      borderRadius: "0.5rem",
    } as React.CSSProperties,
  },
};

export function SharedPricingSection({
  title,
  description,
  ctaLabel,
  variant = "dark",
  button,
}: SharedPricingSectionProps) {
  const styles = VARIANT_STYLES[variant];

  return (
    <section id="pricing" className={styles.section}>
      {/* Floating orbs (H612 only) */}
      {variant === "orbs" && (
        <div className="pointer-events-none absolute inset-0">
          <div
            className="absolute left-1/4 top-1/4 h-[300px] w-[300px] rounded-full opacity-20"
            style={{
              background: "linear-gradient(135deg, #4facfe, #00f2fe)",
              filter: "blur(80px)",
              animation: "float 8s ease-in-out infinite",
            }}
          />
          <div
            className="absolute bottom-1/4 right-1/4 h-[250px] w-[250px] rounded-full opacity-15"
            style={{
              background: "linear-gradient(135deg, #f093fb, #f5576c)",
              filter: "blur(80px)",
              animation: "float 10s ease-in-out infinite reverse",
            }}
          />
        </div>
      )}

      <div className="relative z-10 mx-auto max-w-3xl px-6 text-center">
        {variant === "dark" ? (
          <div style={styles.container}>
            <h2
              className="text-3xl font-bold"
              style={{ color: styles.title.color }}
            >
              {title}
            </h2>
            <p
              className="mt-4 text-lg"
              style={{ color: styles.description.color }}
            >
              {description}
            </p>
            {button ?? (
              <button
                className="mt-8 px-10 py-4 text-base font-semibold text-white transition hover:-translate-y-0.5"
                style={styles.buttonStyle}
              >
                {ctaLabel}
              </button>
            )}
          </div>
        ) : (
          <>
            <h2
              style={{
                fontFamily: styles.title.fontFamily,
                fontSize: "clamp(28px, 4vw, 48px)",
                color: styles.title.color,
              }}
            >
              {title}
            </h2>
            <p
              className="mt-4 text-lg"
              style={{ color: styles.description.color }}
            >
              {description}
            </p>
            {button ?? (
              <button
                className="mt-8 rounded-lg px-10 py-4 text-base font-medium text-black transition hover:opacity-90"
                style={styles.buttonStyle}
              >
                {ctaLabel}
              </button>
            )}
          </>
        )}
      </div>
    </section>
  );
}
