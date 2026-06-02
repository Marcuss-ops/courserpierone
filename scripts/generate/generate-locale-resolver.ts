#!/usr/bin/env tsx
/**
 * Genera src/lib/i18n/_generated/locale-data.ts dal database Prisma.
 *
 * Il DB (tabelle Locale + CountryLocaleRule) è la SINGOLA FONTE DI VERITÀ.
 * Questo script produce un file TypeScript con mappe hardcodate utilizzabili
 * dal middleware Edge (che non può accedere al DB).
 *
 * Uso:
 *   npx tsx scripts/generate/generate-locale-resolver.ts
 *
 * Oppure via npm:
 *   npm run generate:locales
 *
 * Se il DB non è disponibile (es. primo build in CI senza DB), lo script
 * usa i dati di fallback embedded (sincronizzati con scripts/db/seed-locales.ts).
 */

import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

// ─── Path di output ─────────────────────────────
const OUTPUT_DIR = path.join(__dirname, "..", "..", "src", "lib", "i18n", "_generated");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "locale-data.ts");

// ─── Logger helper ──────────────────────────────
function log(msg: string) {
  console.log(`  🔧 ${msg}`);
}

// ════════════════════════════════════════════════
// FALLBACK DATA — usato solo se il DB non è
// disponibile (sincronizzato con seed-locales.ts)
// ════════════════════════════════════════════════

interface LocaleSeed {
  code: string;
  languageCode: string;
  countryCode: string;
  name: string;
  nativeName: string;
  fallbackLocale: string;
  currency: string;
}

