/**
 * Single source of truth per il check "questo prodotto è un free course
 * accessibile a chiunque (no login, no pagamento)?"
 *
 * Usato da:
 * - src/components/course/access-gate.tsx (server-side paywall check)
 * - src/app/(locale)/[locale]/[domain]/curso/[lessonId]/page.tsx
 *   (per passare `isFreeCourse` ai Client Components che altrimenti
 *   bailoutano su `!isAuthenticated`)
 *
 * Logica: defense-in-depth — richiede SIA lo slug in NEXT_PUBLIC_FREE_COURSE_SLUGS
 * SIA `price === 0` nel DB. Un refuso accidentale qui NON rende
 * liberamente accessibile un prodotto a pagamento.
 *
 * Vedi anche:
 * - src/lib/env.ts (NEXT_PUBLIC_FREE_COURSE_SLUGS schema)
 * - src/components/course/access-gate.tsx (consumer server-side)
 */
import { getFreeCourseSlugs } from "@/lib/env";

export function isFreeCourse(slug: string | null | undefined, price?: number | null): boolean {
  if (!slug) return false;
  if (price !== 0) return false;

  return getFreeCourseSlugs().includes(slug);
}
