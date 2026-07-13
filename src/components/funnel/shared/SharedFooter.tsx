"use client";

// ─── SharedFooter — Reusable footer for funnel templates ───
// Used by: Lumio, H612 (and future Horizon, Book-Claude)
// Not used by: Amish (has its own richer footer structure)
//
// Marked as a Client Component because the hover effect uses styled-jsx
// (`<style jsx>`), which is only legal inside Client Components. The footer
// takes serializable props (strings + a discriminated variant), so moving
// the whole component to the client boundary does not lose any server-only
// data — and keeps the Server tree that imports it free of styled-jsx.

export interface FooterLink {
  label: string;
  href: string;
}

interface SharedFooterProps {
  brand: string;
  links: FooterLink[];
  rightsReserved: string;
  /** Accent color for hover effects. Default: #fff. */
  accentColor?: string;
  /** Visual variant: "dark" (Lumio gradient), "bordered" (H612), "light" */
  variant?: "dark" | "bordered" | "light";
}

const VARIANT_STYLES: Record<string, { footer: React.CSSProperties; textColor: string; linkColor: string; linkHoverColor: string; mutedColor: string }> = {
  dark: {
    footer: { background: "linear-gradient(180deg, #181818, #0a0a0a)" },
    textColor: "#ffffff",
    linkColor: "#9ca3af",
    linkHoverColor: "#ffffff",
    mutedColor: "#4b5563",
  },
  bordered: {
    footer: { borderTop: "1px solid #353434" },
    textColor: "inherit",
    linkColor: "#8e9192",
    linkHoverColor: "#ffffff",
    mutedColor: "#444748",
  },
  light: {
    footer: { borderTop: "1px solid rgba(0,0,0,0.08)" },
    textColor: "#1B1B1B",
    linkColor: "#6b7280",
    linkHoverColor: "#1B1B1B",
    mutedColor: "#9ca3af",
  },
};

export function SharedFooter({
  brand,
  links,
  rightsReserved,
  variant = "bordered",
}: SharedFooterProps) {
  const styles = VARIANT_STYLES[variant] ?? VARIANT_STYLES.bordered;

  return (
    <footer className="py-10" style={styles.footer}>
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
          <span
            className="text-lg font-bold"
            style={{ color: styles.textColor }}
          >
            {brand}
          </span>
          <div className="flex gap-6 text-sm" style={{ color: styles.linkColor }}>
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="footer-link transition"
                style={{ color: styles.linkColor }}
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>
        <div
          className="mt-8 text-center text-xs"
          style={{ color: styles.mutedColor }}
        >
          © {new Date().getFullYear()} {brand}. {rightsReserved}
        </div>
      </div>
      <style jsx>{`
        .footer-link:hover {
          color: ${styles.linkHoverColor} !important;
        }
      `}</style>
    </footer>
  );
}
