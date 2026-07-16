/**
 * src/lib/learning/prisma-watchlist-repository.ts
 *
 * Phase 2 Step 3 — Watchlist Prisma adapter.
 *
 * Adapter Layer (per ADR-0016 §1 dep direction). Imports the port
 * contract from `./watchlist-types`; exports a concrete implementation
 * of `WatchlistRepository`. The use case (`./watchlist`) NEVER
 * imports this file directly — it receives the adapter via dependency
 * injection.
 *
 * Schema reuse (no new table):
 *   - Watchlist rows are AccessGrant entries with
 *     `sourceType='watchlist'` + `sourceId='watchlist:${userId}:${productId}'`.
 *   - The @@unique([sourceType, sourceId, productId]) index makes
 *     concurrent upserts safe via Prisma's atomic path.
 *
 * Query shapes:
 *   1. findProductById      → Product.findUnique (existence check)
 *   2. upsertWatchlistGrant → 2-query pattern:
 *                                findFirst (alreadyAdded signal)
 *                                + atomic upsert (create OR reactivate)
 *   3. softDeleteWatchlistGrant → updateMany with status='active' filter
 *                                  (prevents double-revoke; idempotent)
 *   4. listActiveWatchlist  → findMany with include on Product +
 *                              ProductTranslation (locale-aware, fallback
 *                              to alphabetical)
 *
 * Translation resolution (locale handling) — mirrors continue-watching:
 *   - When caller provides a locale, it's a WHERE filter on
 *     ProductTranslation (1 row max).
 *   - When absent, take the FIRST translation alphabetically —
 *     deterministic fallback across renders.
 *
 * Defensive:
 *   - `if (!g.id) ...` not needed — accessGrant.id is non-null cuid.
 *   - `if (!p.id) ...` for findProductById: belt-and-braces against
 *     a future migration that might add nullability.
 */

import { prisma } from "@/lib/db/prisma";

import {
  WATCHLIST_SOURCE_TYPE,
  type WatchlistItem,
  type WatchlistRepository,
} from "./watchlist-types";

/**
 * Canonical Prisma adapter — the only implementation. Exported as a
 * module-level constant (singletons in the prisma client are already
 * managed via globalForPrisma so no overhead here).
 */
export const prismaWatchlistRepository: WatchlistRepository = {
  async findProductById(productId) {
    // Locale-aware nested translation config. When locale is provided,
    // it's a WHERE filter (1 row max). When not, pick the FIRST
    // translation alphabetically — deterministic fallback.
    const localization = (locale: string | undefined) =>
      locale
        ? { where: { locale, section: "titolo" }, take: 1 }
        : { orderBy: { locale: "asc" as const }, take: 1 };

    // We need to know the locale at call time, but the port doesn't
    // pass locale to findProductById. We read it from the inputs in
    // the upsertWatchlistGrant call. For findProductById alone
    // (404 check), we use no-locale fallback (alphabetical first
    // translation). The route can re-read via listActiveWatchlist
    // if it needs the locale-specific title.
    //
    // Defensive: cast locale to optional (the type accepts undefined).
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        slug: true,
        coverUrl: true,
        translations: localization(undefined),
      },
    });

    if (!product) return null;
    const titleTrans = product.translations[0];
    return {
      id: product.id,
      slug: product.slug,
      coverUrl: product.coverUrl ?? null,
      title: titleTrans?.content ?? product.slug,
    };
  },

  async upsertWatchlistGrant({ userId, productId, sourceId }) {
    // 2-query pattern: pre-check + upsert. Mirrors enroll-free-course.
    // The pre-check is the `alreadyAdded` signal (deterministic; not
    // relying on Prisma's @updatedAt behavior with empty `update`).
    //
    // CRITICAL: the pre-check filters `status: 'active'` so that
    // `alreadyAdded=true` means "an ACTIVE grant already existed"
    // (idempotent no-op write). A previously-revoked grant does NOT
    // count as already-added — its reactivation is a real state
    // change that the caller should know about. Without this filter,
    // the UI would incorrectly show "already added" when the user
    // just re-added a previously-revoked product. (Per Phase 2 step 3
    // code-reviewer feedback.)
    const existing = await prisma.accessGrant.findFirst({
      where: {
        sourceType: WATCHLIST_SOURCE_TYPE,
        sourceId,
        productId,
        status: "active",
      },
      select: { id: true },
    });
    const alreadyAdded = !!existing;

    // Upsert deliberately reactivates previously-revoked grants on
    // the same sourceId. The deterministic sourceId
    // (`watchlist:${userId}:${productId}`) guarantees that the
    // @@unique([sourceType, sourceId, productId]) index resolves
    // to the same row regardless of the user's previous state.
    const grant = await prisma.accessGrant.upsert({
      where: {
        sourceType_sourceId_productId: {
          sourceType: WATCHLIST_SOURCE_TYPE,
          sourceId,
          productId,
        },
      },
      create: {
        userId,
        productId,
        sourceType: WATCHLIST_SOURCE_TYPE,
        sourceId,
        status: "active",
      },
      update: {
        status: "active",
        revokedAt: null,
      },
      select: { id: true },
    });

    return { grantId: grant.id, alreadyAdded };
  },

  async softDeleteWatchlistGrant({ userId, productId }) {
    // Mirrors revoke-order.ts pattern: updateMany with status='active'
    // filter. Prevents double-revocation (revokedAt would otherwise
    // be re-stamped on every call).
    //
    // The userId + productId pair uniquely identifies the watchlist
    // grant (sourceId is derived from these). sourceType='watchlist'
    // filter scopes the update to watchlist entries only (defensive
    // against future sourceId collisions across sourceTypes).
    const now = new Date();
    const result = await prisma.accessGrant.updateMany({
      where: {
        userId,
        productId,
        sourceType: WATCHLIST_SOURCE_TYPE,
        status: "active",
      },
      data: {
        status: "revoked",
        revokedAt: now,
      },
    });

    return {
      revoked: result.count > 0,
      revokedAt: result.count > 0 ? now : null,
    };
  },

  async listActiveWatchlist({ userId, locale }) {
    // Locale-aware translation lookup. Mirrors continue-watching
    // pattern. Single Prisma query with `include` (no N+1).
    const localization = (whereExtra: object) =>
      locale
        ? { where: { locale, ...whereExtra }, take: 1 }
        : { orderBy: { locale: "asc" as const }, take: 1 };

    const grants = await prisma.accessGrant.findMany({
      where: {
        userId,
        sourceType: WATCHLIST_SOURCE_TYPE,
        status: "active",
      },
      orderBy: { grantedAt: "desc" },
      select: {
        grantedAt: true,
        product: {
          select: {
            id: true,
            slug: true,
            coverUrl: true,
            translations: localization({ section: "titolo" }),
          },
        },
      },
    });

    const items: WatchlistItem[] = [];
    for (const g of grants) {
      if (!g.product) continue; // belt-and-braces (FK ON DELETE RESTRICT)
      const titleTrans = g.product.translations[0];
      items.push({
        productId: g.product.id,
        slug: g.product.slug,
        title: titleTrans?.content ?? g.product.slug,
        coverUrl: g.product.coverUrl ?? null,
        grantedAt: g.grantedAt.toISOString(),
      });
    }
    return items;
  },
};