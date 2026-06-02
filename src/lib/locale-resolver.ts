/**
 * Locale Resolver
 *
 * Determina il miglior locale per un visitatore in base a:
 * 1. URL esplicita (/{locale}/...)
 * 2. Cookie salvato (locale scelto dall'utente)
 * 3. Canale YouTube di provenienza (da UTM/referrer)
 * 4. Lingua del browser (Accept-Language)
 * 5. Paese IP (x-vercel-ip-country)
 * 6. Fallback
 *
 * Il locale è un codice completo "lingua-paese" (es. fr-fr, pt-br, en-us).
 */

// ─── Locale database (in-memory per edge middleware) ──
// Sincronizzato con il DB. Per 100+ lingue, teniamo tutto qui
// per performance nel middleware edge.

export interface LocaleInfo {
  code: string;            // "fr-fr"
  languageCode: string;    // "fr"
  countryCode: string;     // "FR"
  name: string;            // "French (France)"
  nativeName: string;      // "Français (France)"
  fallbackLocale: string;  // "en-us"
  currency: string;        // "EUR"
}

// ─── Country → preferred locale ────────────────────
const COUNTRY_LOCALE: Record<string, string> = {
  // Europa
  IT: "it-it", FR: "fr-fr", DE: "de-de", ES: "es-es", PT: "pt-pt",
  GB: "en-gb", IE: "en-ie", NL: "nl-nl", BE: "nl-be",
  PL: "pl-pl", SE: "sv-se", DK: "da-dk", NO: "nb-no",
  FI: "fi-fi", RO: "ro-ro", CZ: "cs-cz", HU: "hu-hu",
  GR: "el-gr", AT: "de-at", CH: "de-ch",
  BG: "bg-bg", HR: "hr-hr", SK: "sk-sk", SI: "sl-si",
  LT: "lt-lt", LV: "lv-lv", EE: "et-ee",
  // Americas
  US: "en-us", CA: "en-ca", MX: "es-mx",
  BR: "pt-br", AR: "es-ar", CO: "es-co", CL: "es-cl",
  PE: "es-pe", EC: "es-ec", VE: "es-ve",
  // Asia
  JP: "ja-jp", KR: "ko-kr", CN: "zh-cn", TW: "zh-tw", HK: "zh-hk",
  IN: "hi-in", TR: "tr-tr", TH: "th-th", VN: "vi-vn",
  ID: "id-id", MY: "ms-my", PH: "en-ph", SG: "en-sg",
  PK: "ur-pk", BD: "bn-bd",
  // Middle East
  AE: "ar-ae", SA: "ar-sa", EG: "ar-eg", IL: "he-il",
  // Africa
  ZA: "en-za", NG: "en-ng", KE: "en-ke", MA: "fr-ma",
  // Oceania
  AU: "en-au", NZ: "en-nz",
  // Other
  RU: "ru-ru", UA: "uk-ua",
};

// ─── Language-to-default locale mapping ───────────
// When browser sends just "fr" without country
const LANG_TO_DEFAULT_LOCALE: Record<string, string> = {
  it: "it-it", en: "en-us", fr: "fr-fr", de: "de-de",
  es: "es-es", pt: "pt-pt", nl: "nl-nl", pl: "pl-pl",
  sv: "sv-se", da: "da-dk", nb: "nb-no", no: "nb-no",
  fi: "fi-fi", ro: "ro-ro", cs: "cs-cz", hu: "hu-hu",
  el: "el-gr", ja: "ja-jp", ko: "ko-kr", zh: "zh-cn",
  ar: "ar-sa", hi: "hi-in", tr: "tr-tr", th: "th-th",
  vi: "vi-vn", id: "id-id", ms: "ms-my", ru: "ru-ru",
  bg: "bg-bg", hr: "hr-hr", sk: "sk-sk", sl: "sl-si",
  uk: "uk-ua", he: "he-il", bn: "bn-bd", ur: "ur-pk",
};

export const DEFAULT_LOCALE = "en-us";

// ─── Language-to-default locale mapping (exported) ──
export { LANG_TO_DEFAULT_LOCALE };

// ─── Supportate locale codes list (generata) ───────
const ALL_LOCALES = new Set(Object.values(COUNTRY_LOCALE));
// Add language-only variants (fr, de, en...) for backward compat
for (const lang of Object.keys(LANG_TO_DEFAULT_LOCALE)) {
  ALL_LOCALES.add(lang);
}

export function isKnownLocale(code: string): boolean {
  return ALL_LOCALES.has(code.toLowerCase());
}

export function localeToLanguage(locale: string): string {
  return locale.split("-")[0]?.toLowerCase() ?? locale;
}

// ─── Normalize: "en-US" → "en-us", "FR_fr" → "fr-fr" ─
export function normalizeLocale(code: string): string {
  const parts = code.replace("_", "-").split("-");
  if (parts.length >= 2) {
    return `${parts[0].toLowerCase()}-${parts[1].toLowerCase()}`;
  }
  return parts[0].toLowerCase();
}

// ─── Map a 2-letter language code to preferred locale ─
export function langToLocale(lang: string): string {
  const normalized = lang.toLowerCase();
  // Direct match in COUNTRY_LOCALE (2-letter codes that ARE locales)
  if (isKnownLocale(normalized)) return normalized;
  // Map via language table
  return LANG_TO_DEFAULT_LOCALE[normalized] ?? DEFAULT_LOCALE;
}

