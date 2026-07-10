// ─── H612 i18n helper ─────────────────────────────────────
import type { H612LocaleContent, H612T } from "./types";

export function createH612T(lc?: H612LocaleContent): H612T {
  return (key: string, fallback: string): string =>
    (lc?.ui?.labels?.[key]) || fallback;
}
