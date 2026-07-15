import { prisma } from "@/lib/db/prisma";
import type { Order } from "@prisma/client";

/**
 * src/lib/access/find-completed-order.ts
 *
 * @deprecated
 * Replaced post-MCR Phase 2/3 by `resolveProductAccess` in
 * `src/lib/commerce/access/resolve-product-access.ts` — the new
 * central resolver routes BOTH the legacy Order-based path and the
 * canonical AccessGrant-based path through a single function and
 * feature-flag (`USE_ACCESS_GRANT_RESOLVER`).
 *
 * Keep this helper only for legacy consumers that read the full
 * `Order` row (e.g., `locale` on the certificate route). New
 * authorization checks MUST go through `resolveProductAccess`. V2
 * cleanup target — remove once every consumer reads only the
 * boolean/grant-id answer that the central resolver returns.
 *
 * -------------------------------------------------------------------
 *
 * Single-source-of-truth per il predicato "questo User ha un Order
 * COMPLETED per questo Product". V2 DRY refactor che consolida 5
 * AccessGate paths in un solo helper di DB:
 *
 *   - src/app/api/access/route.ts              (Pattern A user-based)
 *   - src/app/api/certificate/[productId]/route.ts
 *   - src/app/api/ebook/[slug]/download/route.ts
 *   - src/app/api/videos/stream/route.ts
 *   - src/app/api/progress/route.ts            (POST handler)
 *
 * Convenzioni della firma:
 *
 *   findCompletedOrder({
 *     userId,           // required (stringa FALSA → return null difensivo)
 *     productId?,       // oppure...
 *     productSlug?,     // ...productSlug (relation filter, 1 round-trip)
 *   }): Promise<Order | null>
 *
 * Comportamento:
 *   - Se userId è falsy: ritorna `null` SENZA chiamare il DB. Difesa
 *     critica contro SQLi-class bugs: Prisma rimuove le chiavi `undefined`
 *     dal WHERE clause, quindi una query senza userId potrebbe matchare
 *     l'Order.completed di QUALSIASI utente con quel productId/slug.
 *     MAI fidarsi dell'invariante "userId è sempre passato" — viene da
 *     30+ call sites.
 *   - Se manca ENTRAMBI productId e productSlug: ritorna `null` SENZA
 *     chiamare il DB. Rifiuta l'ambiguità invece di restituire
 *     silenziosamente il primo Order.completed dell'utente su tutti i
 *     prodotti.
 *   - Se la chiamata arriva al DB, ritorna l'Order completo (incluso
 *     `locale` per il Certificate route) oppure `null` se non esiste.
 *
 * Cosa NON fa questo helper (deliberatamente):
 *   - NON gestisce admin bypass. Le 5 route admin hanno semantica
 *     divergente (certificate non ha bypass, videos+progress hanno
 *     bypass completo, access ritorna shape diversa); i caller
 *     gestiscono admin inline.
 *   - NON gestisce la verifica "guest possiede order by orderId"
 *     (Pattern B in access/route.ts). È una funzionalmente
 *     diversa (validazione ricevuta pagamento, non user relationship)
 *     e rimane come-query inline.
 *   - NON gestisce subscription/entitlement checks. RP Phase 5.
 *
 * Performance:
 *   Usa l'indice composito esistente
 *   @@index([userId, productId, status]) su Order (vedi
 *   prisma/schema.prisma riga Order model). 1 round-trip + O(log N).
 *   La variante slug usa Prisma relation filter (`product: { slug }`),
 *   internamente tradotto a JOIN su Product.id = Order.productId.
 */
export interface FindCompletedOrderInput {
  /** User.id (Postgres cuid). REQUIRED. Falsy → return null DIFENSIVO. */
  userId: string;
  /** Product.id (Postgres cuid). Mutualmente esclusivo con productSlug. */
  productId?: string;
  /**
   * Product.slug. Mutualmente esclusivo con productId. Più ergonomico
   * per l'ebook route (che riceve solo `slug` dal path) ma richiede
   * una JOIN su Product. 1 round-trip in entrambi i casi.
   */
  productSlug?: string;
}

export async function findCompletedOrder(
  input: FindCompletedOrderInput,
): Promise<Order | null> {
  // ── Defensive guard #1: userId falsy → return null SENZA query ──
  // Prisma rimuove le chiavi `undefined` dal WHERE. Senza questo check,
  // una query accidentale senza userId potrebbe matchare l'Order.
  // completed di QUALSIASI utente per il prodotto specificato → bug
  // di authorization grave (cross-user data leak).
  if (!input.userId) {
    return null;
  }

  const { userId, productId, productSlug } = input;

  // ── Defensive guard #2: nessun product identifier → refuse ambiguity ──
  // Senza ENTRAMBI productId e productSlug, una query senza product
  // filter troverebbe il primo Order.completed dell'utente su QUALSIASI
  // prodotto. Refusi piuttosto che ritornare un risultato non
  // intenzionale.
  const productFilter = productId
    ? { productId }
    : productSlug
      ? { product: { slug: productSlug } }
      : null;

  if (!productFilter) {
    return null;
  }

  return prisma.order.findFirst({
    where: {
      userId,
      status: "completed",
      ...productFilter,
    },
  });
}
