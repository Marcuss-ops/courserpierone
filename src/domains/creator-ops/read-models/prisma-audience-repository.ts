/**
 * src/domains/creator-ops/read-models/prisma-audience-repository.ts
 *
 * Phase 3 Step 1 — Audience Prisma adapter (Adapter layer).
 *
 * Implements `AudienceRepository` (Domain port from `./audience-types`).
 * Three bounded round-trips per `buildAudience` call:
 *
 * 1. `fetchCreatorProducts(creatorId)` — creator's `Product` rows,
 *    scoped by `creatorId` directly. Hits `Product @@index([creatorId])`.
 *    Bounded by creator's product count (usually ≤ 50).
 *
 * 2. `fetchActiveGrantsWithUsers(productIds, locale)` — single-shot
 *    `accessGrant.findMany` for active grants on creator's products,
 *    with `User.preferredLocale` + `lastSeenAt` denormalized into
 *    each row. The locale parameter optionally filters both the
 *    ProductTranslation.title lookup AND ensures the join
 *    path remains indexed (no extra cost).
 *
 * 3. `fetchRecentGrants(productIds, take)` — last N grants ordered
 *    by `grantedAt DESC` for the "recent signups" feed widget.
 *
 * Determinism: ordering is enforced at the DB layer; ID + slug
 * combinations are deterministic.
 *
 * Indexes used:
 *   - Product  @@index([creatorId, status])
 *   - AccessGrant  @@index([userId, productId, status])
 *   - User  PK lookup by id (via include)
 */

import { prisma } from "@/lib/db/prisma";

import type {
  AccessGrantSourceType,
  AudienceRepository,
  RawAudienceGrant,
  RawAudienceRecentGrant,
} from "./audience-types";

/**
 * Canonical Prisma adapter — module-level const, mirrors the
 * `prismaContinueWatchingRepository` + `prismaFeedRepository`
 * patterns. Singleton-safe via the `globalForPrisma` pattern in
 * `@/lib/db/prisma` (no extra instantiation here).
 */
export const prismaAudienceRepository: AudienceRepository = {
  async fetchCreatorProducts(creatorId) {
    const products = await prisma.product.findMany({
      where: { creatorId },
      select: {
        id: true,
        slug: true,
        defaultLanguage: true,
      },
      orderBy: { createdAt: "asc" },
    });
    return products;
  },

  async fetchActiveGrantsWithUsers(productIds, locale) {
    if (productIds.length === 0) return [];

    const localization = (whereExtra: object) =>
      locale
        ? { where: { locale, ...whereExtra }, take: 1 }
        : { orderBy: { locale: "asc" as const }, where: whereExtra, take: 1 };

    const grants = await prisma.accessGrant.findMany({
      where: {
        productId: { in: [...productIds] },
        status: "active",
      },
      // No orderBy — AppJS aggregation is order-insensitive on this
      // query (the Map dedupe + per-product+per-locale breakdowns
      // don't depend on input order). Saves a sort cost.
      include: {
        user: {
          select: {
            id: true,
            preferredLocale: true,
            lastSeenAt: true,
          },
        },
        product: {
          select: {
            id: true,
            slug: true,
            translations: localization({ section: "titolo" }),
          },
        },
      },
    });

    const result: RawAudienceGrant[] = [];
    for (const g of grants) {
      const productTrans = g.product.translations[0];
      const sourceType = g.sourceType as AccessGrantSourceType;
      result.push({
        id: g.id,
        sourceType,
        productId: g.productId,
        productSlug: g.product.slug,
        productTitle: productTrans?.content ?? g.product.slug,
        grantedAt: g.grantedAt,
        userId: g.userId,
        locale: g.user.preferredLocale ?? null,
        lastSeenAt: g.user.lastSeenAt ?? null,
      });
    }
    return result;
  },

  async fetchRecentGrants(productIds, take) {
    if (productIds.length === 0 || take <= 0) return [];

    const grants = await prisma.accessGrant.findMany({
      where: {
        productId: { in: [...productIds] },
        status: "active",
      },
      orderBy: { grantedAt: "desc" },
      take,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
        product: {
          select: {
            id: true,
            slug: true,
          },
        },
      },
    });

    return grants.map((g): RawAudienceRecentGrant => {
      const sourceType = g.sourceType as AccessGrantSourceType;
      return {
        id: g.id,
        sourceType,
        productId: g.productId,
        productSlug: g.product.slug,
        grantedAt: g.grantedAt,
        userId: g.userId,
        userName: g.user.name ?? null,
        userImage: g.user.image ?? null,
      };
    });
  },
};
