// ─── HorizonPricing — Two-tier pricing cards (Free + Pro) ──

import type { HorizonLocaleContent } from "./types";

interface HorizonPricingProps {
  data: {
    cta?: string;
    prezzo?: string;
  };
  lc?: HorizonLocaleContent;
}

export function HorizonPricing({ data, lc }: HorizonPricingProps) {
  return (
    <section id="pricing" className="py-20">
      <div className="mx-auto max-w-4xl px-6">
        <div className="mb-12 text-center">
          <h2
            className="font-bold"
            style={{
              fontSize: "clamp(28px, 4vw, 40px)",
              color: "#1d1c15",
            }}
          >
            {lc?.nav?.pricing || lc?.ui?.labels?.pricing || "Pricing"}
          </h2>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          {/* Free tier */}
          <div
            className="rounded-3xl p-8"
            style={{
              background: "rgba(255,255,255,0.6)",
              backdropFilter: "blur(10px)",
              border: "1px solid rgba(255,255,255,0.8)",
            }}
          >
            <h3 className="text-lg font-bold" style={{ color: "#1d1c15" }}>
              {lc?.ui?.labels?.free_tier || "Free"}
            </h3>
            <p className="mt-2 text-sm" style={{ color: "#555555" }}>
              {lc?.ui?.labels?.free_title || "Per iniziare"}
            </p>
            <p
              className="mt-4 text-4xl font-extrabold"
              style={{ color: "#1d1c15" }}
            >
              $0
              <span className="text-sm font-normal" style={{ color: "#89726b" }}>
                {lc?.ui?.labels?.per_month || "/mo"}
              </span>
            </p>
            <ul
              className="mt-6 flex flex-col gap-3 text-sm"
              style={{ color: "#555555" }}
            >
              <li>✓ 1 Prodotto</li>
              <li>✓ 3 Lingue</li>
              <li>✓ Analytics base</li>
            </ul>
            <button
              className="mt-8 w-full rounded-xl border py-3 text-sm font-semibold transition hover:bg-black/5"
              style={{ borderColor: "#ddc0b8", color: "#1d1c15" }}
            >
              {lc?.ui?.labels?.start_free || "Inizia Gratis"}
            </button>
          </div>
          {/* Pro tier */}
          <div
            className="relative rounded-3xl p-8"
            style={{
              background: "#1d1c15",
              boxShadow: "0 8px 40px rgba(0,0,0,0.15)",
            }}
          >
            <span
              className="absolute right-4 top-4 rounded-full px-3 py-1 text-xs font-bold"
              style={{ background: "#FF5E3A", color: "white" }}
            >
              {lc?.ui?.labels?.popular || "Popular"}
            </span>
            <h3 className="text-lg font-bold text-white">
              {lc?.ui?.labels?.pro_tier || "Pro"}
            </h3>
            <p className="mt-2 text-sm text-gray-400">
              {lc?.ui?.labels?.pro_title || "Per crescere"}
            </p>
            <p className="mt-4 text-4xl font-extrabold text-white">
              {data.prezzo ?? "$20"}
              <span className="text-sm font-normal text-gray-400">
                {lc?.ui?.labels?.per_month || "/mo"}
              </span>
            </p>
            <ul className="mt-6 flex flex-col gap-3 text-sm text-gray-300">
              <li>✓ Prodotti illimitati</li>
              <li>✓ 20 Lingue</li>
              <li>✓ Traduzioni AI</li>
              <li>✓ Analytics avanzati</li>
              <li>✓ Stripe integrato</li>
            </ul>
            <button
              className="mt-8 w-full rounded-xl py-3 text-sm font-semibold text-white transition hover:opacity-90"
              style={{ background: "#FF5E3A" }}
            >
              {data.cta ||
                lc?.hero?.cta ||
                lc?.ui?.labels?.buy_now ||
                "Acquista Ora"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
