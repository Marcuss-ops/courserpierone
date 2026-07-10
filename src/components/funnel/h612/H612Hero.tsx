// ─── H612Hero — Hero section with title, subtitle, CTAs ───

import type { H612LocaleContent, H612T } from "./types";

interface H612HeroProps {
  data: { titolo?: string; sottotitolo?: string; cta?: string };
  lc?: H612LocaleContent;
  t: H612T;
}

export function H612Hero({ data, lc, t }: H612HeroProps) {
  return (
    <section className="flex min-h-[80vh] flex-col justify-center px-6 pt-24">
      <div className="mx-auto max-w-4xl">
        <h1
          className="font-normal"
          style={{
            fontFamily: "'Noto Serif', serif",
            fontSize: "clamp(36px, 5vw, 72px)",
            lineHeight: 1.1,
            letterSpacing: "-0.02em",
          }}
        >
          {data.titolo ?? "Titolo del Prodotto"}
        </h1>
        <p
          className="mt-6 max-w-2xl text-lg"
          style={{
            color: "#c7c6c6",
            fontFamily: "'Manrope', sans-serif",
          }}
        >
          {data.sottotitolo ??
            "Sottotitolo che introduce il valore del prodotto in modo elegante e diretto."}
        </p>
        <div className="mt-8 flex gap-4">
          <a
            href="#pricing"
            className="rounded-lg px-8 py-3 text-sm font-medium text-black transition hover:opacity-90"
            style={{ background: "#ffffff" }}
          >
            {data.cta ||
              lc?.hero?.cta ||
              t("start_today", "Inizia Ora")}
          </a>
          <a
            href="#features"
            className="rounded-lg border px-8 py-3 text-sm font-medium text-white transition hover:bg-white/5"
            style={{ borderColor: "#444748" }}
          >
            {lc?.nav?.learn_more || "Scopri di Più"}
          </a>
        </div>
      </div>
    </section>
  );
}
