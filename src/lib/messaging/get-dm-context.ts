/**
 * src/lib/messaging/get-dm-context.ts
 *
 * Fase 3.1 del piano DMs — helper per recuperare le risorse minime
 * necessarie al bottone "Contatta il creator" nelle pagine post-acquisto.
 *
 * Single source of truth usata sia da:
 *   - `/portal/page.tsx`            (course dashboard)
 *   - `/curso/[lessonId]/page.tsx`  (lesson page)
 *
 * Pattern dedup: prima della Fase 3.1 entrambe le pagine avevano un
 * `Promise.all([prisma.user.findFirst({role:"admin"}), prisma.product.findUnique({slug:domain})])`
 * duplicato inline. Estrarre l'helper mantiene la coerenza con la
 * convention Fase 2.x (loadAuthorizedConversation, createMessageAndNotify).
 *
 * Gate logic: il caller decide se eseguire la query passando `shouldQuery`.
 *   - true  → esegue la parallel query e ritorna creator + product
 *   - false → ritorna `{creator:null, product:null}` senza toccare il DB
 *
 * Reason: chi invoca potrebbe avere logiche di visibilità diverse (es. V2
 * potrebbe mostrare il creator anche in pagine admin). Il helper NON prende
 * decisioni di business, espone solo la query + il null-fallback.
 *
 * Note implementative:
 *   - User.findFirst usa `role:"admin"` (vedi schema.prisma Phase 1.4:
 *     "admin" e "creator" sono alias storici, ma il course-creator canonico
 *     è il primo admin). NB: in V2 quando avremo User.role="creator"
 *     dedicato, sarà sufficiente aggiornare questa query senza toccare i
 *     call site.
 *   - select: { id, name } per creator (alcuni caller future vorranno il
 *     nome del creator come avatar/header; V1 lo ignorano).
 *   - select: { id } per product (l'unico dato che serve a ChatButton è
 *     l'ID per costruire `?productId=...`).
 */

import { prisma } from "@/lib/db/prisma";

export interface DmContext {
  /** ID + nome del creator (admin) che possiede il prodotto. Null se `shouldQuery=false`. */
  creator: { id: string; name: string | null } | null;
  /** ID del prodotto (per costruire `?productId=...` URL). Null se `shouldQuery=false`. */
  product: { id: string } | null;
}

/**
 * Recupera il contesto necessario per rendere il bottone "Contatta il
 * creator" su pagine post-acquisto studente.
 *
 * @param domainSlug  Slug del prodotto/course (es. "amish-secrets").
 * @param shouldQuery Gate di sicurezza: il caller decide se eseguire il DB
 *                    lookup. Default true. Imposta a false per admin o
 *                    visitatori non autenticati.
 */
export async function getDmContext(
  domainSlug: string,
  shouldQuery = true,
): Promise<DmContext> {
  if (!shouldQuery) {
    return { creator: null, product: null };
  }

  const [creator, product] = await Promise.all([
    prisma.user.findFirst({
      where: { role: "admin" },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true },
    }),
    prisma.product.findUnique({
      where: { slug: domainSlug },
      select: { id: true },
    }),
  ]);

  return { creator, product };
}
