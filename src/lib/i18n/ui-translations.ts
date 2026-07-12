/**
 * Shared UI Translations
 *
 * Traduzioni condivise per footer, language selector, pagine di errore,
 * dashboard, PWA banner, discovery grid, download page, social proof, ecc.
 * Basate sul codice lingua (2 lettere), non sul locale completo.
 *
 * Aggiungere una nuova lingua = aggiungere una chiave al record (es. "fr")
 * con tutte le stringhe. Le lingue non presenti cadono automaticamente
 * sull'inglese via la FALLBACK chain — il sistema è "config-only" per
 * nuove lingue: nessun cambia side-effects.
 */

export interface UiStrings {
  // ─── Footer ─────────────────────────────────────────────
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

  // ─── Language selector ──────────────────────────────────
  langSearchPlaceholder: string;
  langNoResults: string;
  langShowCompact: string;
  langShowAll: string;
  langAllVariants: string;
  langSelect: string;

  // ─── Error pages ────────────────────────────────────────
  errorNotFoundTitle: string;
  errorNotFoundDesc: string;
  errorGenericTitle: string;
  errorGenericDesc: string;
  errorPortalTitle: string;
  errorPortalDesc: string;
  errorRetry: string;
  errorBackHome: string;

  // ─── Common ─────────────────────────────────────────────
  back: string;

  // ─── Dashboard (course card, stats, welcome, empty, certs) ─
  dashCourseCardCompleted: string;
  dashCourseCardLessonCount: string;
  dashCourseCardPurchasedOn: string;
  dashCourseCardProgressLabel: string;
  dashCourseCardResumeContinue: string;
  dashCourseCardResumeStart: string;
  dashCourseCardResumeReview: string;
  dashStatsProgressHeader: string;
  dashStatsLessonsCompleted: string;
  dashStatsTotalLabel: string;
  dashStatsCoursesHeader: string;
  dashStatsCoursesZero: string;
  dashStatsCoursesOne: string;
  dashStatsCoursesMany: string;
  dashWelcomeBadge: string;
  dashWelcomeGreeting: string;
  dashWelcomeResumeFallback: string;
  dashWelcomeHasOrdersOne: string;
  dashWelcomeHasOrdersMany: string;
  dashWelcomeNoOrders: string;
  dashWelcomeDefaultName: string;
  dashEmptyTitle: string;
  dashEmptyBody: string;
  dashEmptyCta: string;
  dashCertHeader: string;
  dashCertSub: string;
  dashCertAvailable: string;
  dashCertNotPurchased: string;
  dashCertNoLessons: string;

  // ─── PWA install banner ─────────────────────────────────
  pwaInstallTitle: string;
  pwaInstallBody: string;
  pwaInstallCta: string;
  pwaCloseAria: string;

  // ─── Discovery grid ─────────────────────────────────────
  discHeader: string;
  discCoursesCountOne: string;
  discCoursesCountMany: string;
  discSearchPlaceholder: string;
  discAllFilter: string;
  discNoCourses: string;
  discNoCoursesBody: string;
  discNoMatch: string;
  discClearFilters: string;
  discOwnedBadge: string;
  discAccessCta: string;
  discStudentCountOne: string;
  discStudentCountMany: string;
  discLessonCountOne: string;
  discLessonCountMany: string;

  // ─── Download page ──────────────────────────────────────
  // camelCase (legacy, retained for back-compat with existing
  // certificate/dashboard consumers).
  dlTitle: string;
  dlSubtitle: string;
  dlButton: string;
  dlViewOnline: string;
  dlLanguageLabel: string;
  dlYourLanguage: string;
  dlOtherVersions: string;
  dlSuccess: string;
  dlBackToPortal: string;
  // snake_case aliases — mirror LocaleContent.download in
  // src/lib/i18n/locale-content.ts. Preferred convention since
  // 2026-07: matches the JSON data shape loaded via
  // loadLocaleContentSafe. 7 keys added (those used by
  // src/app/(locale)/[locale]/[domain]/download/page.tsx);
  // `your_language`/`other_languages` map to dlYourLanguage/
  // dlOtherVersions and aren't accessed by the page yet.
  title: string;
  subtitle: string;
  download_button: string;
  view_online: string;
  language_label: string;
  success_message: string;
  back_to_portal: string;

