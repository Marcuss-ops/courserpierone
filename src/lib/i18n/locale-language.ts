/** Pure locale language extraction shared by i18n infrastructure modules. */
export function localeToLanguage(locale: string): string {
  return locale.split("-")[0]?.toLowerCase() ?? locale;
}
