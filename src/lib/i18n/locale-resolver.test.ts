import { describe, it, expect } from "vitest";
import {
  normalizeLocale,
  langToLocale,
  localeToLanguage,
  isKnownLocale,
  resolveFallback,
  parseAcceptLanguage,
  detectFromYouTubeChannel,
  getCurrencyFromLocale,
  DEFAULT_LOCALE,
  LANG_TO_DEFAULT_LOCALE,
} from "./locale-resolver";

// ─── normalizeLocale ───────────────────────────────────────
describe("normalizeLocale", () => {
  it("converts en-US to en-us", () => {
    expect(normalizeLocale("en-US")).toBe("en-us");
  });

  it("converts FR_fr to fr-fr", () => {
    expect(normalizeLocale("FR_fr")).toBe("fr-fr");
  });

  it("handles language-only codes (no country)", () => {
    expect(normalizeLocale("fr")).toBe("fr");
  });

  it("lowercases both parts", () => {
    expect(normalizeLocale("DE-DE")).toBe("de-de");
  });

  it("handles pt-BR correctly", () => {
    expect(normalizeLocale("pt-BR")).toBe("pt-br");
  });

  it("handles already lowercase input", () => {
    expect(normalizeLocale("ja-jp")).toBe("ja-jp");
  });

  it("handles underscore separator", () => {
    expect(normalizeLocale("zh_CN")).toBe("zh-cn");
  });
});

// ─── localeToLanguage ───────────────────────────────────────
describe("localeToLanguage", () => {
  it("extracts language code from locale", () => {
    expect(localeToLanguage("en-us")).toBe("en");
  });

  it("handles language-only input", () => {
    expect(localeToLanguage("fr")).toBe("fr");
  });

  it("extracts correct language for pt-br", () => {
    expect(localeToLanguage("pt-br")).toBe("pt");
  });

  it("handles uppercase input", () => {
    expect(localeToLanguage("DE-DE")).toBe("de");
  });

  it("handles single char input", () => {
    expect(localeToLanguage("x")).toBe("x");
  });
});

// ─── langToLocale ───────────────────────────────────────────
describe("langToLocale", () => {
  it("maps 'en' to en-us", () => {
    expect(langToLocale("en")).toBe("en-us");
  });

  it("maps 'it' to it-it", () => {
    expect(langToLocale("it")).toBe("it-it");
  });

  it("maps 'fr' to fr-fr", () => {
    expect(langToLocale("fr")).toBe("fr-fr");
  });

  it("maps 'pt' to pt-pt", () => {
    expect(langToLocale("pt")).toBe("pt-pt");
  });

  it("maps 'ja' to ja-jp", () => {
    expect(langToLocale("ja")).toBe("ja-jp");
  });

  it("maps 'zh' to zh-cn", () => {
    expect(langToLocale("zh")).toBe("zh-cn");
  });

  it("returns DEFAULT_LOCALE for unknown language", () => {
    expect(langToLocale("xx")).toBe(DEFAULT_LOCALE);
  });

  it("is case-insensitive", () => {
    expect(langToLocale("FR")).toBe("fr-fr");
  });

  it("direct match — 'fr-fr' is already a known locale", () => {
    expect(langToLocale("fr-fr")).toBe("fr-fr");
  });
});

// ─── isKnownLocale ──────────────────────────────────────────
describe("isKnownLocale", () => {
  it("returns true for en-us", () => {
    expect(isKnownLocale("en-us")).toBe(true);
  });

  it("returns true for fr-fr", () => {
    expect(isKnownLocale("fr-fr")).toBe(true);
  });

  it("returns true for ja-jp", () => {
    expect(isKnownLocale("ja-jp")).toBe(true);
  });

  it("returns true for language-only 'en'", () => {
    expect(isKnownLocale("en")).toBe(true);
  });

  it("returns true for zh-cn", () => {
    expect(isKnownLocale("zh-cn")).toBe(true);
  });

  it("returns false for unknown locale", () => {
    expect(isKnownLocale("xx-xx")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isKnownLocale("")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isKnownLocale("EN-US")).toBe(true);
  });

  it("returns true for pt-br", () => {
    expect(isKnownLocale("pt-br")).toBe(true);
  });

  it("returns true for ar-sa", () => {
    expect(isKnownLocale("ar-sa")).toBe(true);
  });

  it("returns true for ru-ru", () => {
    expect(isKnownLocale("ru-ru")).toBe(true);
  });
});

// ─── resolveFallback ────────────────────────────────────────
describe("resolveFallback", () => {
  it("returns the same locale when already known", () => {
    expect(resolveFallback("en-us")).toBe("en-us");
  });

  it("returns fr-fr when fr-fr is passed", () => {
    expect(resolveFallback("fr-fr")).toBe("fr-fr");
  });

  it("resolves fr-ca directly since it's a known locale", () => {
    expect(resolveFallback("fr-ca")).toBe("fr-ca");
  });

  it("resolves pt-br directly when known", () => {
    expect(resolveFallback("pt-br")).toBe("pt-br");
  });

  it("resolves language-only 'de' via LANG_TO_DEFAULT_LOCALE", () => {
    expect(resolveFallback("de")).toBe("de-de");
  });

  it("returns DEFAULT_LOCALE for unknown locale", () => {
    expect(resolveFallback("xx-xx")).toBe(DEFAULT_LOCALE);
  });

  it("returns DEFAULT_LOCALE for empty string", () => {
    expect(resolveFallback("")).toBe(DEFAULT_LOCALE);
  });

  it("handles visited set to prevent infinite loops", () => {
    // "it" normalizes to "it-it", which is a known locale → returns immediately
    // visited set is only checked during recursive fallback calls, not on first entry
    const visited = new Set<string>();
    expect(resolveFallback("it", visited)).toBe("it-it");
  });

  it("resolves ja-jp directly when known", () => {
    expect(resolveFallback("ja-jp")).toBe("ja-jp");
  });

  it("resolves ko-kr directly when known", () => {
    expect(resolveFallback("ko-kr")).toBe("ko-kr");
  });
});

