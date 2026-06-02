"use client";

import { Globe } from "lucide-react";

interface CurrencyPrice {
  price: number;
  lemonVariantId?: string | null;
  stripePriceId?: string | null;
}

type PricesByCurrency = Record<string, CurrencyPrice>;

export function CurrencyPricesSection({
  pricesByCurrency,
  onChange,
  showOptionalLabel = false,
}: {
  pricesByCurrency: PricesByCurrency;
  onChange: (val: PricesByCurrency) => void;
  showOptionalLabel?: boolean;
}) {
  const currencies = [
    { code: "EUR", label: "EUR (€)" },
    { code: "USD", label: "USD ($)" },
    { code: "GBP", label: "GBP (£)" },
  ];

  type CurrencyField = keyof CurrencyPrice;

  const setCurrency = (code: string, field: CurrencyField, value: string | number | null) => {
    const updated = { ...pricesByCurrency };
    if (!updated[code]) {
      updated[code] = { price: 0 };
    }
    if (field === "price") {
      updated[code].price = value as number;
    } else if (field === "lemonVariantId") {
      updated[code].lemonVariantId = value as string | null;
    } else if (field === "stripePriceId") {
      updated[code].stripePriceId = value as string | null;
    }
    onChange(updated);
  };

  return (
    <div className="pt-4 border-t border-white/5 mt-4">
      <label className="block text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-4 flex items-center gap-2">
        <Globe className="w-3 h-3" />
        Prezzi per Valuta{showOptionalLabel ? " (opzionale)" : ""}
      </label>
      <div className="space-y-4">
        {currencies.map((c) => (
          <div key={c.code} className="bg-zinc-900/30 p-4 rounded-2xl border border-zinc-800/50">
            <div className="font-bold text-white text-sm mb-3">{c.label}</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[9px] text-zinc-600 font-bold uppercase tracking-wider mb-1 block">Prezzo (cent.)</label>
                <input
                  type="number"
                  value={pricesByCurrency[c.code]?.price || 0}
                  onChange={(e) => setCurrency(c.code, "price", parseInt(e.target.value) || 0)}
                  placeholder="4900"
                  className="bg-zinc-800/50 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white w-full"
                />
              </div>
              <div>
                <label className="text-[9px] text-zinc-600 font-bold uppercase tracking-wider mb-1 block">Lemon Variant ID</label>
                <input
                  type="text"
                  value={pricesByCurrency[c.code]?.lemonVariantId ?? ""}
                  onChange={(e) => setCurrency(c.code, "lemonVariantId", e.target.value || null)}
                  placeholder="opzionale"
                  className="bg-zinc-800/50 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white w-full"
                />
              </div>
              <div>
                <label className="text-[9px] text-zinc-600 font-bold uppercase tracking-wider mb-1 block">Stripe Price ID</label>
                <input
                  type="text"
                  value={pricesByCurrency[c.code]?.stripePriceId ?? ""}
                  onChange={(e) => setCurrency(c.code, "stripePriceId", e.target.value || null)}
                  placeholder="opzionale"
                  className="bg-zinc-800/50 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white w-full"
                />
              </div>
            </div>
          </div>
        ))}
      </div>
      <p className="text-[9px] text-zinc-600 mt-3 font-medium">
        Se non impostati, verranno usati i valori predefiniti. La valuta del browser dell&apos;utente verrà rilevata automaticamente.
      </p>
    </div>
  );
}
