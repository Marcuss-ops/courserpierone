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

import type { PriceByLocale } from "@/lib/config/white-label-data";
import { getCurrencyFromLocale } from "@/lib/i18n/currency-map";

// ─── Country Override Interface ───────────────────────────
export interface CountryPriceOverride {
  currency: string;
  price: number;
  symbol: string;
  amount: number;
  lemonVariantId?: string | null;
}

/** Input shape for countryOverrides before parseCountryOverrides computes
 *  the derived fields. `amount` is excluded because it's computed from
 *  `price / 100` at parse time; `symbol` is excluded because it has a
 *  fallback to CURRENCY_SYMBOLS[currency] (or the currency code itself).
 *  The CourseConfig type uses this shape directly (no `amount` field —
 *  it's computed at display time). */
export interface CountryPriceOverrideInput {
  currency: string;
  price: number;
  symbol?: string;
  lemonVariantId?: string | null;
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
  overrides: unknown
): Record<string, CountryPriceOverride> | null {
  if (!overrides) return null;
  try {
    const parsed = typeof overrides === "string" ? JSON.parse(overrides) : overrides;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const result: Record<string, CountryPriceOverride> = {};
    for (const [code, val] of Object.entries(parsed)) {
      const v = val as CountryPriceOverrideInput;
      result[code] = {
        currency: v.currency,
        price: v.price,
        symbol: v.symbol || CURRENCY_SYMBOLS[v.currency] || v.currency,
        amount: v.price / 100,
        lemonVariantId: v.lemonVariantId ?? null,
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
  data: { countryOverrides?: unknown },
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
  data: { prices?: Record<string, PriceByLocale>; price?: number; countryOverrides?: unknown },
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
  const currency = getCurrencyFromLocale(locale.toLowerCase());

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
  data: { prices?: Record<string, PriceByLocale>; price?: number; countryOverrides?: unknown },
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
  const currencyCode = getCurrencyFromLocale(locale.toLowerCase());
  const priceConfig = data.prices?.[currencyCode] ?? data.prices?.default;
  const symbol = priceConfig?.symbol ?? "€";
  const currentAmount = priceConfig?.amount ?? baseAmount;

  return { currentAmount, symbol, currency: currencyCode, baseAmount };
}

/**
 * Helper per parsare pricesByCurrency JSON
 */
export function parsePricesByCurrency(
  raw: unknown,
): Record<string, { price: number; symbol?: string; lemonVariantId?: string | null }> | null {
  if (!raw) return null;
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

