// ─── Currency Map — Single source of truth ─────────────────
// Mappa locale → codice valuta (es. "it-it" → "EUR")
//
// Fonte: LOCALE_CURRENCY in _generated/locale-data.ts (DB-generated)
//
// Usata da:
//   - src/lib/utils/pricing.ts (display prezzi)
//   - src/lib/i18n/locale-resolver.ts (re-export per API consumers)
//   - src/lib/services/pricing-service.ts (checkout pricing)
//   - src/app/api/checkout/route.ts (checkout API)

import { LOCALE_CURRENCY } from "./_generated/locale-data";
import { localeToLanguage } from "./locale-resolver";

/**
 * Returns the currency code (ISO 4217) for a given locale string.
 * Falls back to EUR for unknown locales.
 *
 * @example
 *   getCurrencyFromLocale("en-us")  // "USD"
 *   getCurrencyFromLocale("it-it")  // "EUR"
 *   getCurrencyFromLocale("ja-jp")  // "JPY"
 */
export function getCurrencyFromLocale(locale: string): string {
  const normalized = normalizeLocale(locale);
  return (
    LOCALE_CURRENCY[normalized] ??
    LOCALE_CURRENCY[localeToLanguage(normalized)] ??
    "EUR"
  );
}

// ─── Helpers (internal) ──────────────────────────────────

function normalizeLocale(code: string): string {
  const parts = code.replace("_", "-").split("-");
  if (parts.length >= 2) {
    return `${parts[0].toLowerCase()}-${parts[1].toLowerCase()}`;
  }
  return parts[0].toLowerCase();
}