const FALLBACK_LOCALES: LocaleSeed[] = [
  // Europe
  { code: "it-it", languageCode: "it", countryCode: "IT", name: "Italian (Italy)", nativeName: "Italiano (Italia)", fallbackLocale: "en-us", currency: "EUR" },
  { code: "en-us", languageCode: "en", countryCode: "US", name: "English (United States)", nativeName: "English (US)", fallbackLocale: "en-us", currency: "USD" },
  { code: "en-gb", languageCode: "en", countryCode: "GB", name: "English (United Kingdom)", nativeName: "English (UK)", fallbackLocale: "en-us", currency: "GBP" },
  { code: "fr-fr", languageCode: "fr", countryCode: "FR", name: "French (France)", nativeName: "Français (France)", fallbackLocale: "en-us", currency: "EUR" },
  { code: "de-de", languageCode: "de", countryCode: "DE", name: "German (Germany)", nativeName: "Deutsch (Deutschland)", fallbackLocale: "en-us", currency: "EUR" },
  { code: "es-es", languageCode: "es", countryCode: "ES", name: "Spanish (Spain)", nativeName: "Español (España)", fallbackLocale: "en-us", currency: "EUR" },
  { code: "pt-pt", languageCode: "pt", countryCode: "PT", name: "Portuguese (Portugal)", nativeName: "Português (Portugal)", fallbackLocale: "en-us", currency: "EUR" },
  { code: "nl-nl", languageCode: "nl", countryCode: "NL", name: "Dutch (Netherlands)", nativeName: "Nederlands (Nederland)", fallbackLocale: "en-us", currency: "EUR" },
  { code: "pl-pl", languageCode: "pl", countryCode: "PL", name: "Polish (Poland)", nativeName: "Polski (Polska)", fallbackLocale: "en-us", currency: "PLN" },
  { code: "sv-se", languageCode: "sv", countryCode: "SE", name: "Swedish (Sweden)", nativeName: "Svenska (Sverige)", fallbackLocale: "en-us", currency: "SEK" },
  { code: "da-dk", languageCode: "da", countryCode: "DK", name: "Danish (Denmark)", nativeName: "Dansk (Danmark)", fallbackLocale: "en-us", currency: "DKK" },
  { code: "nb-no", languageCode: "nb", countryCode: "NO", name: "Norwegian Bokmål (Norway)", nativeName: "Norsk Bokmål (Norge)", fallbackLocale: "en-us", currency: "NOK" },
  // NOTE: "no" is the ISO 639-1 code for Norwegian (alias for nb).
  // The DB stores only "nb-no"; the generation script adds "no → nb-no"
  // to LANG_TO_DEFAULT_LOCALE during buildMaps() via hardcoded override.
  { code: "fi-fi", languageCode: "fi", countryCode: "FI", name: "Finnish (Finland)", nativeName: "Suomi (Suomi)", fallbackLocale: "en-us", currency: "EUR" },
  { code: "ro-ro", languageCode: "ro", countryCode: "RO", name: "Romanian (Romania)", nativeName: "Română (România)", fallbackLocale: "en-us", currency: "RON" },
  { code: "cs-cz", languageCode: "cs", countryCode: "CZ", name: "Czech (Czech Republic)", nativeName: "Čeština (Česká Republika)", fallbackLocale: "en-us", currency: "CZK" },
  { code: "hu-hu", languageCode: "hu", countryCode: "HU", name: "Hungarian (Hungary)", nativeName: "Magyar (Magyarország)", fallbackLocale: "en-us", currency: "HUF" },
  { code: "el-gr", languageCode: "el", countryCode: "GR", name: "Greek (Greece)", nativeName: "Ελληνικά (Ελλάδα)", fallbackLocale: "en-us", currency: "EUR" },
  { code: "bg-bg", languageCode: "bg", countryCode: "BG", name: "Bulgarian (Bulgaria)", nativeName: "Български (България)", fallbackLocale: "en-us", currency: "BGN" },
  { code: "hr-hr", languageCode: "hr", countryCode: "HR", name: "Croatian (Croatia)", nativeName: "Hrvatski (Hrvatska)", fallbackLocale: "en-us", currency: "EUR" },
  { code: "sk-sk", languageCode: "sk", countryCode: "SK", name: "Slovak (Slovakia)", nativeName: "Slovenčina (Slovensko)", fallbackLocale: "en-us", currency: "EUR" },
  { code: "sl-si", languageCode: "sl", countryCode: "SI", name: "Slovenian (Slovenia)", nativeName: "Slovenščina (Slovenija)", fallbackLocale: "en-us", currency: "EUR" },
  { code: "lt-lt", languageCode: "lt", countryCode: "LT", name: "Lithuanian (Lithuania)", nativeName: "Lietuvių (Lietuva)", fallbackLocale: "en-us", currency: "EUR" },
  { code: "lv-lv", languageCode: "lv", countryCode: "LV", name: "Latvian (Latvia)", nativeName: "Latviešu (Latvija)", fallbackLocale: "en-us", currency: "EUR" },
  { code: "et-ee", languageCode: "et", countryCode: "EE", name: "Estonian (Estonia)", nativeName: "Eesti (Eesti)", fallbackLocale: "en-us", currency: "EUR" },
  { code: "de-at", languageCode: "de", countryCode: "AT", name: "German (Austria)", nativeName: "Deutsch (Österreich)", fallbackLocale: "de-de", currency: "EUR" },
  { code: "de-ch", languageCode: "de", countryCode: "CH", name: "German (Switzerland)", nativeName: "Deutsch (Schweiz)", fallbackLocale: "de-de", currency: "CHF" },
  { code: "fr-ch", languageCode: "fr", countryCode: "CH", name: "French (Switzerland)", nativeName: "Français (Suisse)", fallbackLocale: "fr-fr", currency: "CHF" },
  { code: "it-ch", languageCode: "it", countryCode: "CH", name: "Italian (Switzerland)", nativeName: "Italiano (Svizzera)", fallbackLocale: "it-it", currency: "CHF" },
  { code: "nl-be", languageCode: "nl", countryCode: "BE", name: "Dutch (Belgium)", nativeName: "Nederlands (België)", fallbackLocale: "nl-nl", currency: "EUR" },
  { code: "fr-be", languageCode: "fr", countryCode: "BE", name: "French (Belgium)", nativeName: "Français (Belgique)", fallbackLocale: "fr-fr", currency: "EUR" },
  { code: "en-ie", languageCode: "en", countryCode: "IE", name: "English (Ireland)", nativeName: "English (Ireland)", fallbackLocale: "en-gb", currency: "EUR" },
  // Americas
  { code: "en-ca", languageCode: "en", countryCode: "CA", name: "English (Canada)", nativeName: "English (Canada)", fallbackLocale: "en-us", currency: "CAD" },
  { code: "fr-ca", languageCode: "fr", countryCode: "CA", name: "French (Canada)", nativeName: "Français (Canada)", fallbackLocale: "fr-fr", currency: "CAD" },
  { code: "es-mx", languageCode: "es", countryCode: "MX", name: "Spanish (Mexico)", nativeName: "Español (México)", fallbackLocale: "es-es", currency: "MXN" },
  { code: "pt-br", languageCode: "pt", countryCode: "BR", name: "Portuguese (Brazil)", nativeName: "Português (Brasil)", fallbackLocale: "pt-pt", currency: "BRL" },
  { code: "es-ar", languageCode: "es", countryCode: "AR", name: "Spanish (Argentina)", nativeName: "Español (Argentina)", fallbackLocale: "es-es", currency: "ARS" },
  { code: "es-co", languageCode: "es", countryCode: "CO", name: "Spanish (Colombia)", nativeName: "Español (Colombia)", fallbackLocale: "es-es", currency: "COP" },
  { code: "es-cl", languageCode: "es", countryCode: "CL", name: "Spanish (Chile)", nativeName: "Español (Chile)", fallbackLocale: "es-es", currency: "CLP" },
  { code: "es-pe", languageCode: "es", countryCode: "PE", name: "Spanish (Peru)", nativeName: "Español (Perú)", fallbackLocale: "es-es", currency: "PEN" },
  { code: "en-au", languageCode: "en", countryCode: "AU", name: "English (Australia)", nativeName: "English (Australia)", fallbackLocale: "en-us", currency: "AUD" },
  { code: "en-nz", languageCode: "en", countryCode: "NZ", name: "English (New Zealand)", nativeName: "English (New Zealand)", fallbackLocale: "en-us", currency: "NZD" },
  // Asia
  { code: "ja-jp", languageCode: "ja", countryCode: "JP", name: "Japanese (Japan)", nativeName: "日本語 (日本)", fallbackLocale: "en-us", currency: "JPY" },
  { code: "ko-kr", languageCode: "ko", countryCode: "KR", name: "Korean (South Korea)", nativeName: "한국어 (대한민국)", fallbackLocale: "en-us", currency: "KRW" },
  { code: "zh-cn", languageCode: "zh", countryCode: "CN", name: "Chinese (Simplified, China)", nativeName: "简体中文 (中国)", fallbackLocale: "en-us", currency: "CNY" },
  { code: "zh-tw", languageCode: "zh", countryCode: "TW", name: "Chinese (Traditional, Taiwan)", nativeName: "繁體中文 (台灣)", fallbackLocale: "zh-cn", currency: "TWD" },
  { code: "zh-hk", languageCode: "zh", countryCode: "HK", name: "Chinese (Traditional, Hong Kong)", nativeName: "繁體中文 (香港)", fallbackLocale: "zh-cn", currency: "HKD" },
  { code: "hi-in", languageCode: "hi", countryCode: "IN", name: "Hindi (India)", nativeName: "हिन्दी (भारत)", fallbackLocale: "en-us", currency: "INR" },
  { code: "en-in", languageCode: "en", countryCode: "IN", name: "English (India)", nativeName: "English (India)", fallbackLocale: "en-us", currency: "INR" },
  { code: "tr-tr", languageCode: "tr", countryCode: "TR", name: "Turkish (Turkey)", nativeName: "Türkçe (Türkiye)", fallbackLocale: "en-us", currency: "TRY" },
  { code: "th-th", languageCode: "th", countryCode: "TH", name: "Thai (Thailand)", nativeName: "ไทย (ไทย)", fallbackLocale: "en-us", currency: "THB" },
  { code: "vi-vn", languageCode: "vi", countryCode: "VN", name: "Vietnamese (Vietnam)", nativeName: "Tiếng Việt (Việt Nam)", fallbackLocale: "en-us", currency: "VND" },
  { code: "id-id", languageCode: "id", countryCode: "ID", name: "Indonesian (Indonesia)", nativeName: "Bahasa Indonesia (Indonesia)", fallbackLocale: "en-us", currency: "IDR" },
  { code: "ms-my", languageCode: "ms", countryCode: "MY", name: "Malay (Malaysia)", nativeName: "Bahasa Melayu (Malaysia)", fallbackLocale: "en-us", currency: "MYR" },
  { code: "en-sg", languageCode: "en", countryCode: "SG", name: "English (Singapore)", nativeName: "English (Singapore)", fallbackLocale: "en-us", currency: "SGD" },
  { code: "en-ph", languageCode: "en", countryCode: "PH", name: "English (Philippines)", nativeName: "English (Philippines)", fallbackLocale: "en-us", currency: "PHP" },
  { code: "ur-pk", languageCode: "ur", countryCode: "PK", name: "Urdu (Pakistan)", nativeName: "اردو (پاکستان)", fallbackLocale: "en-us", currency: "PKR" },
  { code: "bn-bd", languageCode: "bn", countryCode: "BD", name: "Bengali (Bangladesh)", nativeName: "বাংলা (বাংলাদেশ)", fallbackLocale: "en-us", currency: "BDT" },
  // Middle East
  { code: "ar-ae", languageCode: "ar", countryCode: "AE", name: "Arabic (UAE)", nativeName: "العربية (الإمارات)", fallbackLocale: "en-us", currency: "AED" },
  { code: "ar-sa", languageCode: "ar", countryCode: "SA", name: "Arabic (Saudi Arabia)", nativeName: "العربية (السعودية)", fallbackLocale: "en-us", currency: "SAR" },
  { code: "ar-eg", languageCode: "ar", countryCode: "EG", name: "Arabic (Egypt)", nativeName: "العربية (مصر)", fallbackLocale: "en-us", currency: "EGP" },
  { code: "he-il", languageCode: "he", countryCode: "IL", name: "Hebrew (Israel)", nativeName: "עברית (ישראל)", fallbackLocale: "en-us", currency: "ILS" },
  // South Asia
  { code: "ta-in", languageCode: "ta", countryCode: "IN", name: "Tamil (India)", nativeName: "தமிழ் (இந்தியா)", fallbackLocale: "en-us", currency: "INR" },
  { code: "te-in", languageCode: "te", countryCode: "IN", name: "Telugu (India)", nativeName: "తెలుగు (భారతదేశం)", fallbackLocale: "en-us", currency: "INR" },
  { code: "mr-in", languageCode: "mr", countryCode: "IN", name: "Marathi (India)", nativeName: "मराठी (भारत)", fallbackLocale: "en-us", currency: "INR" },
  // Africa
  { code: "en-za", languageCode: "en", countryCode: "ZA", name: "English (South Africa)", nativeName: "English (South Africa)", fallbackLocale: "en-us", currency: "ZAR" },
  { code: "en-ng", languageCode: "en", countryCode: "NG", name: "English (Nigeria)", nativeName: "English (Nigeria)", fallbackLocale: "en-us", currency: "NGN" },
  { code: "en-ke", languageCode: "en", countryCode: "KE", name: "English (Kenya)", nativeName: "English (Kenya)", fallbackLocale: "en-us", currency: "KES" },
  { code: "fr-ma", languageCode: "fr", countryCode: "MA", name: "French (Morocco)", nativeName: "Français (Maroc)", fallbackLocale: "fr-fr", currency: "MAD" },
  // Eastern Europe / Russia
  { code: "ru-ru", languageCode: "ru", countryCode: "RU", name: "Russian (Russia)", nativeName: "Русский (Россия)", fallbackLocale: "en-us", currency: "RUB" },
  { code: "uk-ua", languageCode: "uk", countryCode: "UA", name: "Ukrainian (Ukraine)", nativeName: "Українська (Україна)", fallbackLocale: "en-us", currency: "UAH" },
  { code: "ro-md", languageCode: "ro", countryCode: "MD", name: "Romanian (Moldova)", nativeName: "Română (Republica Moldova)", fallbackLocale: "ro-ro", currency: "MDL" },
];

