// ─── H612LogoRoll — Marquee trust logos ───────────────────

import type { H612LocaleContent } from "./types";

interface H612LogoRollProps {
  lc?: H612LocaleContent;
}

export function H612LogoRoll({ lc }: H612LogoRollProps) {
  return (
    <section
      className="overflow-hidden border-y py-10"
      style={{ borderColor: "#353434" }}
    >
      <div className="flex gap-20 animate-[marquee_25s_linear_infinite] whitespace-nowrap">
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
            className="text-xl font-bold opacity-20"
            style={{ fontFamily: "'Noto Serif', serif" }}
          >
            {name}
          </span>
        ))}
      </div>
    </section>
  );
}
