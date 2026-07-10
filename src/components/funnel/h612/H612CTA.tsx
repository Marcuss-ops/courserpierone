// ─── H612CTA — Pricing section with floating orbs ─────────

import type { H612LocaleContent, H612T } from "./types";

interface H612CTAProps {
  data: { cta?: string; prezzo?: string };
  lc?: H612LocaleContent;
  t: H612T;
}

export function H612CTA({ data, lc, t }: H612CTAProps) {
  return (
    <section id="pricing" className="relative overflow-hidden py-24">
      {/* Floating orbs */}
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
      <div className="relative z-10 mx-auto max-w-3xl px-6 text-center">
        <h2
          style={{
            fontFamily: "'Noto Serif', serif",
            fontSize: "clamp(28px, 4vw, 48px)",
          }}
        >
          {data.cta || lc?.hero?.cta || t("start_today", "Inizia Oggi")}
        </h2>
        <p className="mt-4 text-lg" style={{ color: "#c7c6c6" }}>
          {data.prezzo
            ? `${t("price", "Prezzo")}: ${data.prezzo}`
            : lc?.hero?.price_label ||
              t("price_special", "Offerta speciale di lancio")}
        </p>
        <button
          className="mt-8 rounded-lg px-10 py-4 text-base font-medium text-black transition hover:opacity-90"
          style={{ background: "#ffffff" }}
        >
          {data.cta ||
            lc?.hero?.cta ||
            t("buy_now", "Acquista Ora")}
        </button>
      </div>
    </section>
  );
}