const FALLBACK_COUNTRY_RULES: { countryCode: string; preferredLocale: string }[] = [
  { countryCode: "FR", preferredLocale: "fr-fr" },
  { countryCode: "DE", preferredLocale: "de-de" },
  { countryCode: "IT", preferredLocale: "it-it" },
  { countryCode: "ES", preferredLocale: "es-es" },
  { countryCode: "PT", preferredLocale: "pt-pt" },
  { countryCode: "BR", preferredLocale: "pt-br" },
  { countryCode: "US", preferredLocale: "en-us" },
  { countryCode: "GB", preferredLocale: "en-gb" },
  { countryCode: "CA", preferredLocale: "en-ca" },
  { countryCode: "MX", preferredLocale: "es-mx" },
  { countryCode: "JP", preferredLocale: "ja-jp" },
  { countryCode: "KR", preferredLocale: "ko-kr" },
  { countryCode: "CN", preferredLocale: "zh-cn" },
  { countryCode: "IN", preferredLocale: "hi-in" },
  { countryCode: "CH", preferredLocale: "de-ch" },
  { countryCode: "BE", preferredLocale: "nl-be" },
  { countryCode: "RU", preferredLocale: "ru-ru" },
  { countryCode: "NL", preferredLocale: "nl-nl" },
  { countryCode: "SE", preferredLocale: "sv-se" },
  { countryCode: "PL", preferredLocale: "pl-pl" },
];

