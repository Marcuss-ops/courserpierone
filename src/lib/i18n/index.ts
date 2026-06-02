export type { LocaleInfo, ResolveResult } from "./locale-resolver";
export {
  resolveLocale,
  normalizeLocale,
  langToLocale,
  localeToLanguage,
  getCurrencyFromLocale,
  isKnownLocale,
  resolveFallback,
  parseAcceptLanguage,
  detectFromYouTubeChannel,
  DEFAULT_LOCALE,
  LANG_TO_DEFAULT_LOCALE,
} from "./locale-resolver";

export { t } from "./player-locale";

export {
  getVisitorId,
  parseUtmParams,
  getReferrer,
} from "./visitor-session";