// ─── getCurrencyFromLocale ──────────────────────────────────
describe("getCurrencyFromLocale", () => {
  it("returns EUR for en-us", () => {
    expect(getCurrencyFromLocale("en-us")).toBe("USD");
  });

  it("returns EUR for it-it", () => {
    expect(getCurrencyFromLocale("it-it")).toBe("EUR");
  });

  it("returns EUR for fr-fr", () => {
    expect(getCurrencyFromLocale("fr-fr")).toBe("EUR");
  });

  it("returns JPY for ja-jp", () => {
    expect(getCurrencyFromLocale("ja-jp")).toBe("JPY");
  });

  it("returns GBP for en-gb", () => {
    expect(getCurrencyFromLocale("en-gb")).toBe("GBP");
  });

  it("returns BRL for pt-br", () => {
    expect(getCurrencyFromLocale("pt-br")).toBe("BRL");
  });

  it("falls back to EUR for unknown locale", () => {
    expect(getCurrencyFromLocale("xx-xx")).toBe("EUR");
  });

  it("falls back to EUR for empty string", () => {
    expect(getCurrencyFromLocale("")).toBe("EUR");
  });

  it("handles uppercase input", () => {
    expect(getCurrencyFromLocale("DE-DE")).toBe("EUR");
  });

  it("returns SEK for sv-se", () => {
    expect(getCurrencyFromLocale("sv-se")).toBe("SEK");
  });

  it("returns INR for hi-in", () => {
    expect(getCurrencyFromLocale("hi-in")).toBe("INR");
  });
});

// ─── parseAcceptLanguage ────────────────────────────────────
describe("parseAcceptLanguage", () => {
  it("parses single locale", () => {
    const result = parseAcceptLanguage("en-US");
    expect(result).toEqual(["en-us"]);
  });

  it("parses multiple locales with quality", () => {
    const result = parseAcceptLanguage("fr-FR;q=0.9, en-US;q=1.0, de-DE;q=0.8");
    expect(result).toEqual(["en-us", "fr-fr", "de-de"]);
  });

  it("sorts by quality descending", () => {
    const result = parseAcceptLanguage("fr;q=0.5, en;q=1.0, de;q=0.7");
    expect(result).toEqual(["en", "de", "fr"]);
  });

  it("defaults quality to 1 for unspecified", () => {
    const result = parseAcceptLanguage("fr, en, de");
    expect(result[0]).toBe("fr");
  });

  it("returns empty array for null", () => {
    expect(parseAcceptLanguage(null)).toEqual([]);
  });

  it("returns empty array for undefined", () => {
    expect(parseAcceptLanguage(undefined)).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    expect(parseAcceptLanguage("")).toEqual([]);
  });

  it("normalizes locales to lowercase", () => {
    const result = parseAcceptLanguage("FR-FR, ES-ES");
    expect(result).toEqual(["fr-fr", "es-es"]);
  });

  it("handles underscore separator", () => {
    const result = parseAcceptLanguage("pt_BR;q=0.9, en_US");
    // en_US has implicit q=1.0 (higher than pt_BR's q=0.9), so en-us comes first
    expect(result).toEqual(["en-us", "pt-br"]);
  });

  it("filters out locales shorter than 2 chars", () => {
    const result = parseAcceptLanguage("en, x, fr");
    expect(result).toEqual(["en", "fr"]);
  });
});

// ─── detectFromYouTubeChannel ───────────────────────────────
describe("detectFromYouTubeChannel", () => {
  // Currently YT_CHANNEL_LOCALE is empty, so all return null
  it("returns null when no channels are configured", () => {
    expect(detectFromYouTubeChannel("", "")).toBeNull();
  });

  it("returns null for non-matching referrer", () => {
    expect(detectFromYouTubeChannel("https://google.com", "")).toBeNull();
  });

  it("returns null when YT_CHANNEL_LOCALE is empty (current state)", () => {
    expect(detectFromYouTubeChannel("https://youtube.com/@canale-francese", "youtube")).toBeNull();
  });
});

// ─── DEFAULT_LOCALE constant ───────────────────────────────
describe("DEFAULT_LOCALE", () => {
  it("is en-us", () => {
    expect(DEFAULT_LOCALE).toBe("en-us");
  });
});

// ─── LANG_TO_DEFAULT_LOCALE constant ───────────────────────
describe("LANG_TO_DEFAULT_LOCALE", () => {
  it("contains common languages", () => {
    expect(LANG_TO_DEFAULT_LOCALE.en).toBe("en-us");
    expect(LANG_TO_DEFAULT_LOCALE.it).toBe("it-it");
    expect(LANG_TO_DEFAULT_LOCALE.fr).toBe("fr-fr");
    expect(LANG_TO_DEFAULT_LOCALE.de).toBe("de-de");
  });

  it("maps ja to ja-jp", () => {
    expect(LANG_TO_DEFAULT_LOCALE.ja).toBe("ja-jp");
  });

  it("maps zh to zh-cn", () => {
    expect(LANG_TO_DEFAULT_LOCALE.zh).toBe("zh-cn");
  });

  it("maps pt to pt-pt (not pt-br)", () => {
    expect(LANG_TO_DEFAULT_LOCALE.pt).toBe("pt-pt");
  });

  it("does not have an entry for xx", () => {
    expect(LANG_TO_DEFAULT_LOCALE.xx).toBeUndefined();
  });
});