// ════════════════════════════════════════════════
// GENERAZIONE MAPPE
// ════════════════════════════════════════════════

function buildMaps(locales: LocaleSeed[], countryRules: { countryCode: string; preferredLocale: string }[]) {
  // COUNTRY_LOCALE: country code → preferred locale
  const countryLocale: Record<string, string> = {};
  for (const rule of countryRules) {
    countryLocale[rule.countryCode] = rule.preferredLocale;
  }

  // Add remaining countries from locale data (those not in CountryLocaleRule)
  for (const loc of locales) {
    if (loc.countryCode && !countryLocale[loc.countryCode]) {
      countryLocale[loc.countryCode] = loc.code;
    }
  }

  // LANG_TO_DEFAULT_LOCALE: language code → most common locale
  // For each language, pick the locale with the best default:
  //   1. Where countryCode matches the language (e.g., "fr" → "FR" → "fr-fr")
  //   2. For "en", prefer "en-us" (most widely used)
  //   3. Fallback to first alphabetically
  const langToDefault: Record<string, string> = {};
  for (const loc of locales) {
    const lang = loc.languageCode;
    if (!langToDefault[lang]) {
      langToDefault[lang] = loc.code;
    }
    const cc = loc.countryCode?.toLowerCase() ?? "";
    // Prefer locales where countryCode matches the language code ("fr" → "FR" → "fr-fr")
    if (cc === lang) {
      langToDefault[lang] = loc.code;
    }
    // For "en", explicitly prefer "en-us" over any other match
    if (lang === "en" && loc.code === "en-us") {
      langToDefault[lang] = loc.code;
    }
  }
  // Hardcoded overrides for ISO aliases not in DB
  if (!langToDefault["no"]) langToDefault["no"] = "nb-no"; // ISO 639-1 Norwegian → Bokmål

  // LOCALE_CURRENCY: locale code → currency
  const localeCurrency: Record<string, string> = {};
  for (const loc of locales) {
    if (loc.currency) {
      localeCurrency[loc.code] = loc.currency;
    }
  }

  // ALL_LOCALES: set of all locale codes + language codes
  const allLocales = new Set<string>();
  for (const loc of locales) {
    allLocales.add(loc.code);
    allLocales.add(loc.languageCode);
  }

  return {
    countryLocale,
    langToDefault,
    localeCurrency,
    allLocales: [...allLocales].sort(),
    defaultLocale: "en-us",
  };
}

