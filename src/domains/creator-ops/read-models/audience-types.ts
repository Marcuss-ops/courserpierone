/**
 * src/domains/creator-ops/read-models/audience-types.ts
 *
 * Phase 3 — Creator Studio. Step 1 of 4 read-models (ADR-0016 §3).
 *
 * Goal: ONE canonical read-model for "what does the audience look
 * like for this creator?" — feeds the /creator/audience page (and any
 * creator-side reporting widget). Decomposed for ADR-0016 §1 dep
 * direction: this file is the Domain layer (types + Port), the
 * Prisma adapter is the sibling file `prisma-audience-repository.ts`,
 * and the pure use case lives in `./audience.ts`.
 *
 * Domain definitions (per Phase 3 spec):
 *   - "Premium": AccessGrant with sourceType in { order, admin, bundle }
 *     (any non-free source = monetized acquisition)
 *   - "Free":    AccessGrant with sourceType === "free_enrollment"
 *   - "Active":  User.lastSeenAt is within `inactiveAfterDays` of `now`
 *                (default 30 days — industry-standard SaaS cadence)
 *   - "Inactive": lastSeenAt null OR older than threshold
 *
 * Conventions inherited from ADR-0016:
 *   - Deterministic: now + inactiveAfterDays are explicit inputs, no
 *     live clock in the use case.
 *   - 0 N+1: per-product + per-locale breakdowns AppJS-aggregated from
 *     a bounded 1-query load (no queries inside loops).
 *   - Test-stub friendly: `AudienceRepository` port is the single
 *     seam; the canonical Prisma adapter lives in a sibling file.
 *
 * Why not put this in /dashboard/creator/: the user spec splits
 * creator-side pages into 4 distinct read-models (audience, inbox,
 * analytics, contents). Centralizing them under
 * `src/domains/creator-ops/read-models/` keeps the Domain layer
 * discoverable and lets multiple UIs (dashboard + future admin
 * analytics + future reporting) consume the same projection.
 */

// ─── Output shape ─────────────────────────────────────────────────────

export interface AudienceTotals {
  enrollments: number;
  premiumCustomers: number;
  freeEnrollees: number;
  activeUsers: number;
  inactiveUsers: number;
}

export interface AudienceByProduct {
  productId: string;
  productSlug: string;
  productTitle: string;
  enrollments: number;
  premiumCustomers: number;
  freeEnrollees: number;
  activeUsers: number;
  inactiveUsers: number;
}

export interface AudienceByLocale {
  locale: string;
  enrollments: number;
  premiumCustomers: number;
  freeEnrollees: number;
  activeUsers: number;
  inactiveUsers: number;
}

export interface AudienceRecentSignup {
  /** AccessGrant.id — useful for click-through attribution
   *  (admin actions, "view grant" link, dedupe keys). */
  id: string;
  userId: string;
  userName: string | null;
  userImage: string | null;
  sourceType: AccessGrantSourceType;
  productId: string;
  productSlug: string;
  grantedAt: Date;
}

/**
 * Aggregated audience projection. Returned by `buildAudience` use
 * case. UI consumers render the breakdown bottom-up — totals first,
 * then per-product drill-down, then per-locale chart, then a
 * "recent signups" feed.
 */
export interface AudienceView {
  totals: AudienceTotals;
  perProduct: AudienceByProduct[];
  perLocale: AudienceByLocale[];
  recentSignups: AudienceRecentSignup[];
}

// ─── Input shape ──────────────────────────────────────────────────────

export type AccessGrantSourceType =
  | "order"
  | "free_enrollment"
  | "admin"
  | "bundle";

export interface BuildAudienceInput {
  /** Creator's User.id (REQUIRED — defensive empty returns empty view). */
  creatorId: string;
  /**
   * Inactive threshold in days. Users with `lastSeenAt` older than
   * this (or `null`) count as inactive. Default = 30 days.
   * Industry-standard for monthly-cadence SaaS/EdTech metrics.
   */
  inactiveAfterDays?: number;
  /** Injectable "now" for test reproducibility. Default = new Date(). */
  now?: Date;
  /**
   * Optional locale filter for product title resolution. When
   * absent, the adapter picks the FIRST translation alphabetically.
   */
  locale?: string;
}

// ─── Port contract (adapter boundary) ────────────────────────────────

/**
 * Raw row returned by the adapter — internal DTO between the
 * adapter and the use case. Mirrors what the Prisma query returns
 * with deep includes, minus Prisma-specific types. Kept local so
 * adapter evolution stays inside this module.
 */
export interface RawAudienceGrant {
  id: string;
  sourceType: AccessGrantSourceType;
  productId: string;
  productSlug: string;
  productTitle: string;
  grantedAt: Date;
  userId: string;
  /** User.preferredLocale — pulled at grant-fetch time (denormalized
   *  into the use case's perLocale aggregation, no second join). */
  locale: string | null;
  /** User.lastSeenAt — pulled at grant-fetch time (denormalized
   *  into the active/inactive aggregation, no second join). */
  lastSeenAt: Date | null;
}

export interface RawAudienceRecentGrant {
  id: string;
  sourceType: AccessGrantSourceType;
  productId: string;
  productSlug: string;
  grantedAt: Date;
  userId: string;
  userName: string | null;
  userImage: string | null;
}

/**
 * Adapter port (3 bounded queries per creator). Stubbed in tests
 * via the in-file `mkStubAudienceRepo()` helper.
 *
 * Query budget (per creator view):
 *   1. fetchCreatorProducts     → creator's product list (bounded)
 *   2. fetchActiveGrantsWithUsers → flat grants w/ user minimal data
 *   3. fetchRecentGrants        → last N grants ordered by grantedAt DESC
 *
 * These three aggregations cover totals + per-product + per-locale
 * + recent signups via AppJS deduplication. NEVER queries inside a
 * loop. Cap on grants bounded by the creator's customer base (no
 * pagination in V1; YAGNI for non-enterprise creators).
 */
export interface AudienceRepository {
  fetchCreatorProducts(creatorId: string): Promise<
    {
      id: string;
      slug: string;
      defaultLanguage: string;
    }[]
  >;
  fetchActiveGrantsWithUsers(
    productIds: readonly string[],
    locale: string | undefined,
  ): Promise<RawAudienceGrant[]>;
  fetchRecentGrants(
    productIds: readonly string[],
    take: number,
  ): Promise<RawAudienceRecentGrant[]>;
}