  // ─── Social proof (purchase / lesson toasts) ────────────
  socialPurchase: string;
  socialLesson: string;
  socialJustNow: string;
  socialMinsAgo: string;
  socialHoursAgo: string;
}

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

    // Dashboard
    dashCourseCardCompleted: "Completato",
    dashCourseCardLessonCount: "{n} lezioni",
    dashCourseCardPurchasedOn: "Acquistato il {date}",
    dashCourseCardProgressLabel: "Avanzamento",
    dashCourseCardResumeContinue: "Continua",
    dashCourseCardResumeStart: "Inizia",
    dashCourseCardResumeReview: "Riguarda",
    dashStatsProgressHeader: "Il Tuo Progresso",
    dashStatsLessonsCompleted: "{n} lezioni completate",
    dashStatsTotalLabel: "totali",
    dashStatsCoursesHeader: "I Tuoi Corsi",
    dashStatsCoursesZero: "Inizia il tuo primo corso",
    dashStatsCoursesOne: "1 corso attivo",
    dashStatsCoursesMany: "{n} corsi attivi",
    dashWelcomeBadge: "Bentornato",
    dashWelcomeGreeting: "Bentornato,",
    dashWelcomeResumeFallback: "Riprendi da dove hai lasciato",
    dashWelcomeHasOrdersOne: "Hai 1 corso attivo. Riprendi da dove hai lasciato.",
    dashWelcomeHasOrdersMany: "Hai {n} corsi attivi. Riprendi da dove hai lasciato.",
    dashWelcomeNoOrders: "Esplora il catalogo e inizia il tuo primo percorso di apprendimento.",
    dashWelcomeDefaultName: "Studente",
    dashEmptyTitle: "Nessun corso ancora",
    dashEmptyBody: "Non hai ancora acquistato nessun corso. Esplora il catalogo e inizia il tuo percorso di apprendimento.",
    dashEmptyCta: "Scopri i Corsi",
    dashCertHeader: "I Tuoi Certificati",
    dashCertSub: "Scarica e condividi i tuoi traguardi",
    dashCertAvailable: "Certificato Disponibile",
    dashCertNotPurchased: "Acquista il corso per ottenere il certificato",
    dashCertNoLessons: "Questo corso non ha lezioni — impossibile generare il certificato",

    // PWA
    pwaInstallTitle: "Installa l'app",
    pwaInstallBody: "Aggiungi Courssy alla schermata home per un accesso rapido ai tuoi corsi.",
    pwaInstallCta: "Installa",
    pwaCloseAria: "Chiudi",

    // Discovery
    discHeader: "Discovery",
    discCoursesCountOne: "{n} corso disponibile",
    discCoursesCountMany: "{n} corsi disponibili",
    discSearchPlaceholder: "Cerca corsi...",
    discAllFilter: "Tutti",
    discNoCourses: "Nessun corso ancora",
    discNoCoursesBody: "Stiamo creando nuovi corsi. Torna presto per scoprire contenuti entusiasmanti.",
    discNoMatch: "Nessun corso corrisponde alla tua ricerca.",
    discClearFilters: "Rimuovi filtri",
    discOwnedBadge: "✓ Acquistato",
    discAccessCta: "Accedi al corso",
    discStudentCountOne: "{n} studente",
    discStudentCountMany: "{n} studenti",
    discLessonCountOne: "{n} lezione",
    discLessonCountMany: "{n} lezioni",

    // Download
    dlTitle: "Scarica il tuo libro",
    dlSubtitle: "Il tuo eBook è pronto. Scaricalo in PDF o leggilo direttamente online.",
    dlButton: "Scarica PDF",
    dlViewOnline: "Leggi Online",
    dlLanguageLabel: "Lingua",
    dlYourLanguage: "La tua lingua",
    dlOtherVersions: "Altre versioni disponibili",
    dlSuccess: "Acquisto completato! Il libro è tuo.",
    dlBackToPortal: "Torna al Portal",

    // snake_case aliases (mirror LocaleContent.download).
    title: "Scarica il tuo libro",
    subtitle: "Il tuo eBook è pronto. Scaricalo in PDF o leggilo direttamente online.",
    download_button: "Scarica PDF",
    view_online: "Leggi Online",
    language_label: "Lingua",
    success_message: "Acquisto completato! Il libro è tuo.",
    back_to_portal: "Torna al Portal",

    // Social proof
    socialPurchase: "{name} da {city} ha acquistato il corso",
    socialLesson: "{name} da {city} ha completato la lezione: {lessonTitle}",
    socialJustNow: "proprio ora",
    socialMinsAgo: "{n} minuti fa",
    socialHoursAgo: "{n} ore fa",
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

    // Dashboard
    dashCourseCardCompleted: "Completed",
    dashCourseCardLessonCount: "{n} lessons",
    dashCourseCardPurchasedOn: "Purchased on {date}",
    dashCourseCardProgressLabel: "Progress",
    dashCourseCardResumeContinue: "Continue",
    dashCourseCardResumeStart: "Start",
    dashCourseCardResumeReview: "Watch again",
    dashStatsProgressHeader: "Your Progress",
    dashStatsLessonsCompleted: "{n} lessons completed",
    dashStatsTotalLabel: "total",
    dashStatsCoursesHeader: "Your Courses",
    dashStatsCoursesZero: "Start your first course",
    dashStatsCoursesOne: "1 active course",
    dashStatsCoursesMany: "{n} active courses",
    dashWelcomeBadge: "Welcome back",
    dashWelcomeGreeting: "Welcome back,",
    dashWelcomeResumeFallback: "Resume where you left off",
    dashWelcomeHasOrdersOne: "You have 1 active course. Pick up where you left off.",
    dashWelcomeHasOrdersMany: "You have {n} active courses. Pick up where you left off.",
    dashWelcomeNoOrders: "Browse the catalog and start your first learning journey.",
    dashWelcomeDefaultName: "Student",
    dashEmptyTitle: "No courses yet",
    dashEmptyBody: "You haven't purchased any courses yet. Browse the catalog and start your learning journey.",
    dashEmptyCta: "Discover Courses",
    dashCertHeader: "Your Certificates",
    dashCertSub: "Download and share your achievements",
    dashCertAvailable: "Certificate Available",
    dashCertNotPurchased: "Please purchase the course to get the certificate",
    dashCertNoLessons: "This course has no lessons — cannot generate certificate",

    // PWA
    pwaInstallTitle: "Install the app",
    pwaInstallBody: "Add Courssy to your home screen for quick access to your courses.",
    pwaInstallCta: "Install",
    pwaCloseAria: "Close",

    // Discovery
    discHeader: "Discovery",
    discCoursesCountOne: "{n} course available",
    discCoursesCountMany: "{n} courses available",
    discSearchPlaceholder: "Search courses...",
    discAllFilter: "All",
    discNoCourses: "No courses yet",
    discNoCoursesBody: "New courses are being created. Check back soon for exciting content.",
    discNoMatch: "No courses match your search.",
    discClearFilters: "Clear filters",
    discOwnedBadge: "✓ Owned",
    discAccessCta: "Access the course",
    discStudentCountOne: "{n} student",
    discStudentCountMany: "{n} students",
    discLessonCountOne: "{n} lesson",
    discLessonCountMany: "{n} lessons",

    // Download
    dlTitle: "Download your book",
    dlSubtitle: "Your eBook is ready. Download it as PDF or read it directly online.",
    dlButton: "Download PDF",
    dlViewOnline: "Read Online",
    dlLanguageLabel: "Language",
    dlYourLanguage: "Your language",
    dlOtherVersions: "Other versions available",
    dlSuccess: "Purchase complete! The book is yours.",
    dlBackToPortal: "Back to Portal",

    // snake_case aliases (mirror LocaleContent.download).
    title: "Download your book",
    subtitle: "Your eBook is ready. Download it as PDF or read it directly online.",
    download_button: "Download PDF",
    view_online: "Read Online",
    language_label: "Language",
    success_message: "Purchase complete! The book is yours.",
    back_to_portal: "Back to Portal",

    // Social proof
    socialPurchase: "{name} from {city} purchased the course",
    socialLesson: "{name} from {city} completed the lesson: {lessonTitle}",
    socialJustNow: "just now",
    socialMinsAgo: "{n} minutes ago",
    socialHoursAgo: "{n} hours ago",
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

    // Dashboard
    dashCourseCardCompleted: "Completado",
    dashCourseCardLessonCount: "{n} lecciones",
    dashCourseCardPurchasedOn: "Comprado el {date}",
    dashCourseCardProgressLabel: "Progreso",
    dashCourseCardResumeContinue: "Continuar",
    dashCourseCardResumeStart: "Empezar",
    dashCourseCardResumeReview: "Volver a ver",
    dashStatsProgressHeader: "Tu Progreso",
    dashStatsLessonsCompleted: "{n} lecciones completadas",
    dashStatsTotalLabel: "totales",
    dashStatsCoursesHeader: "Tus Cursos",
    dashStatsCoursesZero: "Empieza tu primer curso",
    dashStatsCoursesOne: "1 curso activo",
    dashStatsCoursesMany: "{n} cursos activos",
    dashWelcomeBadge: "Bienvenido",
    dashWelcomeGreeting: "Bienvenido,",
    dashWelcomeResumeFallback: "Reanuda donde lo dejaste",
    dashWelcomeHasOrdersOne: "Tienes 1 curso activo. Reanuda donde lo dejaste.",
    dashWelcomeHasOrdersMany: "Tienes {n} cursos activos. Reanuda donde lo dejaste.",
    dashWelcomeNoOrders: "Explora el catálogo y empieza tu primer viaje de aprendizaje.",
    dashWelcomeDefaultName: "Estudiante",
    dashEmptyTitle: "Aún no hay cursos",
    dashEmptyBody: "Aún no has comprado ningún curso. Explora el catálogo y empieza tu viaje de aprendizaje.",
    dashEmptyCta: "Descubre los Cursos",
    dashCertHeader: "Tus Certificados",
    dashCertSub: "Descarga y comparte tus logros",
    dashCertAvailable: "Certificado Disponible",
    dashCertNotPurchased: "Compra el curso para obtener el certificado",
    dashCertNoLessons: "Este curso no tiene lecciones — no se puede generar el certificado",

    // PWA
    pwaInstallTitle: "Instala la app",
    pwaInstallBody: "Añade Courssy a la pantalla de inicio para un acceso rápido a tus cursos.",
    pwaInstallCta: "Instalar",
    pwaCloseAria: "Cerrar",

    // Discovery
    discHeader: "Discovery",
    discCoursesCountOne: "{n} curso disponible",
    discCoursesCountMany: "{n} cursos disponibles",
    discSearchPlaceholder: "Buscar cursos...",
    discAllFilter: "Todos",
    discNoCourses: "Aún no hay cursos",
    discNoCoursesBody: "Estamos creando nuevos cursos. Vuelve pronto para descubrir contenido emocionante.",
    discNoMatch: "Ningún curso coincide con tu búsqueda.",
    discClearFilters: "Quitar filtros",
    discOwnedBadge: "✓ Comprado",
    discAccessCta: "Acceder al curso",
    discStudentCountOne: "{n} estudiante",
    discStudentCountMany: "{n} estudiantes",
    discLessonCountOne: "{n} lección",
    discLessonCountMany: "{n} lecciones",

    // Download
    dlTitle: "Descarga tu libro",
    dlSubtitle: "Tu eBook está listo. Descárgalo en PDF o léelo directamente en línea.",
    dlButton: "Descargar PDF",
    dlViewOnline: "Leer en línea",
    dlLanguageLabel: "Idioma",
    dlYourLanguage: "Tu idioma",
    dlOtherVersions: "Otras versiones disponibles",
    dlSuccess: "¡Compra completada! El libro es tuyo.",
    dlBackToPortal: "Volver al Portal",

    // snake_case aliases (mirror LocaleContent.download).
    title: "Descarga tu libro",
    subtitle: "Tu eBook está listo. Descárgalo en PDF o léelo directamente en línea.",
    download_button: "Descargar PDF",
    view_online: "Leer en línea",
    language_label: "Idioma",
    success_message: "¡Compra completada! El libro es tuyo.",
    back_to_portal: "Volver al Portal",

    // Social proof
    socialPurchase: "{name} de {city} compró el curso",
    socialLesson: "{name} de {city} completó la lección: {lessonTitle}",
    socialJustNow: "ahora mismo",
    socialMinsAgo: "hace {n} minutos",
    socialHoursAgo: "hace {n} horas",
  },
};

// English as universal fallback — guarantees "config-only" for new locales.
const FALLBACK: UiStrings = uiTranslations.en;

/**
 * Interpolation helper — replaces `{key}` placeholders in a translation
 * with values from `params`. Unknown placeholders are left intact so the
 * caller notices the missing key.
 */
export function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    params[key] !== undefined ? String(params[key]) : match
  );
}

/**
 * Get a translated string by key, with optional parameter interpolation.
 * Looks up the language via the 2-letter prefix and falls back to English.
 *
 * Usage:
 *   const t = getUiTranslations(lang);
 *   uiT(t, "dashCourseCardLessonCount", { n: 8 }) → "8 lezioni"
 */
export function uiT(t: UiStrings, key: keyof UiStrings, params?: Record<string, string | number>): string {
  return interpolate(t[key], params);
}

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
