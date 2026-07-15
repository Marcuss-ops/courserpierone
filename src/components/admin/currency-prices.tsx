"use client";

import { Globe, MapPin } from "lucide-react";

interface CurrencyPrice {
  price: number;
  lemonVariantId?: string | null;
}

type PricesByCurrency = Record<string, CurrencyPrice>;

interface CountryOverride {
  currency: string;
  price: number;
  symbol?: string;
  lemonVariantId?: string | null;
}

type CountryOverrides = Record<string, CountryOverride>;

export function CurrencyPricesSection({
  pricesByCurrency,
  onChange,
  countryOverrides,
  onCountryOverridesChange,
  showOptionalLabel = false,
}: {
  pricesByCurrency: PricesByCurrency;
  onChange: (val: PricesByCurrency) => void;
  countryOverrides?: CountryOverrides;
  onCountryOverridesChange?: (val: CountryOverrides) => void;
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
    }
    onChange(updated);
  };

  const countries = [
    { code: "BR", label: "Brasile (BR)", currency: "BRL" },
    { code: "IN", label: "India (IN)", currency: "INR" },
    { code: "MX", label: "Messico (MX)", currency: "MXN" },
    { code: "AR", label: "Argentina (AR)", currency: "ARS" },
    { code: "TR", label: "Turchia (TR)", currency: "TRY" },
    { code: "RU", label: "Russia (RU)", currency: "RUB" },
    { code: "JP", label: "Giappone (JP)", currency: "JPY" },
  ];

  const defaultOverrides = countryOverrides ?? {};

  const setCountryOverride = (countryCode: string, field: keyof CountryOverride, value: string | number | null) => {
    const updated = { ...defaultOverrides };
    if (!updated[countryCode]) {
      updated[countryCode] = { currency: "", price: 0 };
    }
    if (field === "price") {
      updated[countryCode].price = value as number;
    } else if (field === "currency") {
      updated[countryCode].currency = value as string;
    } else if (field === "symbol") {
      updated[countryCode].symbol = value as string | undefined;
    } else if (field === "lemonVariantId") {
      updated[countryCode].lemonVariantId = value as string | null;
    }
    onCountryOverridesChange?.(updated);
  };

  const removeCountryOverride = (countryCode: string) => {
    const updated = { ...defaultOverrides };
    delete updated[countryCode];
    onCountryOverridesChange?.(updated);
  };

  return (
    <div className="pt-4 border-t border-white/5 mt-4 space-y-8">
      {/* Prezzi per Valuta */}
      <div>
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
              </div>
            </div>
          ))}
        </div>
        <p className="text-[9px] text-zinc-600 mt-3 font-medium">
          Se non impostati, verranno usati i valori predefiniti. La valuta del browser dell&apos;utente verrà rilevata automaticamente.
        </p>
      </div>

      {/* Prezzi per Paese (Country Overrides) */}
      {onCountryOverridesChange && (
        <div>
          <label className="block text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-4 flex items-center gap-2">
            <MapPin className="w-3 h-3" />
            Prezzi Specifici per Paese
          </label>
          <p className="text-[9px] text-zinc-600 mb-3 font-medium">
            Sovrascrive il prezzo per utenti da paesi specifici. Utile per mercati emergenti (es. Brasile più economico).
          </p>
          <div className="space-y-3">
            {countries.map((c) => {
              const override = defaultOverrides[c.code];
              return (
                <div key={c.code} className="bg-zinc-900/30 p-4 rounded-2xl border border-zinc-800/50">
                  <div className="flex items-center justify-between mb-3">
                    <div className="font-bold text-white text-sm">{c.label}</div>
                    {override && (
                      <button
                        onClick={() => removeCountryOverride(c.code)}
                        className="text-[9px] text-zinc-600 hover:text-red-500 transition font-medium uppercase tracking-wider"
                      >
                        Rimuovi
                      </button>
                    )}
                  </div>
                  {override ? (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="text-[9px] text-zinc-600 font-bold uppercase tracking-wider mb-1 block">Valuta</label>
                        <input
                          type="text"
                          value={override.currency}
                          onChange={(e) => setCountryOverride(c.code, "currency", e.target.value)}
                          placeholder={c.currency}
                          className="bg-zinc-800/50 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white w-full"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] text-zinc-600 font-bold uppercase tracking-wider mb-1 block">Prezzo (cent.)</label>
                        <input
                          type="number"
                          value={override.price}
                          onChange={(e) => setCountryOverride(c.code, "price", parseInt(e.target.value) || 0)}
                          placeholder="9900"
                          className="bg-zinc-800/50 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white w-full"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] text-zinc-600 font-bold uppercase tracking-wider mb-1 block">Simbolo</label>
                        <input
                          type="text"
                          value={override.symbol ?? ""}
                          onChange={(e) => setCountryOverride(c.code, "symbol", e.target.value || null)}
                          placeholder="R$"
                          className="bg-zinc-800/50 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white w-full"
                        />
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setCountryOverride(c.code, "price", 0)}
                      className="text-xs text-zinc-500 hover:text-white transition font-medium"
                    >
                      + Aggiungi prezzo personalizzato per {c.code}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-[9px] text-zinc-600 mt-3 font-medium">
            Il paese dell&apos;utente viene rilevato dall&apos;header HTTP <code className="text-zinc-400">x-vercel-ip-country</code>. Il checkout userà il variant/price ID corrispondente alla valuta del paese, oppure quello specificato qui sotto.
          </p>
        </div>
      )}
    </div>
  );
}
