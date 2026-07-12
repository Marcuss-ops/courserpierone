/**
 * Shared UI Translations
 *
 * Traduzioni condivise per footer, language selector e pagine di errore.
 * Basate sul codice lingua (2 lettere), non sul locale completo.
 */

const uiTranslations: Record<string, UiStrings> = {
  // ═══ Italiano ═══
  it: {
    // Footer
    footerTagline: "Scopri corsi che cambiano la tua vita.",
    footerExplore: "Esplora",
    footerLegal: "Legale",
    footerLanguage: "Lingua",
    footerHome: "Home",
    footerSignIn: "Accedi",
    footerPrivacy: "Privacy Policy",
    footerTerms: "Termini di Servizio",
    footerRefund: "Politica di Rimborso",
    footerRights: "Tutti i diritti riservati.",

    // Language selector
    langSearchPlaceholder: "Cerca lingua...",
    langNoResults: "Nessun risultato per",
    langShowCompact: "Mostra compatto",
    langShowAll: "Tutte le lingue",
    langAllVariants: "Tutte le {count} varianti",
    langSelect: "Seleziona lingua",

    // Error pages
    errorNotFoundTitle: "Pagina non trovata",
    errorNotFoundDesc: "La pagina che stai cercando non esiste o è stata spostata.",
    errorGenericTitle: "Qualcosa è andato storto",
    errorGenericDesc: "Si è verificato un errore imprevisto. Riprova tra qualche istante.",
    errorPortalTitle: "Problema di accesso",
    errorPortalDesc: "Non è possibile accedere all'area corsi. Verifica di aver acquistato il corso o prova ad accedere di nuovo.",
    errorRetry: "Riprova",
    errorBackHome: "Torna alla Home",

    // Common
    back: "← indietro",
  },

  // ═══ English ═══
  en: {
    // Footer
    footerTagline: "Discover courses that change your life.",
    footerExplore: "Explore",
    footerLegal: "Legal",
    footerLanguage: "Language",
    footerHome: "Home",
    footerSignIn: "Sign in",
    footerPrivacy: "Privacy Policy",
    footerTerms: "Terms of Service",
    footerRefund: "Refund Policy",
    footerRights: "All rights reserved.",

    // Language selector
    langSearchPlaceholder: "Search language...",
    langNoResults: "No results for",
    langShowCompact: "Show compact",
    langShowAll: "All languages",
    langAllVariants: "All {count} variants",
    langSelect: "Select language",

    // Error pages
    errorNotFoundTitle: "Page not found",
    errorNotFoundDesc: "The page you are looking for does not exist or has been moved.",
    errorGenericTitle: "Something went wrong",
    errorGenericDesc: "An unexpected error occurred. Please try again in a moment.",
    errorPortalTitle: "Access issue",
    errorPortalDesc: "Unable to access the course area. Make sure you purchased the course or try logging in again.",
    errorRetry: "Try again",
    errorBackHome: "Back to Home",

    // Common
    back: "← back",
  },

  // ═══ Español ═══
  es: {
    // Footer
    footerTagline: "Descubre cursos que cambian tu vida.",
    footerExplore: "Explorar",
    footerLegal: "Legal",
    footerLanguage: "Idioma",
    footerHome: "Inicio",
    footerSignIn: "Iniciar sesión",
    footerPrivacy: "Política de Privacidad",
    footerTerms: "Términos de Servicio",
    footerRefund: "Política de Reembolso",
    footerRights: "Todos los derechos reservados.",

    // Language selector
    langSearchPlaceholder: "Buscar idioma...",
    langNoResults: "No hay resultados para",
    langShowCompact: "Mostrar compacto",
    langShowAll: "Todos los idiomas",
    langAllVariants: "Todas las {count} variantes",
    langSelect: "Seleccionar idioma",

    // Error pages
    errorNotFoundTitle: "Página no encontrada",
    errorNotFoundDesc: "La página que buscas no existe o ha sido movida.",
    errorGenericTitle: "Algo salió mal",
    errorGenericDesc: "Ocurrió un error inesperado. Por favor, inténtalo de nuevo en un momento.",
    errorPortalTitle: "Problema de acceso",
    errorPortalDesc: "No es posible acceder al área del curso. Verifica que hayas comprado el curso o intenta acceder de nuevo.",
    errorRetry: "Reintentar",
    errorBackHome: "Volver al Inicio",

    // Common
    back: "← volver",
  },
};

export interface UiStrings {
  // Footer
  footerTagline: string;
  footerExplore: string;
  footerLegal: string;
  footerLanguage: string;
  footerHome: string;
  footerSignIn: string;
  footerPrivacy: string;
  footerTerms: string;
  footerRefund: string;
  footerRights: string;

  // Language selector
  langSearchPlaceholder: string;
  langNoResults: string;
  langShowCompact: string;
  langShowAll: string;
  langAllVariants: string;
  langSelect: string;

  // Error pages
  errorNotFoundTitle: string;
  errorNotFoundDesc: string;
  errorGenericTitle: string;
  errorGenericDesc: string;
  errorPortalTitle: string;
  errorPortalDesc: string;
  errorRetry: string;
  errorBackHome: string;

  // Common
  back: string;
}

// English as universal fallback
const FALLBACK: UiStrings = uiTranslations.en;

/**
 * Get shared UI translations for a given language code.
 * Falls back to English if the language is not supported.
 *
 * @param langCode - 2-letter language code (e.g. "it", "en", "es")
 */
export function getUiTranslations(langCode: string): UiStrings {
  const normalized = langCode.toLowerCase().split("-")[0];
  return uiTranslations[normalized] ?? FALLBACK;
}
