// ─── LumioTrustStrip — Marquee company logos ───────────────

import type { LumioLocaleContent, LumioT } from "./types";

interface LumioTrustStripProps {
  lc?: LumioLocaleContent;
  t: LumioT;
}

export function LumioTrustStrip({ lc, t }: LumioTrustStripProps) {
  return (
    <section className="py-12 overflow-hidden">
      <p
        className="mb-6 text-center text-xs font-semibold uppercase tracking-widest"
        style={{ color: "#8C8880" }}
      >
        {lc?.trust?.title || t("trusted_by", "Trusted by teams worldwide")}
      </p>
      <div className="flex gap-16 animate-[marquee_20s_linear_infinite] whitespace-nowrap">
        {(lc?.trust?.company_names?.length
          ? lc.trust.company_names
          : [
              "Brand Alpha",
              "TechCorp",
              "Studio Pro",
              "Creative Inc",
              "Digital Labs",
              "Brand Alpha",
              "TechCorp",
              "Studio Pro",
            ]
        ).map((name, i) => (
          <span
            key={i}
            className="text-lg font-bold opacity-30"
            style={{ color: "#1B1B1B" }}
          >
            {name}
          </span>
        ))}
      </div>
    </section>
  );
}
