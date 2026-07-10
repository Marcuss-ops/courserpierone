// ─── LumioHero — Hero section with title, subtitle, CTAs ───

import type { LumioLocaleContent, LumioT } from "./types";

interface LumioHeroProps {
  data: {
    titolo?: string;
    sottotitolo?: string;
    cta?: string;
  };
  lc?: LumioLocaleContent;
  t: LumioT;
}

export function LumioHero({ data, lc, t }: LumioHeroProps) {
  return (
    <section className="flex min-h-[90vh] flex-col items-center justify-center px-6 pt-24 text-center">
      <h1
        className="max-w-4xl font-bold"
        style={{
          fontSize: "clamp(40px, 6vw, 82px)",
          lineHeight: 1.05,
          letterSpacing: "-0.04em",
          color: "#1B1B1B",
          textWrap: "balance",
        }}
      >
        {data.titolo ?? "Titolo del tuo prodotto"}
      </h1>
      <p
        className="mt-6 max-w-2xl text-lg"
        style={{ color: "#8C8880", lineHeight: 1.6 }}
      >
        {data.sottotitolo ??
          "Sottotitolo che descrive il valore del prodotto in modo chiaro e diretto."}
      </p>
      <div className="mt-8 flex gap-4">
        <a
          href="#pricing"
          className="rounded-full px-8 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5"
          style={{
            background: "linear-gradient(135deg, #FF416C, #FF4B2B)",
            boxShadow: "0 4px 20px rgba(255,65,108,0.3)",
          }}
        >
          {data.cta || lc?.hero?.cta || t("buy_now", "Acquista Ora")}
        </a>
        <a
          href="#features"
          className="rounded-full border px-8 py-3 text-sm font-semibold transition hover:bg-black/5"
          style={{ borderColor: "#D9D7D0", color: "#1B1B1B" }}
        >
          {lc?.hero?.secondary_cta || t("learn_more", "Scopri di Più")}
        </a>
      </div>
    </section>
  );
}
