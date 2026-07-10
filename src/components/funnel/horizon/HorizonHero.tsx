// ─── HorizonHero — Hero with gradient, badge, title, CTAs ──

import type { HorizonLocaleContent } from "./types";

interface HorizonHeroProps {
  data: {
    titolo?: string;
    sottotitolo?: string;
    cta?: string;
  };
  lc?: HorizonLocaleContent;
}

export function HorizonHero({ data, lc }: HorizonHeroProps) {
  return (
    <section
      className="relative flex min-h-[90vh] flex-col items-center justify-center px-6 pt-24 text-center"
      style={{
        background:
          "linear-gradient(180deg, rgba(56,189,248,0.15) 0%, rgba(192,132,252,0.08) 50%, #ffffff 100%)",
      }}
    >
      <span
        className="mb-6 inline-block rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-wider"
        style={{ background: "#ffdbd0", color: "#FF5E3A" }}
      >
        {lc?.hero?.badge || "New"}
      </span>
      <h1
        className="max-w-4xl font-extrabold"
        style={{
          fontSize: "clamp(36px, 5vw, 64px)",
          lineHeight: 1.1,
          letterSpacing: "-0.04em",
          color: "#1d1c15",
        }}
      >
        {data.titolo ?? "Titolo del tuo prodotto"}
      </h1>
      <p
        className="mt-6 max-w-2xl text-lg"
        style={{ color: "#555555", lineHeight: 1.6 }}
      >
        {data.sottotitolo ??
          "Sottotitolo che descrive il valore del prodotto in modo chiaro."}
      </p>
      <div className="mt-8 flex gap-4">
        <a
          href="#pricing"
          className="rounded-xl px-8 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5"
          style={{
            background: "#FF5E3A",
            boxShadow: "0 4px 20px rgba(255,94,58,0.3)",
          }}
        >
          {data.cta || lc?.hero?.cta || "Acquista Ora"}
        </a>
        <a
          href="#features"
          className="rounded-xl border px-8 py-3 text-sm font-semibold transition hover:bg-black/5"
          style={{ borderColor: "#ddc0b8", color: "#1d1c15" }}
        >
          {lc?.nav?.learn_more || "Scopri di Più"}
        </a>
      </div>
    </section>
  );
}
