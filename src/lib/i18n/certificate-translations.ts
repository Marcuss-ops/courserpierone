/**
 * Certificate PDF Translations
 *
 * Mappe di traduzione usate dal generatore PDF dei certificati
 * (`src/app/api/certificate/[productId]/route.ts`). Differentemente da
 * `ui-translations.ts`, queste stringhe non sono interattive — vengono
 * rese come glyph jsPDF — quindi vivono in un modulo separato.
 *
 * Adding a new language = adding a key (FALLBACK = English).
 */

export interface CertificateStrings {
  certTitle: string;
  certThisIsTo: string;
  certHasCompleted: string;
  certDateLabel: string;
  certLessonsCompleted: string;
  brandLabel: string; // "COURSER" — same in all languages, exposed for completeness
}

const certificateTranslations: Record<string, CertificateStrings> = {
  it: {
    certTitle: "CERTIFICATO DI COMPLETAMENTO",
    certThisIsTo: "Si certifica che",
    certHasCompleted: "ha completato con successo il corso",
    certDateLabel: "Completato il:",
    certLessonsCompleted: "{n} lezioni completate",
    brandLabel: "COURSER",
  },
  en: {
    certTitle: "CERTIFICATE OF COMPLETION",
    certThisIsTo: "This is to certify that",
    certHasCompleted: "has successfully completed the course",
    certDateLabel: "Completed on:",
    certLessonsCompleted: "{n} lessons completed",
    brandLabel: "COURSER",
  },
  es: {
    certTitle: "CERTIFICADO DE FINALIZACIÓN",
    certThisIsTo: "Se certifica que",
    certHasCompleted: "ha completado con éxito el curso",
    certDateLabel: "Completado el:",
    certLessonsCompleted: "{n} lecciones completadas",
    brandLabel: "COURSER",
  },
};

const FALLBACK: CertificateStrings = certificateTranslations.en;

export function getCertificateTranslations(langCode: string): CertificateStrings {
  const normalized = langCode.toLowerCase().split("-")[0];
  return certificateTranslations[normalized] ?? FALLBACK;
}
