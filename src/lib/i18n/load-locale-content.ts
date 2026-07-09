/**
 * load-locale-content.ts
 *
 * Carica il file JSON della lingua per un prodotto.
 * Legge da data/{slug}/{locale}.json (generato da extract-locales.ts).
 *
 * Fallback:
 *   1. Prova data/{slug}/{locale}.json
 *   2. Prova data/{slug}/{lang}.json (codice a 2 lettere)
 *   3. Prova data/{slug}/{default}.json
 *   4. Crea un LocaleContent vuoto
 */

import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import type { LocaleContent } from "./locale-content";
import { createEmptyLocale } from "./locale-content";
import { cacheGet, cacheSet } from "../redis";

const DATA_DIR = resolve(process.cwd(), "data");

const LOCALE_FALLBACK_CHAIN: Record<string, string[]> = {
  "en-gb": ["en-gb", "en"],
  "pt-br": ["pt-br", "pt"],
  "zh-cn": ["zh-cn", "zh"],
  "zh-tw": ["zh-tw", "zh"],
  "de-at": ["de-at", "de"],
  "de-ch": ["de-ch", "de"],
  "fr-ch": ["fr-ch", "fr"],
  "fr-ca": ["fr-ca", "fr"],
  "en-ca": ["en-ca", "en"],
  "es-mx": ["es-mx", "es"],
};

/**
 * Carica il LocaleContent per un prodotto e lingua.
 */
export function loadLocaleContent(slug: string, locale: string): LocaleContent | null {
  const productDir = resolve(DATA_DIR, slug);
  if (!existsSync(productDir)) return null;

  // Costruisci chain di fallback
  const lang = locale.split("-")[0]?.toLowerCase() ?? locale;
  const chain = LOCALE_FALLBACK_CHAIN[locale] ?? [locale, lang];

  for (const code of chain) {
    const filePath = resolve(productDir, `${code}.json`);
    if (existsSync(filePath)) {
      try {
        const raw = readFileSync(filePath, "utf-8");
        return JSON.parse(raw) as LocaleContent;
      } catch {
        continue;
      }
    }
  }

  return null;
}

/**
 * Carica LocaleContent con fallback garantito — restituisce sempre
 * un oggetto valido (vuoto se non trova nulla).
 */
export function loadLocaleContentSafe(slug: string, locale: string): LocaleContent {
  return loadLocaleContent(slug, locale) ?? createEmptyLocale(locale);
}

/**
 * Versione async con cache Redis (5 min TTL).
 * Preferire questa a loadLocaleContentSafe nei server components.
 */
export async function loadLocaleContentCached(slug: string, locale: string): Promise<LocaleContent> {
  const redisKey = `locale:${slug}:${locale}`;
  const cached = await cacheGet<LocaleContent>(redisKey);
  if (cached) return cached;

  const result = loadLocaleContentSafe(slug, locale);
  await cacheSet(redisKey, result).catch(() => {});
  return result;
}
