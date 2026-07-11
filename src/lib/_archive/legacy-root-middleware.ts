/**
 * Middleware i18n — Locale Routing
 *
 * Determina il locale del visitatore e lo imposta come cookie.
 * Il cookie viene letto da layout.tsx per impostare la lingua HTML.
 *
 * Strategia di rilevamento:
 *   1. URL path (/{locale}/...)
 *   2. Cookie salvato (locale precedentemente scelto)
 *   3. Accept-Language header (browser)
 *   4. IP country (x-vercel-ip-country o cf-ipcountry)
 *   5. Fallback
 *
 * Nota: questo middleware NON fa redirect. Il locale viene solo
 *       impostato come cookie. La risoluzione finale è fatta
 *       dai server components tramite locale-resolver.ts.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Lista di tutti i 71 locale supportati (copiata da page.tsx)
const ALL_LOCALES = [
  "it-it", "en-us", "en-gb", "fr-fr", "de-de", "es-es", "pt-pt",
  "nl-nl", "pl-pl", "sv-se", "da-dk", "nb-no", "fi-fi", "ro-ro",
  "cs-cz", "hu-hu", "el-gr", "bg-bg", "hr-hr", "sk-sk", "sl-si",
  "lt-lt", "lv-lv", "et-ee", "de-at", "de-ch", "fr-ch", "it-ch",
  "nl-be", "fr-be", "en-ie", "en-ca", "fr-ca", "es-mx", "pt-br",
  "es-ar", "es-co", "es-cl", "es-pe", "en-au", "en-nz",
  "ja-jp", "ko-kr", "zh-cn", "zh-tw", "zh-hk", "hi-in", "en-in",
  "tr-tr", "th-th", "vi-vn", "id-id", "ms-my", "en-sg", "en-ph",
  "ur-pk", "bn-bd", "ar-ae", "ar-sa", "ar-eg", "he-il",
  "ta-in", "te-in", "mr-in", "en-za", "en-ng", "en-ke", "fr-ma",
  "ru-ru", "uk-ua", "ro-md",
];

const DEFAULT_LOCALE = "en-us";

// Mappa paese → locale completo
const COUNTRY_LOCALE: Record<string, string> = {
  IT: "it-it", VA: "it-it", SM: "it-it", CH: "de-ch",
  FR: "fr-fr", BE: "nl-be", LU: "fr-lu", MC: "fr-fr",
  DE: "de-de", AT: "de-at",
  ES: "es-es", MX: "es-mx", AR: "es-ar", CO: "es-co", CL: "es-cl", PE: "es-pe",
  PT: "pt-pt", BR: "pt-br",
  GB: "en-gb", IE: "en-ie", US: "en-us", CA: "en-ca", AU: "en-au", NZ: "en-nz",
  NL: "nl-nl",
  PL: "pl-pl",
  SE: "sv-se", DK: "da-dk", NO: "nb-no", FI: "fi-fi",
  JP: "ja-jp", KR: "ko-kr",
  CN: "zh-cn", TW: "zh-tw", HK: "zh-hk",
  RU: "ru-ru", UA: "uk-ua",
  TR: "tr-tr",
  TH: "th-th", VN: "vi-vn", ID: "id-id",
  IN: "en-in",
  AE: "ar-ae", SA: "ar-sa", EG: "ar-eg",
  IL: "he-il",
  PK: "ur-pk", BD: "bn-bd",
  ZA: "en-za",
};

// Mappa lingua a 2 lettere → locale preferito
const LANG_TO_LOCALE: Record<string, string> = {
  it: "it-it",
  en: "en-us",
  fr: "fr-fr",
  de: "de-de",
  es: "es-es",
  pt: "pt-pt",
  nl: "nl-nl",
  pl: "pl-pl",
  sv: "sv-se",
  da: "da-dk",
  nb: "nb-no",
  no: "nb-no",
  fi: "fi-fi",
  ro: "ro-ro",
  cs: "cs-cz",
  hu: "hu-hu",
  el: "el-gr",
  bg: "bg-bg",
  hr: "hr-hr",
  sk: "sk-sk",
  sl: "sl-si",
  lt: "lt-lt",
  lv: "lv-lv",
  et: "et-ee",
  ja: "ja-jp",
  ko: "ko-kr",
  zh: "zh-cn",
  hi: "hi-in",
  tr: "tr-tr",
  th: "th-th",
  vi: "vi-vn",
  id: "id-id",
  ms: "ms-my",
  ur: "ur-pk",
  bn: "bn-bd",
  ar: "ar-ae",
  he: "he-il",
  ru: "ru-ru",
  uk: "uk-ua",
};

function isKnownLocale(code: string): boolean {
  return ALL_LOCALES.includes(code.toLowerCase());
}

function normalizeLocale(code: string): string {
  const parts = code.replace("_", "-").split("-");
  if (parts.length >= 2) {
    return `${parts[0].toLowerCase()}-${parts[1].toLowerCase()}`;
  }
  return parts[0].toLowerCase();
}

function detectLocale(params: {
  pathLocale?: string | null;
  cookieLocale?: string | null;
  acceptLanguage?: string | null;
  ipCountry?: string | null;
}): { locale: string; reason: string } {
  const { pathLocale, cookieLocale, acceptLanguage, ipCountry } = params;

  // 1. URL esplicita
  if (pathLocale) {
    const normalized = normalizeLocale(pathLocale);
    if (isKnownLocale(normalized)) {
      return { locale: normalized, reason: "url" };
    }
    // Prova lingua a 2 lettere
    const mapped = LANG_TO_LOCALE[normalized];
    if (mapped) return { locale: mapped, reason: "url" };
  }

  // 2. Cookie salvato
  if (cookieLocale) {
    const normalized = normalizeLocale(cookieLocale);
    if (isKnownLocale(normalized)) {
      return { locale: normalized, reason: "cookie" };
    }
    // Prova lingua a 2 lettere
    const mapped = LANG_TO_LOCALE[normalized];
    if (mapped) return { locale: mapped, reason: "cookie" };
  }

  // 3. IP country
  if (ipCountry) {
    const countryLocale = COUNTRY_LOCALE[ipCountry.toUpperCase()];
    if (countryLocale) {
      return { locale: countryLocale, reason: "ip" };
    }
  }

  // 4. Browser language (Accept-Language)
  if (acceptLanguage) {
    const parsed = acceptLanguage.split(",")
      .map((part) => {
        const [locale, q] = part.split(";");
        const quality = q ? parseFloat(q.split("=")[1]) : 1;
        return { locale: normalizeLocale(locale?.trim() ?? ""), quality };
      })
      .filter((l) => l.locale.length >= 2)
      .sort((a, b) => b.quality - a.quality);

    for (const { locale } of parsed) {
      if (isKnownLocale(locale)) {
        return { locale, reason: "browser" };
      }
      const lang = locale.split("-")[0]?.toLowerCase();
      if (lang && LANG_TO_LOCALE[lang]) {
        return { locale: LANG_TO_LOCALE[lang], reason: "browser" };
      }
    }
  }

  // 5. Fallback
  return { locale: DEFAULT_LOCALE, reason: "fallback" };
}

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Salta asset statici e API routes
  if (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/icon-") ||
    pathname.startsWith("/sw.js") ||
    pathname.startsWith("/manifest.json") ||
    pathname.startsWith("/courses/") ||
    pathname.match(/\.(png|jpg|jpeg|gif|svg|webp|ico|css|js|woff2?|txt)$/)
  ) {
    return NextResponse.next();
  }

  try {
    // Estrai parametri per la risoluzione
    const cookieLocale = request.cookies.get("locale")?.value;
    const acceptLanguage = request.headers.get("accept-language");
    const ipCountry = request.headers.get("x-vercel-ip-country") ?? request.headers.get("cf-ipcountry");

    let pathLocale: string | null = null;
    const match = pathname.match(/^\/([a-z]{2}(-[a-z]{2})?)\//);
    if (match) {
      pathLocale = match[1];
    }

    const result = detectLocale({
      pathLocale,
      cookieLocale,
      acceptLanguage,
      ipCountry,
    });

    // Crea la risposta
    const response = NextResponse.next();

    // Imposta il cookie locale se non esiste o se è diverso
    if (!cookieLocale || cookieLocale !== result.locale) {
      response.cookies.set("locale", result.locale, {
        maxAge: 60 * 60 * 24 * 365, // 1 anno
        path: "/",
        sameSite: "lax",
      });
    }

    // Aggiungi header per debug
    response.headers.set("x-locale", result.locale);
    response.headers.set("x-locale-reason", result.reason);

    return response;
  } catch {
    // In caso di errore, prosegui senza modifiche
    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    // Skip API routes, static files, and Next.js internals
    "/((?!api/|_next/|favicon|icon-|sw.js|manifest.json|courses/|.*\\.[a-zA-Z0-9]+$).*)",
  ],
};
