import { prisma } from "@/lib/db/prisma";
import type { Order } from "@prisma/client";

/**
 * src/lib/access/find-completed-order-by-order-id.ts
 *
 * V3.1 follow-up — SIBLING SSO helper a `findCompletedOrder`, cross-keyed
 * per `orderId` (invece di userId) per il Pattern B dell'AccessGate:
 * "questo Order (matchato per id OPPURE providerOrderId) è COMPLETED
 *  per questo Product". Consumato da `src/app/api/access/route.ts`
 *  Pattern B per garantire accesso immediato post-checkout (quando non
 *  c'è ancora una Supabase session).
 *
 * ─── Perché un helper separato (NON overload di findCompletedOrder)? ───
 *   - `findCompletedOrder` enforces user-membership policy: la sua
 *     defensive guard #1 rifiuta userId falsy proprio perché la
 *     chiave di access è userId. Aggiungere orderId alla stessa firma
 *     richiederebbe un `if/else` polymorphico (anti-pattern SSOT) o
 *     un userId opzionale (che indebolirebbe la defensive guard
 *     dell'utente legittimo).
 *   - Pattern B è una verifica di PRESENZA di un Order.completed per
 *     prodotto, NON una user-relationship. La "ownership" è implicita
 *     nel fatto che l'attaccante conosce l'orderId (cuid Prisma o
 *     Stripe cs_test_...) — entrambi sono randomici crypto-grade.
 *   - Cross-key by orderId usa un indice diverso da userId:
 *     `@@index([providerOrderId])` (per il provider cross-key) e PK
 *     lookup su `Order.id` (per il cuid cross-key). Stesso pattern
 *     del CompositeIndex che l'altro helper usa per userId.
 *
 * ─── Query Prisma (1 round-trip) ─────────────────────────────────────
 *   Combina due indici esistenti con un OR logico:
 *     - `Order.id`            (PK lookup, formato cuid "ckxxx...")
 *     - `Order.providerOrderId` (`@@unique([paymentProvider, providerOrderId])`
 *       composito + `@@index([providerOrderId])` denormalizzato,
 *       namespace-prefixed "cs_test_..." / "cs_live_..." per Stripe)
 *
 *   Collision-free: i formati sono strutturalmente disjoint
 *   (cuid `ck*` vs Stripe `cs_*`) — lo stesso query plan NON può
 *   matchare due row diverse con lo stesso orderId perché lo stesso
 *   valore non può essere sia un cuid che uno Stripe session ID.
 *
 *   Note Prisma: `prisma.order.findFirst` ritorna la prima row che
 *   matcha l'OR. Per le due chiavi indicizzate, la latenza è
 *   comparabile al PK lookup.
 *
 * ─── Convenzioni ─────────────────────────────────────────────────────
 *   findCompletedOrderByOrderId({
 *     orderId,    // REQUIRED. Matched against `id` OR `providerOrderId`.
 *                 // Falsy → null difensivo.
 *     productId,  // REQUIRED. Scope check.
 *                 // Falsy → null difensivo.
 *   }): Promise<Order | null>
 *
 *   - Se `orderId` OR `productId` è falsy: ritorna `null` SENZA
 *     chiamare il DB. Difesa critica contro SQLi-class bugs: Prisma
 *     rimuove le chiavi `undefined` dal WHERE clause, quindi una
 *     query senza orderId potrebbe matchare l'Order.completed di
 *     QUALSIASI customer, e una senza productId potrebbe matchare
 *     l'Order di un prodotto DIVERSO. MAI fidarsi dell'invariante
 *     "entrambi sono sempre passati" — entrambi sono URL-derived.
 *   - Se la chiamata arriva al DB, ritorna l'Order completo oppure
 *     `null` se non esiste. NB: l'unico campo che i caller di oggi
 *     usano è la presenza (`if (order) return hasAccess: true`) —
 *     nessun consumer downstream accede a `.locale`/`.amount`/etc.
 *
 * ─── Cosa NON fa questo helper ───────────────────────────────────────
 *   - NON verifica user-membership (Pattern B ha bypass esplicito,
 *     perché è l'utente GUEST, non loggato).
 *   - NON verifica payment-provider integrity (la verifica della
 *     firma Stripe/LemonSqueezy sta nei webhook handlers).
 *   - NON gestisce admin bypass (per Pattern B l'admin non c'è —
 *     l'admin ha un suo path loggato tramite Pattern A).
 *
 * Performance:
 *   1 round-trip via `prisma.order.findFirst` con OR su 2 indici
 *   esistenti. Niente scan lineare.
 *
 * Best-practice note:
 *   Se un V2 codebase vuole ENTRAMBI i pattern (user-based + orderId-
 *   based) verificati in modo atomico, usare 2 helper separati come
 *   qui è la soluzione corretta (SSOTs distinti, defensive guards
 *   distinti, test matrix distinta). NON unificare in un'unica firma
 *   polymorphica.
 */
export interface FindCompletedOrderByOrderIdInput {
  /**
   * Order identifier. AMBIGUOUS by design: può essere l'internal
   * Prisma `Order.id` (cuid, formato "ckxxx...") OPPURE l'external
   * `Order.providerOrderId` (Stripe cs_test_..., LemonSqueezy
   * order_...). Il caller passa il valore verbatim dal URL/query;
   * il helper fa l'OR internamente. REQUIRED (falsy → null).
   */
  orderId: string;
  /**
   * Product.id (cuid). REQUIRED. Scope check: impedisce che
   * un orderId di un prodotto A sblocchi un prodotto B.
   * Falsy → null difensivo.
   */
  productId: string;
}

export async function findCompletedOrderByOrderId(
  input: FindCompletedOrderByOrderIdInput,
): Promise<Order | null> {
  // ── Defensive guard #1: orderId falsy → return null SENZA DB hit ──
  // Prisma rimuove le chiavi `undefined` dal WHERE. Senza questo check,
  // una query `orderId: undefined` risolverebbe l'OR a 0 match (entrambi
  // i rami degenerano a `false`), e il WHERE collassa a
  // `productId=X AND status="completed"` = primo Order.completed per
  // il prodotto X → cross-user data leak grave. MAI fidarsi che il
  // caller passi sempre un ordineId valido — viene da URL/query.
  if (!input.orderId) {
    return null;
  }

  const { orderId, productId } = input;

  // ── Defensive guard #2: productId falsy → return null SENZA DB hit ──
  // Stesso meccanismo Prisma: senza productId, il WHERE degenera a
  // `OR[id=...|providerOrderId=...] AND status="completed"` = un Order
  // completato per QUALSIASI prodotto. Un orderId legittimo di un
  // prodotto A potrebbe sbloccare l'accesso a un prodotto B (cross-
  // product scope-leak). MAI fidarsi che il caller passi sempre un
  // productId concreto.
  if (!productId) {
    return null;
  }

  return prisma.order.findFirst({
    where: {
      OR: [
        { providerOrderId: orderId },
        { id: orderId },
      ],
      productId,
      status: "completed",
    },
  });
}
