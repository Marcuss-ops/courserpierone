import { prisma } from "@/lib/db/prisma";
import type { Order } from "@prisma/client";

/**
 * src/lib/access/find-completed-order.ts
 *
 * @deprecated
 *
 * Replaced by `resolveProductAccess` in
 * `src/lib/commerce/access/resolve-product-access.ts` — the new
 * central resolver reads `AccessGrant.status="active"` (post-MCR
 * Phase 3 cutover). `Order.findFirst({status: "completed"})` is no
 * longer the source of truth for product access.
 *
 * Use `resolveProductAccess({userId, productId})` for all new
 * authorization checks (returns a `{allowed, grantId} | {allowed:
 * false, reason}` discriminated union — `findCompletedOrder` returns
 * a raw `Order | null`, which is a type-level leak of the legacy
 * payment table into a security-sensitive read).
 *
 * This helper is kept ONLY for legacy consumers that still need the
 * full `Order` row (e.g., the `locale` field on the certificate
 * route). A future V2 cleanup will migrate every consumer to
 * `resolveProductAccess` + a dedicated read of any post-access UI
 * metadata.
 *
 * ─── One-shot deprecation tripwire ────────────────────────────
 *
 * `console.warn` fires ONCE per process (memoized via module-level
 * boolean) so consumers see the migration signal in production logs
 * without flooding the stream. The message points to the canonical
 * replacement + the commit that introduced the cutover.
 *
 * ─── Historic doc ────────────────────────────────────────────
 *
 * V2 DRY refactor that consolidated 5 AccessGate paths in a single
 * DB helper:
 *   - src/app/api/access/route.ts              (Pattern A user-based)
 *   - src/app/api/certificate/[productId]/route.ts
 *   - src/app/api/ebook/[slug]/download/route.ts
 *   - src/app/api/videos/stream/route.ts
 *   - src/app/api/progress/route.ts            (POST handler)
 *
 * The behavior below is preserved bit-for-bit for the legacy
 * consumers until the V2 migration completes. Do NOT add new
 * callers — go through `resolveProductAccess`.
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

let _deprecationWarned = false;
function emitDeprecationWarning(): void {
  if (_deprecationWarned) return;
  _deprecationWarned = true;
  console.warn(
    "[deprecated] findCompletedOrder called — migrate to resolveProductAccess " +
      "(src/lib/commerce/access/resolve-product-access.ts). " +
      "MCR Phase 3 cutover landed: AccessGrant is the SSOT.",
  );
}

export async function findCompletedOrder(
  input: FindCompletedOrderInput,
): Promise<Order | null> {
  emitDeprecationWarning();

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
