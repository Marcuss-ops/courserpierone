/**
 * src/domains/creator-ops/audience.ts
 *
 * Phase 3 Step 1 — `audience` read-model use case.
 *
 * Pure function: takes a creator + injected repository, returns the
 * aggregated `AudienceView`. Zero `@prisma/client` imports (Domain
 * layer stays testable without a DB).
 *
 * Domain rules:
 *   - Premium = sourceType in { order, admin, bundle }
 *   - Free    = sourceType === "free_enrollment"
 *   - Active  = user.lastSeenAt age in days <= inactiveAfterDays
 *              (null lastSeenAt → inactive; future → active, defensive
 *              against clock skew / manual override)
 *
 * Aggregation: 3 port-driven queries (products, grants+users, recent
 * grants) + AppJS Map dedupe → per-product + per-locale silhouettes.
 * Determinism: `now`, `inactiveAfterDays` are explicit inputs.
 *
 * ADR-0016 §1: `prismaAudienceRepository` is NOT re-exported here —
 * Domain MUST NOT transitively load Adapter modules. Consumers wire
 * via direct import from "./prisma-audience-repository".
 */

import type {
  AccessGrantSourceType,
  AudienceByLocale,
  AudienceByProduct,
  AudienceRepository,
  AudienceRecentSignup,
  AudienceView,
  BuildAudienceInput,
  RawAudienceGrant,
} from "./audience-types";

export {
  type AccessGrantSourceType,
  type AudienceByLocale,
  type AudienceByProduct,
  type AudienceRecentSignup,
  type AudienceRepository,
  type AudienceTotals,
  type AudienceView,
  type BuildAudienceInput,
  type RawAudienceGrant,
} from "./audience-types";

export const DEFAULT_INACTIVE_DAYS = 30;
export const DEFAULT_RECENT_SIGNUPS_LIMIT = 10;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const EMPTY_AUDIENCE: AudienceView = Object.freeze({
  totals: { enrollments: 0, premiumCustomers: 0, freeEnrollees: 0, activeUsers: 0, inactiveUsers: 0 },
  perProduct: [],
  perLocale: [],
  recentSignups: [],
});

export interface BuildAudienceDeps {
  repo: AudienceRepository;
}

function isPremiumSource(sourceType: AccessGrantSourceType): boolean {
  return (
    sourceType === "order" || sourceType === "admin" || sourceType === "bundle"
  );
}

function isFreeSource(sourceType: AccessGrantSourceType): boolean {
  return sourceType === "free_enrollment";
}

function normalizeInactiveDays(days: number | undefined): number {
  if (typeof days !== "number" || !Number.isFinite(days) || days <= 0) {
    return DEFAULT_INACTIVE_DAYS;
  }
  return Math.floor(days);
}

function isUserActive(
  lastSeenAt: Date | null,
  now: Date,
  inactiveAfterDays: number,
): boolean {
  if (!lastSeenAt) return false;
  const ageMs = now.getTime() - lastSeenAt.getTime();
  if (ageMs < 0) return true;
  return ageMs / MS_PER_DAY <= inactiveAfterDays;
}

// ─── Aggregation (pure, no DB) ────────────────────────────────────────

interface RowAccumulators {
  enrollments: number;
  premiumCustomers: number;
  freeEnrollees: number;
  activeUsers: number;
  inactiveUsers: number;
}

function emptyAcc(): RowAccumulators {
  return {
    enrollments: 0,
    premiumCustomers: 0,
    freeEnrollees: 0,
    activeUsers: 0,
    inactiveUsers: 0,
  };
}

function incrementProduct(
  row: RawAudienceGrant,
  acc: RowAccumulators,
  isActive: boolean,
): void {
  acc.enrollments++;
  if (isPremiumSource(row.sourceType)) acc.premiumCustomers++;
  else if (isFreeSource(row.sourceType)) acc.freeEnrollees++;
  if (isActive) acc.activeUsers++;
  else acc.inactiveUsers++;
}

export async function buildAudience(
  input: BuildAudienceInput,
  deps: BuildAudienceDeps,
): Promise<AudienceView> {
  if (!input.creatorId) return EMPTY_AUDIENCE;

  const now = input.now ?? new Date();
  const inactiveAfterDays = normalizeInactiveDays(input.inactiveAfterDays);
  const recentLimit = DEFAULT_RECENT_SIGNUPS_LIMIT;

  const products = await deps.repo.fetchCreatorProducts(input.creatorId);
  if (products.length === 0) return EMPTY_AUDIENCE;

  const productIds = products.map((p) => p.id);

  const [grants, recentGrants] = await Promise.all([
    deps.repo.fetchActiveGrantsWithUsers(productIds, input.locale),
    deps.repo.fetchRecentGrants(productIds, recentLimit),
  ]);

  const perProductMap = new Map<string, AudienceByProduct>();
  const perLocaleMap = new Map<string, AudienceByLocale>();
  const seenActiveUserIds = new Set<string>();
  const seenInactiveUserIds = new Set<string>();

  const totals: RowAccumulators = emptyAcc();

  for (const row of grants) {
    const isActive = isUserActive(row.lastSeenAt, now, inactiveAfterDays);

    let productBucket = perProductMap.get(row.productId);
    if (!productBucket) {
      productBucket = {
        productId: row.productId,
        productSlug: row.productSlug,
        productTitle: row.productTitle,
        ...emptyAcc(),
      };
      perProductMap.set(row.productId, productBucket);
    }
    incrementProduct(row, productBucket, isActive);

    const locale = row.locale ?? "unknown";
    let localeBucket = perLocaleMap.get(locale);
    if (!localeBucket) {
      localeBucket = { locale, ...emptyAcc() };
      perLocaleMap.set(locale, localeBucket);
    }
    incrementProduct(row, localeBucket, isActive);

    incrementProduct(row, totals, isActive);

    if (isActive) {
      if (!seenActiveUserIds.has(row.userId)) {
        seenActiveUserIds.add(row.userId);
      }
    } else {
      if (!seenInactiveUserIds.has(row.userId)) {
        seenInactiveUserIds.add(row.userId);
      }
    }
  }

  totals.activeUsers = seenActiveUserIds.size;
  totals.inactiveUsers = seenInactiveUserIds.size;

  const recentSignups: AudienceRecentSignup[] = recentGrants.map((r) => ({
    id: r.id,
    userId: r.userId,
    userName: r.userName,
    userImage: r.userImage,
    sourceType: r.sourceType,
    productId: r.productId,
    productSlug: r.productSlug,
    grantedAt: r.grantedAt,
  }));

  return {
    totals,
    perProduct: Array.from(perProductMap.values()).sort(
      (a, b) => b.enrollments - a.enrollments,
    ),
    perLocale: Array.from(perLocaleMap.values()).sort(
      (a, b) => b.enrollments - a.enrollments,
    ),
    recentSignups,
  };
}