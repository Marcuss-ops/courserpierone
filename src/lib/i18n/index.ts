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
export * from "./legal-translations";
export * from "./chat-translations";
export * from "./auth-translations";
export * from "./seo-metadata";
export * from "./certificate-translations";
export * from "./locale-content";
