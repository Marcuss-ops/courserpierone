// ─── Amish template — hardcoded footer fallbacks ──────────
// These are last-resort fallbacks when localeContent.ui.labels
// does not provide a translation for the given key.

const FALLBACKS: Record<string, Record<string, string>> = {
  en: {
    footer_email: "supporto@courssy.it",
    footer_privacy: "Privacy Policy",
    footer_terms: "Terms & Conditions",
    footer_cookies: "Cookie Policy",
    footer_refund: "Refund Policy",
    footer_rights: "All rights reserved.",
  },
  it: {
    footer_email: "supporto@courssy.it",
    footer_privacy: "Privacy Policy",
    footer_terms: "Termini e Condizioni",
    footer_cookies: "Cookie Policy",
    footer_refund: "Politica di Rimborso",
    footer_rights: "Tutti i diritti riservati.",
  },
  es: {
    footer_email: "supporto@courssy.it",
    footer_privacy: "Política de Privacidad",
    footer_terms: "Términos y Condiciones",
    footer_cookies: "Política de Cookies",
    footer_refund: "Política de Reembolso",
    footer_rights: "Todos los derechos reservados.",
  },
  fr: {
    footer_email: "supporto@courssy.it",
    footer_privacy: "Politique de Confidentialité",
    footer_terms: "Conditions Générales",
    footer_cookies: "Politique de Cookies",
    footer_refund: "Politique de Remboursement",
    footer_rights: "Tous droits réservés.",
  },
  de: {
    footer_email: "supporto@courssy.it",
    footer_privacy: "Datenschutzerklärung",
    footer_terms: "Allgemeine Geschäftsbedingungen",
    footer_cookies: "Cookie-Richtlinie",
    footer_refund: "Rückerstattungsrichtlinie",
    footer_rights: "Alle Rechte vorbehalten.",
  },
};

export function getFallbackLabel(
  lang: string,
  key: string,
): string {
  const langKey = lang.split("-")[0]?.toLowerCase() || "en";
  const defaultLabels = FALLBACKS[langKey] ?? FALLBACKS.en;
  return defaultLabels?.[key] ?? "";
}
