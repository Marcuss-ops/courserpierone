const LOCALE_MAP: Record<string, string> = {
  it: "it-it",
  en: "en-us",
  es: "es-es",
  fr: "fr-fr",
  de: "de-de",
  pt: "pt-pt",
};

export function toFullLocale(locale: string): string {
  if (locale.includes("-")) return locale;
  return LOCALE_MAP[locale] ?? locale;
}
