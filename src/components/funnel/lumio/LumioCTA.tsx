// ─── LumioCTA — Dark pricing/CTA section ───────────────────

import type { LumioLocaleContent, LumioT } from "./types";

interface LumioCTAProps {
  data: {
    cta?: string;
    prezzo?: string;
  };
  lc?: LumioLocaleContent;
  t: LumioT;
}

export function LumioCTA({ data, lc, t }: LumioCTAProps) {
  return (
    <section id="pricing" className="py-20">
      <div className="mx-auto max-w-3xl px-6 text-center">
        <div
          className="rounded-[40px] p-12"
          style={{ background: "#1B1B1B" }}
        >
          <h2 className="text-3xl font-bold text-white">
            {data.cta ||
              lc?.hero?.cta ||
              t("start_today", "Inizia Oggi")}
          </h2>
          <p className="mt-4 text-lg text-gray-400">
            {data.prezzo
              ? `Prezzo: ${data.prezzo}`
              : lc?.hero?.price_label ||
                t("price_special", "Prezzo speciale di lancio")}
          </p>
          <button
            className="mt-8 rounded-full px-10 py-4 text-base font-semibold text-white transition hover:-translate-y-0.5"
            style={{
              background: "linear-gradient(135deg, #FF416C, #FF4B2B)",
              boxShadow: "0 4px 20px rgba(255,65,108,0.4)",
            }}
          >
            {data.cta ||
              lc?.hero?.cta ||
              t("buy_now", "Acquista Ora")}
          </button>
        </div>
      </div>
    </section>
  );
}