// ════════════════════════════════════════════════
// GENERATORE TYPESCRIPT
// ════════════════════════════════════════════════

function formatLines(map: Record<string, string>): string {
  const keys = Object.keys(map).sort();
  return keys.map((k) => `  "${k}": "${map[k]}",`).join("\n");
}

function generateFileContent(data: {
  countryLocale: Record<string, string>;
  langToDefault: Record<string, string>;
  localeCurrency: Record<string, string>;
  allLocales: string[];
  defaultLocale: string;
}): string {
  return `// ═══════════════════════════════════════════════════════════════
// ⚠️ FILE GENERATO AUTOMATICAMENTE — NON MODIFICARE A MANO ⚠️
// ═══════════════════════════════════════════════════════════════
//
// Generato da: scripts/generate/generate-locale-resolver.ts
// Data: ${new Date().toISOString().split("T")[0]}
// Fonte: Database Prisma (tabelle Locale + CountryLocaleRule)
//
// Per rigenerare: npx tsx scripts/generate/generate-locale-resolver.ts
//
// ═══════════════════════════════════════════════════════════════

// Mappa: codice nazione a 2 lettere → locale preferito (es. "IT" → "it-it")
export const COUNTRY_LOCALE: Record<string, string> = {
${formatLines(data.countryLocale)}
};

// Mappa: codice lingua a 2 lettere → locale predefinito (es. "en" → "en-us")
export const LANG_TO_DEFAULT_LOCALE: Record<string, string> = {
${formatLines(data.langToDefault)}
};

// Mappa: locale completo → codice valuta (es. "it-it" → "EUR")
export const LOCALE_CURRENCY: Record<string, string> = {
${formatLines(data.localeCurrency)}
};

// Set di tutti i codici locale conosciuti (include sia "fr-fr" che "fr")
export const ALL_KNOWN_LOCALES: ReadonlySet<string> = new Set([
${data.allLocales.map((l) => `  "${l}",`).join("\n")}
]);

export const DEFAULT_LOCALE = "${data.defaultLocale}";
`;
}

