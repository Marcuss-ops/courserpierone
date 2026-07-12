/**
 * src/lib/auth/roles.ts
 *
 * Helper per tipizzare e distinguere i ruoli utente della piattaforma.
 *
 * Il campo `User.role` resta una `String` lato Prisma (vedi `prisma/schema.prisma`)
 * per non rompere il deploy esistente. I valori canonici sono:
 *
 *   - 'admin'    : può amministrare la piattaforma (prodotti, utenti, ordini).
 *   - 'creator'  : possiede uno o più prodotti e comunica con i propri clienti.
 *                  Può anche avere capacità amministrative complete (l'admin
 *                  principale è contemporaneamente il creator di tutti i prodotti).
 *   - 'student'  : utente finale che acquista prodotti e può contattare
 *                  esclusivamente il creator dei prodotti acquistati.
 *
 * Tutti i check autorizzativi del progetto (route handlers, UI gates, resolver
 * di messaggistica) devono passare da questo modulo per evitare confronti
 * `role === "admin"` sparsi nel codice.
 */

export const USER_ROLES = ["admin", "creator", "student"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const DEFAULT_USER_ROLE: UserRole = "student";

/** Narrowing guard: true se `role` è un valore canonico conosciuto. */
export function isKnownRole(role: string | null | undefined): role is UserRole {
  return typeof role === "string" && (USER_ROLES as readonly string[]).includes(role);
}

/** Coerce qualunque valore in un `UserRole`, fallback al default. */
export function assertUserRole(role: string | null | undefined): UserRole {
  return isKnownRole(role) ? role : DEFAULT_USER_ROLE;
}

// ─── Predicati per i singoli ruoli ───────────────────────────

export function isAdmin(role: string | null | undefined): boolean {
  return role === "admin";
}

export function isCreator(role: string | null | undefined): boolean {
  return role === "creator";
}

export function isStudent(role: string | null | undefined): boolean {
  return role === "student";
}

/** "Staff" può amministrare prodotti e/o rispondere ai clienti. */
export function isStaff(role: string | null | undefined): boolean {
  return isAdmin(role) || isCreator(role);
}

/**
 * "Può gestire conversazioni creator-side": include admin (che è anche il
 * creator principale di tutti i prodotti in V1). Usato dal permission resolver
 * della messaggistica (vedi Fase 1.5).
 */
export function canActAsCreator(role: string | null | undefined): boolean {
  return isStaff(role);
}

/**
 * Etichetta human-friendly del ruolo, usata in UI esistenti dove oggi
 * appare il check letterale `role === "admin" ? "Admin" : "Studente"`.
 * Centralizzata qui per future traduzioni e badge distinti.
 */
export function roleLabel(role: string | null | undefined): string {
  if (isAdmin(role)) return "Admin";
  if (isCreator(role)) return "Creator";
  return "Studente";
}
