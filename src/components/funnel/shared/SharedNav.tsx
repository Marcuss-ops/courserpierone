// ─── SharedNav — Reusable floating/bar navigation ──────────
// Used by: Lumio ("pill-dark"), Horizon ("pill-light"), H612 ("bar-dark").
// All share: brand + links + CTA button structure.

interface NavLink {
  label: string;
  href: string;
}

interface SharedNavProps {
  brand: string;
  links: NavLink[];
  ctaLabel: string;
  variant: "pill-dark" | "pill-light" | "bar-dark";
}

const VARIANT_STYLES = {
  "pill-dark": {
    nav: "fixed left-1/2 top-4 z-50 -translate-x-1/2",
    container: {
      background: "#1B1B1B",
      backdropFilter: "blur(20px)",
      boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
      borderRadius: "9999px",
    } as React.CSSProperties,
    brand: { color: "#ffffff", fontWeight: 600, fontSize: "14px" } as React.CSSProperties,
    link: "text-sm text-gray-400 hover:text-white transition",
    linkColor: undefined as React.CSSProperties | undefined,
    linkContainer: "hidden items-center gap-6 text-sm md:flex",
    cta: {
      background: "linear-gradient(135deg, #FF416C, #FF4B2B)",
      borderRadius: "9999px",
      color: "#ffffff",
      fontWeight: 500,
    } as React.CSSProperties,
    ctaHover: "hover:opacity-90",
  },
  "pill-light": {
    nav: "fixed left-1/2 top-4 z-50 -translate-x-1/2",
    container: {
      background: "rgba(255,255,255,0.4)",
      backdropFilter: "blur(20px)",
      border: "1px solid rgba(255,255,255,0.6)",
      boxShadow: "0 4px 30px rgba(0,0,0,0.06)",
      borderRadius: "16px",
    } as React.CSSProperties,
    brand: { color: "#1d1c15", fontWeight: 700, fontSize: "14px" } as React.CSSProperties,
    link: "text-sm hover:text-black transition",
    linkColor: { color: "#555555" } as React.CSSProperties,
    linkContainer: "hidden items-center gap-6 text-sm md:flex",
    cta: {
      background: "#FF5E3A",
      borderRadius: "12px",
      color: "#ffffff",
      fontWeight: 600,
    } as React.CSSProperties,
    ctaHover: "hover:opacity-90",
  },
  "bar-dark": {
    nav: "fixed left-0 right-0 top-0 z-50 border-b",
    container: {
      background: "rgba(20,19,19,0.8)",
      backdropFilter: "blur(20px)",
      borderColor: "#353434",
    } as React.CSSProperties,
    brand: { color: "#ffffff", fontWeight: 600, fontSize: "18px" } as React.CSSProperties,
    link: "text-sm text-gray-400 hover:text-white transition",
    linkColor: undefined as React.CSSProperties | undefined,
    linkContainer: "flex items-center gap-6",
    cta: {
      background: "transparent",
      border: "1px solid #444748",
      borderRadius: "9999px",
      color: "#ffffff",
      fontWeight: 500,
    } as React.CSSProperties,
    ctaHover: "hover:bg-white/10",
  },
};

export function SharedNav({
  brand,
  links,
  ctaLabel,
  variant,
}: SharedNavProps) {
  const v = VARIANT_STYLES[variant];

  return (
    <nav className={v.nav}>
      <div
        className={`flex items-center gap-8 px-6 py-3${variant === "bar-dark" ? " mx-auto max-w-6xl justify-between" : ""}`}
        style={variant === "bar-dark" ? { ...v.container, borderBottomWidth: "1px" } : v.container}
      >
        <span className="text-sm" style={{ ...v.brand, fontSize: v.brand.fontSize }}>
          {brand}
        </span>
        <div className={v.linkContainer}>
          {links.map((l) => (
            <a key={l.href} href={l.href} className={v.link} style={v.linkColor}>
              {l.label}
            </a>
          ))}
        </div>
        <button
          className={`px-4 py-1.5 text-sm transition ${v.ctaHover}`}
          style={v.cta}
        >
          {ctaLabel}
        </button>
      </div>
    </nav>
  );
}