// ════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════

async function main() {
  console.log("\n🌐 Generate Locale Data from Database\n");

  let prisma: PrismaClient | null = null;
  let usedFallback = false;
  let locales: LocaleSeed[] = [];
  let countryRules: { countryCode: string; preferredLocale: string }[] = [];

  // ── Try: read from DB ──────────────────────────
  try {
    prisma = new PrismaClient();
    await prisma.$connect();

    const dbLocales = await prisma.locale.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
    });

    if (dbLocales.length > 0) {
      locales = dbLocales.map((l: { code: string; languageCode: string; countryCode: string | null; name: string; nativeName: string; fallbackLocale: string | null; currency: string | null }) => ({
        code: l.code,
        languageCode: l.languageCode,
        countryCode: l.countryCode ?? "",
        name: l.name,
        nativeName: l.nativeName,
        fallbackLocale: l.fallbackLocale ?? "en-us",
        currency: l.currency ?? "EUR",
      }));

      const dbRules = await prisma.countryLocaleRule.findMany({
        orderBy: { countryCode: "asc" },
      });

      countryRules = dbRules.map((r: { countryCode: string; preferredLocale: string }) => ({
        countryCode: r.countryCode,
        preferredLocale: r.preferredLocale,
      }));

      log(`✅ Lette ${locales.length} localizzazioni e ${countryRules.length} regole paese dal DB`);
    } else {
      log("⚠️  DB connesso ma nessun locale trovato — uso fallback embedded");
      usedFallback = true;
    }

    await prisma.$disconnect();
  } catch (err) {
    if (prisma) {
      try { await prisma.$disconnect(); } catch { /* ignore */ }
    }
    log(`⚠️  DB non disponibile (${(err as Error).message}) — uso fallback embedded`);
    usedFallback = true;
  }

  // ── Fallback: use embedded data ─────────────────
  if (usedFallback || locales.length === 0) {
    locales = FALLBACK_LOCALES;
    countryRules = FALLBACK_COUNTRY_RULES;
    log(`✅ Usati ${locales.length} locale e ${countryRules.length} regole dal fallback`);
  }

  // ── Build maps ──────────────────────────────────
  const data = buildMaps(locales, countryRules);

  // ── Write output ────────────────────────────────
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const content = generateFileContent(data);
  fs.writeFileSync(OUTPUT_FILE, content, "utf-8");

  log(`✅ Generato: ${OUTPUT_FILE}`);
  console.log(`   📊 ${Object.keys(data.countryLocale).length} paesi, ${Object.keys(data.langToDefault).length} lingue, ${Object.keys(data.localeCurrency).length} valute\n`);
}

main().catch((err) => {
  console.error("❌ Errore:", err);
  process.exit(1);
});