// ─── Fallback chain resolver ─────────────────────
export function resolveFallback(locale: string, visited = new Set<string>()): string {
  if (visited.has(locale)) return DEFAULT_LOCALE;
  visited.add(locale);

  const normalized = normalizeLocale(locale);

  // Check if locale exists in our data
  if (isKnownLocale(normalized)) return normalized;

  // Try language-only fallback: "fr-ca" → "fr-fr"
  const lang = localeToLanguage(normalized);
  const langDefault = LANG_TO_DEFAULT_LOCALE[lang];
  if (langDefault && langDefault !== normalized) {
    return resolveFallback(langDefault, visited);
  }

  // Ultimate fallback
  return DEFAULT_LOCALE;
}

// ─── Parse Accept-Language header ────────────────
export function parseAcceptLanguage(header: string | null | undefined): string[] {
  if (!header) return [];
  return header
    .split(",")
    .map((part) => {
      const [locale, q] = part.split(";");
      const quality = q ? parseFloat(q.split("=")[1]) : 1;
      return { locale: normalizeLocale(locale?.trim() ?? ""), quality };
    })
    .filter((l) => l.locale.length >= 2)
    .sort((a, b) => b.quality - a.quality)
    .map((l) => l.locale);
}

// ─── YouTube channel tracking ───────────────────
// Canale → locale mapping (da popolare dal DB)
// Per ora inline — in futuro caricato da tabella YouTubeChannel
const YT_CHANNEL_LOCALE: Record<string, string> = {
  // Example: "youtube.com/@canale-francese": "fr-fr"
};

export function detectFromYouTubeChannel(referrer: string, utmSource: string): string | null {
  const source = (utmSource || referrer || "").toLowerCase();
  for (const [channel, locale] of Object.entries(YT_CHANNEL_LOCALE)) {
    if (source.includes(channel.replace("youtube.com/", ""))) {
      return locale;
    }
  }
  return null;
}

// ─── Main resolver ──────────────────────────────
export interface ResolveResult {
  selectedLocale: string;
  languageCode: string;
  country: string | null;
  reason: "url" | "cookie" | "youtube" | "browser" | "ip" | "fallback";
  isLocale: boolean; // true se è un locale completo (fr-fr), false se solo lingua (fr)
}

export function resolveLocale(params: {
  pathLocale?: string | null;     // from URL /{locale}/slug
  cookieLocale?: string | null;   // from cookie
  youtubeReferrer?: string;       // from UTM or referrer
  ytSource?: string;
  acceptLanguage?: string | null; // Accept-Language header
  ipCountry?: string | null;      // x-vercel-ip-country
}): ResolveResult {
  const { pathLocale, cookieLocale, acceptLanguage, ipCountry, youtubeReferrer, ytSource } = params;

  // 1. URL esplicita (vince sempre)
  if (pathLocale) {
    const normalized = normalizeLocale(pathLocale);
    const locale = resolveFallback(normalized);
    return {
      selectedLocale: locale,
      languageCode: localeToLanguage(locale),
      country: null,
      reason: "url",
      isLocale: locale.includes("-"),
    };
  }

  // 2. Cookie salvato
  if (cookieLocale) {
    const normalized = normalizeLocale(cookieLocale);
    if (isKnownLocale(normalized) || isKnownLocale(localeToLanguage(normalized))) {
      const locale = resolveFallback(normalized);
      return {
        selectedLocale: locale,
        languageCode: localeToLanguage(locale),
        country: null,
        reason: "cookie",
        isLocale: locale.includes("-"),
      };
    }
  }

  // 3. Canale YouTube (UTM source / referrer)
  const ytLocale = detectFromYouTubeChannel(youtubeReferrer ?? "", ytSource ?? "");
  if (ytLocale) {
    return {
      selectedLocale: ytLocale,
      languageCode: localeToLanguage(ytLocale),
      country: null,
      reason: "youtube",
      isLocale: ytLocale.includes("-"),
    };
  }

  // 4. Browser language (Accept-Language)
  const browserLocales = parseAcceptLanguage(acceptLanguage);
  for (const bl of browserLocales) {
    // Try full locale first (fr-fr), then language-only (fr)
    if (isKnownLocale(bl)) {
      return {
        selectedLocale: bl,
        languageCode: localeToLanguage(bl),
        country: null,
        reason: "browser",
        isLocale: bl.includes("-"),
      };
    }
    const lang = localeToLanguage(bl);
    if (isKnownLocale(lang)) {
      const locale = langToLocale(lang);
      return {
        selectedLocale: locale,
        languageCode: lang,
        country: null,
        reason: "browser",
        isLocale: locale.includes("-"),
      };
    }
  }

  // 5. IP country
  if (ipCountry) {
    const countryLocale = COUNTRY_LOCALE[ipCountry.toUpperCase()];
    if (countryLocale) {
      return {
        selectedLocale: countryLocale,
        languageCode: localeToLanguage(countryLocale),
        country: ipCountry.toUpperCase(),
        reason: "ip",
        isLocale: true,
      };
    }
  }

  // 6. Fallback
  return {
    selectedLocale: DEFAULT_LOCALE,
    languageCode: "en",
    country: ipCountry?.toUpperCase() ?? null,
    reason: "fallback",
    isLocale: true,
  };
}
