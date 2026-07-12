/**
 * i18n — Single barrel of all translation helpers.
 *
 * Anywhere in the codebase: `import { getUiTranslations } from "@/lib/i18n"`.
 * The barrel re-exports every per-feature translation module so that the
 * "config-only new locale" pattern works regardless of which file the call
 * site is in.
 */
export * from "./locale-resolver";
export * from "./player-locale";
export * from "./visitor-session";
export * from "./ui-translations";
// NB: `./legal-translations` è ora content-only (la funzione
// `getLegalTranslations` + le 3 interfaces sono state rimosse nel
// Fase 7.2 knip cleanup). Il modulo rimane per il future privacy/
// terms rewrite ma non ha una API surface da re-esportare. Re-add
// `export * from "./legal-translations"` quando il rewrite atterra.
export * from "./chat-translations";
export * from "./auth-translations";
export * from "./seo-metadata";
export * from "./certificate-translations";
export * from "./locale-content";
