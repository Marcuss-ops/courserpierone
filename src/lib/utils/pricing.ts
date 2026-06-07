/**
 * Pricing Helpers — Funzioni condivise per prezzo dinamico
 *
 * Centralizza la logica di:
 * - Country-specific price overrides
 * - Currency-based price selection
 * - Display price formatting
 *
 * Usato da: page.tsx (landing), checkout/route.ts, components
 */

import type { CourseConfig, PriceByLocale } from "@/lib/config/white-label-data";

// ─── Country Override Interface ───────────────────────────
export interface CountryPriceOverride {
  currency: string;
  price: number;
  symbol: string;
  amount: number;
  lemonVariantId?: string | null;
  stripePriceId?: string | null;
}

// ─── Currency symbols mapping ─────────────────────────────
const CURRENCY_SYMBOLS: Record<string, string> = {
  EUR: "€", USD: "$", GBP: "£", JPY: "¥", BRL: "R$",
  CAD: "CA$", AUD: "A$", CHF: "CHF", SEK: "kr", NOK: "kr",
  DKK: "kr", PLN: "zł", MXN: "MX$", INR: "₹", CNY: "¥",
  KRW: "₩", RUB: "₽", TRY: "₺", ZAR: "R", SGD: "S$",
  HKD: "HK$", TWD: "NT$", AED: "د.إ", SAR: "﷼",
  THB: "฿", IDR: "Rp", MYR: "RM", PHP: "₱", VND: "₫",
  UAH: "₴", CZK: "Kč", HUF: "Ft", RON: "lei", ILS: "₪",
};

/**
 * Valuta un oggetto countryOverrides (può essere string JSON o oggetto già parsato)
 */
export function parseCountryOverrides(
  overrides: string | Record<string, any> | null | undefined
): Record<string, CountryPriceOverride> | null {
  if (!overrides) return null;
  try {
    const parsed = typeof overrides === "string" ? JSON.parse(overrides) : overrides;
    const result: Record<string, CountryPriceOverride> = {};
    for (const [code, val] of Object.entries(parsed)) {
      const v = val as any;
      result[code] = {
        currency: v.currency,
        price: v.price,
        symbol: v.symbol || CURRENCY_SYMBOLS[v.currency] || v.currency,
        amount: v.price / 100,
        lemonVariantId: v.lemonVariantId ?? null,
        stripePriceId: v.stripePriceId ?? null,
      };
    }
    return result;
  } catch {
    return null;
  }
}

/**
 * Trova il prezzo specifico per un paese (se presente negli overrides)
 */
export function getCountryPriceOverride(
  data: { countryOverrides?: Record<string, any> | string | null },
  country: string | null | undefined
): CountryPriceOverride | null {
  if (!country || !data.countryOverrides) return null;
  const overrides = parseCountryOverrides(data.countryOverrides);
  if (!overrides) return null;
  const override = overrides[country.toUpperCase()];
  if (!override) return null;
  return override;
}

/**
 * Ottiene il prezzo e la valuta giusti per un locale + paese
 */
export function getPriceString(
  data: { prices?: Record<string, PriceByLocale>; price?: number; countryOverrides?: any },
  locale: string,
  country?: string | null
): { price: string; currency: string } {
  // 1. Country-specific override
  if (country) {
    const countryPrice = getCountryPriceOverride(data, country);
    if (countryPrice) {
      return { price: `${countryPrice.symbol}${countryPrice.amount}`, currency: countryPrice.currency };
    }
  }

  // 2. Derive currency from locale
  const currency = getCurrencyFromLocaleCode(locale);

  // 3. Look up price by currency code
  const priceConfig = data.prices?.[currency] ?? data?.prices?.default;
  if (priceConfig) {
    return { price: `${priceConfig.symbol}${priceConfig.amount}`, currency };
  }

  // 4. Fallback
  return { price: `€${data.price ?? 0}`, currency: "EUR" };
}

/**
 * Ottiene l'importo corrente e il simbolo per un dato locale/paese
 */
export function getCurrentAmountAndSymbol(
  data: { prices?: Record<string, PriceByLocale>; price?: number; countryOverrides?: any },
  locale: string,
  country?: string | null
): { currentAmount: number; symbol: string; currency: string; baseAmount: number } {
  const baseAmount = data.price ?? 19;

  // Country override: usa i dati parsati direttamente
  if (country) {
    const countryPrice = getCountryPriceOverride(data, country);
    if (countryPrice) {
      return { currentAmount: countryPrice.amount, symbol: countryPrice.symbol, currency: countryPrice.currency, baseAmount };
    }
  }

  // Locale-based lookup
  const currencyCode = getCurrencyFromLocaleCode(locale);
  const priceConfig = data.prices?.[currencyCode] ?? data.prices?.default;
  const symbol = priceConfig?.symbol ?? "€";
  const currentAmount = priceConfig?.amount ?? baseAmount;

  return { currentAmount, symbol, currency: currencyCode, baseAmount };
}

/**
 * Mappa locale → codice valuta (es. "pt-br" → "BRL", "ja-jp" → "JPY")
 */
function getCurrencyFromLocaleCode(locale: string): string {
  const localeCurrencyMap: Record<string, string> = {
    "it-it": "EUR", "it": "EUR",
    "en": "USD", "en-us": "USD", "en-gb": "GBP", "en-ca": "CAD", "en-au": "AUD", "en-nz": "NZD", "en-ie": "EUR",
    "fr-fr": "EUR", "fr-ch": "CHF", "fr-ca": "CAD",
    "de-de": "EUR", "de-at": "EUR", "de-ch": "CHF",
    "es-es": "EUR", "es-mx": "MXN", "es-ar": "ARS", "es-co": "COP", "es-cl": "CLP", "es-pe": "PEN",
    "pt-pt": "EUR", "pt-br": "BRL",
    "nl-nl": "EUR", "nl-be": "EUR",
    "ja-jp": "JPY", "ko-kr": "KRW",
    "zh-cn": "CNY", "zh-tw": "TWD", "zh-hk": "HKD",
    "ru-ru": "RUB", "uk-ua": "UAH",
    "tr-tr": "TRY",
    "th-th": "THB", "vi-vn": "VND", "id-id": "IDR",
    "in-in": "INR", "hi-in": "INR",
    "ar-ae": "AED", "ar-sa": "SAR", "ar-eg": "EGP",
    "he-il": "ILS",
    "pl-pl": "PLN", "sv-se": "SEK", "da-dk": "DKK", "nb-no": "NOK", "fi-fi": "EUR",
    "cs-cz": "CZK", "hu-hu": "HUF", "ro-ro": "RON",
    "bg-bg": "BGN", "hr-hr": "EUR",
  };
  const normalized = locale.toLowerCase();
  return localeCurrencyMap[normalized] ?? localeCurrencyMap[normalized.split("-")[0]] ?? "EUR";
}

/**
 * Helper per parsare pricesByCurrency JSON
 */
export function parsePricesByCurrency(raw: string | null | undefined): Record<string, { price: number; symbol?: string; stripePriceId?: string | null; lemonVariantId?: string | null }> | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Helper: formato prezzo per currency
 */
export function formatPrice(amount: number, symbol: string): string {
  return `${symbol}${(amount / 100).toFixed(0)}`;
}
