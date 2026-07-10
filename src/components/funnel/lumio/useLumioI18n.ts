// ─── Lumio i18n helper ─────────────────────────────────────
// Extracted from template-lumio.tsx to avoid duplication
// across section components.

import type { LumioLocaleContent, LumioT } from "./types";

/**
 * Creates a simple translation function that looks up labels
 * from localeContent.ui.labels with a fallback value.
 */
export function createLumioT(lc?: LumioLocaleContent): LumioT {
  return (key: string, fallback: string): string =>
    (lc?.ui?.labels?.[key]) || fallback;
}
