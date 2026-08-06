/**
 * src/domains/catalog/content-pages/prisma-reorder-content-pages-repository.ts
 *
 * Prisma adapter for `ReorderContentPagesPort` (MCR Phase 1 —
 * Notion-like pages feature, sibling-renumber flow).
 *
 * ─── Adapter Layer (per ADR-0016 §1 dep direction) ──────────────
 *
 * Implements the port contract declared in
 * `./reorder-content-pages-types`:
 *
 *   1. `findProductOwner` — single read of `Product.creatorId`
 *      for the ownership guard.
 *
 *   2. `listContentPagesInScope` — single read returning the
 *      COMPLETE set of `ContentPage.id` rows under the
 *      `(productId, parentId)` scope. The use case calls this
 *      BEFORE the batch to compute invariant checks
 *      (scope_mismatch / incomplete_set).
 *
 *   3. `applyReorder` — atomic batch UPDATE of positions for
 *      the sibling group. See "The $transaction shape" section
 *      below for the chosen strategy.
 *
 * ─── The $transaction shape (N UPDATEs in one transaction) ──────
 *
 * The use case's port contract specifies "atomic batch UPDATE".
 * Two valid SQL shapes satisfy this:
 *
 *   (a) `$transaction(entries.map(prisma.contentPage.update))`
 *       — N round-trips, one UPDATE per row. Pros: simple,
 *       readable, leverages the existing typed Prisma model,
 *       uses `@@index([productId, parentId, position])` for
 *       each row. Cons: O(N) round-trips.
 *
 *   (b) `$executeRaw` with a single CASE-WHEN bulk UPDATE —
 *       one round-trip total. Pros: 1 SQL statement. Cons:
 *       untyped (no Prisma type safety on the column names),
 *       harder to read, more brittle to schema drift.
 *
 * We chose (a). The batch max is REORDER_BATCH_MAX = 1000
 * (declared in the port's types file); 1000 UPDATEs inside a
 * single PG transaction is well under the threshold for
 * round-trip overhead (a few hundred ms in the worst case,
 * irrelevant for a creator editor action that fires once per
 * drag gesture). The CASE-WHEN optimisation can ship as a
 * follow-up if telemetry ever flags the round-trip count.
 *
 * Concurrency safety:
 *   - A transaction-scoped advisory lock serializes reorder and create
 *     operations for the same `(productId, parentId)` scope.
 *   - Temporary negative positions avoid collisions with the unique
 *     sibling-position indexes during a permutation.
 *   - The transaction's all-or-nothing semantics guarantee the renumber
 *     is either fully applied or fully rolled back.
 *
 * ─── Error mapping ──────────────────────────────────────────────
 *
 *   - `P2025` (RecordNotFound) — should be unreachable here
 *     because the use case pre-verifies every `pageId` belongs
 *     to the scope. If it fires (race: page was deleted between
 *     the use case's pre-check and the UPDATE), the
 *     `$transaction` rolls back automatically and the error
 *     bubbles — the use case's invariant check would have
 *     caught the deletion in the next call.
 *
 *   - Any other error (connection, FK violation) → bubble to
 *     the route's `apiErrorResponse` for 500. The transaction
 *     rolls back on bubble.
 *
 * ─── `updatedAt` write ─────────────────────────────────────────
 *
 * Each per-row UPDATE also sets `updatedAt = now`. The schema
 * declares `updatedAt DateTime @updatedAt`, so Prisma would
 * auto-write it even without explicit setting. The explicit
 * write uses the SAME `now` for ALL rows in the batch — this
 * guarantees batch-internal consistency (every row shows the
 * same edit timestamp on a single drag gesture), which is
 * useful for audit logs and for the editor's "last edited"
 * indicator.
 */

import { prisma } from "@/lib/db/prisma";

import type {
  ReorderContentPagesPort,
} from "./reorder-content-pages-types";

// ─── Adapter ────────────────────────────────────────────────────

/**
 * Canonical Prisma adapter — the only implementation. Wired
 * into the route composition root via the `port` dependency
 * injection parameter on `reorderContentPages(input, { port })`.
 */
export const prismaReorderContentPagesRepository: ReorderContentPagesPort = {
  // ─── findProductOwner ───────────────────────────────────────
  //
  // Single `findUnique` keyed by product PK. Returns `null`
  // when the product doesn't exist — the use case translates
  // to `not_found`. We `select` only `creatorId` (the use case
  // doesn't need `defaultLanguage` for reorder — the locale
  // resolution is a rename-only concern).
  async findProductOwner({ productId }) {
    if (!productId) return null;
  const row = await prisma.product.findFirst({
    where: { id: productId, deletedAt: null },
      select: { creatorId: true },
    });
    if (!row) return null;
    return { creatorId: row.creatorId };
  },

  // ─── listContentPagesInScope ────────────────────────────────
  //
  // Single `findMany` filtered by `(productId, parentId)`.
  //
  // `parentId: null` is the legitimate "top-level scope"
  // sentinel, NOT "all scopes". Prisma's `where: { parentId:
  // null }` correctly matches only top-level pages (PG IS NULL
  // semantics). The `select` keeps the response minimal — the
  // use case only needs the pageId set for the scope_mismatch
  // and incomplete_set checks.
  async listContentPagesInScope({ productId, parentId }) {
    if (!productId) return { pageIds: [] };
    const rows = await prisma.contentPage.findMany({
      where: { productId, parentId },
      select: { id: true },
      orderBy: { position: "asc" },
    });
    return { pageIds: rows.map((r) => r.id) };
  },

  // ─── applyReorder ───────────────────────────────────────────
  //
  // The unique sibling-position indexes make a direct permutation unsafe:
  // updating 1 → 3 fails while the old row at 3 still exists. We therefore
  // use one transaction with a scope advisory lock and two phases:
  // temporary negative positions, then the requested final positions.
  async applyReorder({ productId, parentId, entries, now }) {
    if (entries.length === 0) {
      // Defensive: the use case rejects empty batches at
      // reorderEntriesSchema (REORDER_BATCH_MIN = 1). If a
      // future caller bypasses the schema, returning success
      // for an empty batch is the safe no-op.
      return { applied: true };
    }

    await prisma.$transaction(async (tx) => {
      const lockKey = `${productId}:${parentId ?? "root"}`;
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))
      `;

      await Promise.all(
        entries.map((entry, index) =>
          tx.contentPage.update({
            where: { id: entry.pageId },
            data: {
              position: -(index + 1),
              updatedAt: now,
            },
          }),
        ),
      );

      await Promise.all(
        entries.map((entry) =>
          tx.contentPage.update({
            where: { id: entry.pageId },
            data: {
              position: entry.newPosition,
              updatedAt: now,
            },
          }),
        ),
      );
    });
    return { applied: true };
  },
};
