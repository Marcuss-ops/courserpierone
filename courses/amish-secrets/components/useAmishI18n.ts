// ─── Amish i18n helpers ───────────────────────────────────
// Extracted from template-amish.tsx: t(), localizeCurrency(),
// and PRODUCT_TITLE resolution.

import { getFallbackLabel } from "./amish-fallbacks";

const SUFFIX_CURRENCIES = new Set([
  "RUB", "₽", "PLN", "zł", "SEK", "NOK", "DKK", "kr",
]);

export function createAmishT(
  uiLabels: Record<string, string>,
  locale: string,
): (key: string) => string {
  return (key: string): string => {
    const langKey = locale.split("-")[0]?.toLowerCase() || "en";
    let val = uiLabels[key] ?? "";
    if (!val) {
      val = getFallbackLabel(langKey, key);
    }
    return val;
  };
}

export function createLocalizeCurrency(
  baseAmount: number,
  currentAmount: number,
  currencySymbol: string,
  currency: string,
): (val: string) => string {
  return (val: string): string => {
    if (!val) return "";
    const ratio = baseAmount > 0 ? currentAmount / baseAmount : 1;
    return val.replace(
      /(?:[€$£¥₽]|[A-Z]{3})\s*(\d+(?:[.,]\d+)?)|(\d+(?:[.,]\d+)?)\s*(?:[€$£¥₽]|[A-Z]{3})/g,
      (_match, p1, p2) => {
        const rawVal = p1 || p2;
        if (!rawVal) return _match;
        const parsedVal = parseFloat(rawVal.replace(",", "."));
        if (isNaN(parsedVal)) return _match;
        const converted = Math.round(parsedVal * ratio);
        const isSuffix =
          SUFFIX_CURRENCIES.has(currency) ||
          _match.trim().endsWith(_match.replace(/[\d\s.,]/g, ""));
        return isSuffix
          ? `${converted} ${currencySymbol}`
          : `${currencySymbol}${converted}`;
      },
    );
  };
}

export function resolveProductTitle(
  locale: string,
  languages?: Record<string, { title: string }>,
  fallbackTitle?: string,
): string {
  const lang = (locale ?? "en").split("-")[0];
  const LOCALE_TITLE_MAP: Record<string, string> = {};
  if (languages) {
    for (const [localeKey, localeData] of Object.entries(languages)) {
      if (localeData?.title) LOCALE_TITLE_MAP[localeKey] = localeData.title;
    }
  }
  return (
    LOCALE_TITLE_MAP[lang] ??
    LOCALE_TITLE_MAP.en ??
    fallbackTitle ??
    ""
  );
}

export function resolveAmishUiLabels(
  uiLabels?: Record<string, string>,
  localeUiLabels?: Record<string, string>,
): Record<string, string> {
  return {
    ...(uiLabels ?? {}),
    ...(localeUiLabels ?? {}),
  };
}
