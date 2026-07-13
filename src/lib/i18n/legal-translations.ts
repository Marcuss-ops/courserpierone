/**
 * Legal Page Translations
 *
 * Traduzioni per le pagine legali: Terms & Conditions, Privacy Policy, Refund Policy.
 * Basate sul codice lingua (2 lettere), non sul locale completo.
 *
 * ─── Status: placeholder (post C2 lint cleanup, 2026-07-13) ─────────────
 * Questo modulo è un **placeholder** per il privacy/terms rewrite (V1.1
 * o V2). I dati originali (3 lingue: en, it, es) sono stati rimossi nel
 * C2 no-unused-vars cleanup perché il wrapper `getLegalTranslations` non
 * era chiamato da nessun consumer — knip li flaggava come dead code da
 * Fase 7.2 e l'audit C2 ha confermato l'assenza di callers.
 *
 * Quando le pagine legali atterreranno (editoring via admin):
 *   1. Recuperare le 3 lingue dalla history git (es. `git show <pre-C2-SHA>:src/lib/i18n/legal-translations.ts`)
 *   2. Ri-aggiungere le interfaces + il const + il wrapper `getLegalTranslations`
 *   3. Re-introdurre la riga `export * from "./legal-translations"` in `src/lib/i18n/index.ts`
 *
 * Per ora il modulo non espone nulla. Il file resta in tree come segnaposto
 * documentato.
 */
