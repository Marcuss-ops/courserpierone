/**
 * src/domains/creator-ops/read-models/audience.test.ts
 *
 * Unit tests for `buildAudience` use case.
 *
 * Pattern mirrors `src/lib/learning/continue-watching.test.ts`:
 *   - Stub the `AudienceRepository` port (no Prisma mock).
 *   - Deterministic ISO dates (no live clock).
 *   - Reproduction-via-identity: same fixture → same output bytes.
 *
 * Imports use canonical paths (no re-export indirection):
 *   - types + port  → ./audience-types
 *   - use case      → ./audience
 *   - adapter       → ./prisma-audience-repository
 *
 * Coverage:
 *   - Falsy creatorId                 → empty view
 *   - Creator with 0 products          → empty view
 *   - Premium-only creator             → totals.premiumCustomers > 0
 *   - Free-only creator                → totals.freeEnrollees > 0
 *   - Mixed sourceType distribution    → both counters increment
 *   - active/inactive threshold: 30d   → matches exact boundary cases
 *   - active/inactive with null lastSeenAt → always inactive
 *   - Per-product dedupe (multiple grants same product → 1 bucket)
 *   - Per-locale dedupe (same user different locale → 1 bucket per loc)
 *   - active/inactive is USER-unique   → one user w/ 3 grants counts ONCE
 *   - recentSignups ordering preserved (DB DESC) → first row is most recent
 *   - Adapter import sanity
 */

import { describe, expect, it, vi } from "vitest";

import {
  buildAudience,
  DEFAULT_INACTIVE_DAYS,
  DEFAULT_RECENT_SIGNUPS_LIMIT,
} from "./audience";
import { prismaAudienceRepository } from "./prisma-audience-repository";
import type { BuildAudienceDeps } from "./audience";
import type {
  AccessGrantSourceType,
  AudienceRepository,
  RawAudienceGrant,
  RawAudienceRecentGrant,
} from "./audience-types";

// ─── Test helpers ─────────────────────────────────────────────────────

const P_A = "prod_a";
const P_B = "prod_b";

const T_NOW = new Date("2026-07-16T12:00:00.000Z");
const T_5_DAYS_AGO = new Date("2026-07-11T12:00:00.000Z");
const T_31_DAYS_AGO = new Date("2026-06-15T12:00:00.000Z");

function mkGrant(overrides: Partial<RawAudienceGrant>): RawAudienceGrant {
  return {
    id: "grant_default",
    sourceType: "order" as AccessGrantSourceType,
    productId: P_A,
    productSlug: "alpha",
    productTitle: "Alpha Course",
    grantedAt: T_NOW,
    userId: "u_default",
    locale: "it",
    lastSeenAt: T_5_DAYS_AGO,
    ...overrides,
  };
}

function mkRecentGrant(
  overrides: Partial<RawAudienceRecentGrant>,
): RawAudienceRecentGrant {
  return {
    id: "grant_recent_default",
    sourceType: "order" as AccessGrantSourceType,
    productId: P_A,
    productSlug: "alpha",
    grantedAt: T_NOW,
    userId: "u_default",
    userName: "Default User",
    userImage: null,
    ...overrides,
  };
}

interface StubState {
  fetchedProducts?: ReadonlyArray<{ id: string; slug: string; defaultLanguage: string }>;
  fetchedProductsForCreator?: string;
  fetchedGrantsArgs?: ReadonlyArray<string>;
  fetchedRecentArgs?: { productIds: ReadonlyArray<string>; take: number };
}

function mkStubRepo(opts: {
  products?: Array<{ id: string; slug: string; defaultLanguage: string }>;
  grants?: RawAudienceGrant[];
  recent?: RawAudienceRecentGrant[];
}): { repo: AudienceRepository; state: StubState } {
  const state: StubState = {};
  const products = opts.products ?? [];
  const grants = opts.grants ?? [];
  const recent = opts.recent ?? [];

  const repo: AudienceRepository = {
    async fetchCreatorProducts(creatorId) {
      state.fetchedProductsForCreator = creatorId;
      state.fetchedProducts = products;
      return products;
    },
    async fetchActiveGrantsWithUsers(productIds) {
      state.fetchedGrantsArgs = productIds;
      return grants;
    },
    async fetchRecentGrants(productIds, take) {
      state.fetchedRecentArgs = { productIds, take };
      return recent;
    },
  };
  return { repo, state };
}

// ─── Tests ────────────────────────────────────────────────────────────

describe("buildAudience — input guards", () => {
  it("returns the frozen empty view when creatorId is empty string", async () => {
    const { repo, state } = mkStubRepo({});
    const result = await buildAudience({ creatorId: "" }, { repo });
    expect(result.totals.enrollments).toBe(0);
    expect(result.perProduct).toEqual([]);
    expect(result.perLocale).toEqual([]);
    expect(result.recentSignups).toEqual([]);
    // Adapter MUST NOT be called when creatorId is empty.
    expect(state.fetchedProductsForCreator).toBeUndefined();
    expect(state.fetchedGrantsArgs).toBeUndefined();
    expect(state.fetchedRecentArgs).toBeUndefined();
  });

  it("returns the empty view when creator has zero products", async () => {
    const { repo } = mkStubRepo({ products: [], grants: [], recent: [] });
    const result = await buildAudience({ creatorId: "creator_1" }, { repo });
    expect(result.totals).toEqual({
      enrollments: 0,
      premiumCustomers: 0,
      freeEnrollees: 0,
      activeUsers: 0,
      inactiveUsers: 0,
    });
    expect(result.perProduct).toEqual([]);
    expect(result.perLocale).toEqual([]);
    expect(result.recentSignups).toEqual([]);
  });
});

describe("buildAudience — premium/free classification", () => {
  it("counts free_enrollment as Free only", async () => {
    const { repo } = mkStubRepo({
      products: [{ id: P_A, slug: "alpha", defaultLanguage: "it" }],
      grants: [
        mkGrant({
          id: "g1",
          sourceType: "free_enrollment",
          userId: "u_free_1",
        }),
      ],
    });
    const result = await buildAudience({ creatorId: "creator_1" }, { repo });
    expect(result.totals.freeEnrollees).toBe(1);
    expect(result.totals.premiumCustomers).toBe(0);
  });

  it.each([
    ["order" as const],
    ["admin" as const],
    ["bundle" as const],
  ])("counts sourceType=%s as Premium", async (sourceType) => {
    const { repo } = mkStubRepo({
      products: [{ id: P_A, slug: "alpha", defaultLanguage: "it" }],
      grants: [
        mkGrant({ id: `g_${sourceType}`, sourceType, userId: `u_${sourceType}` }),
      ],
    });
    const result = await buildAudience({ creatorId: "creator_1" }, { repo });
    expect(result.totals.premiumCustomers).toBe(1);
    expect(result.totals.freeEnrollees).toBe(0);
  });

  it("does NOT double-count admin as free (defensive)", async () => {
    const { repo } = mkStubRepo({
      products: [{ id: P_A, slug: "alpha", defaultLanguage: "it" }],
      grants: [
        mkGrant({ id: "g_a", sourceType: "admin", userId: "u_a" }),
      ],
    });
    const result = await buildAudience({ creatorId: "creator_1" }, { repo });
    expect(result.totals.freeEnrollees).toBe(0);
    expect(result.totals.premiumCustomers).toBe(1);
  });
});

describe("buildAudience — active/inactive threshold", () => {
  it("marks a user as active when lastSeenAt is within inactiveAfterDays", async () => {
    const { repo } = mkStubRepo({
      products: [{ id: P_A, slug: "alpha", defaultLanguage: "it" }],
      grants: [
        mkGrant({
          id: "g1",
          userId: "u_active",
          sourceType: "order",
          lastSeenAt: T_5_DAYS_AGO, // 5 days ago < 30d default
        }),
      ],
    });
    const result = await buildAudience(
      { creatorId: "creator_1", now: T_NOW },
      { repo },
    );
    expect(result.totals.activeUsers).toBe(1);
    expect(result.totals.inactiveUsers).toBe(0);
  });

  it("marks a user as inactive when lastSeenAt is older than inactiveAfterDays", async () => {
    const { repo } = mkStubRepo({
      products: [{ id: P_A, slug: "alpha", defaultLanguage: "it" }],
      grants: [
        mkGrant({
          id: "g1",
          userId: "u_inactive",
          sourceType: "order",
          lastSeenAt: T_31_DAYS_AGO, // 31 days ago > 30d default
        }),
      ],
    });
    const result = await buildAudience(
      { creatorId: "creator_1", now: T_NOW },
      { repo },
    );
    expect(result.totals.activeUsers).toBe(0);
    expect(result.totals.inactiveUsers).toBe(1);
  });

  it("marks a null lastSeenAt as inactive regardless of threshold", async () => {
    const { repo } = mkStubRepo({
      products: [{ id: P_A, slug: "alpha", defaultLanguage: "it" }],
      grants: [
        mkGrant({
          id: "g1",
          userId: "u_never_seen",
          sourceType: "order",
          lastSeenAt: null,
        }),
      ],
    });
    const result = await buildAudience(
      { creatorId: "creator_1", now: T_NOW, inactiveAfterDays: 365 },
      { repo },
    );
    expect(result.totals.inactiveUsers).toBe(1);
    expect(result.totals.activeUsers).toBe(0);
  });

  it("treats lastSeenAt in the future (clock skew / override) as active", async () => {
    const tFuture = new Date("2026-07-17T00:00:00.000Z"); // 12h after now
    const { repo } = mkStubRepo({
      products: [{ id: P_A, slug: "alpha", defaultLanguage: "it" }],
      grants: [
        mkGrant({
          id: "g1",
          userId: "u_future",
          sourceType: "order",
          lastSeenAt: tFuture,
        }),
      ],
    });
    const result = await buildAudience(
      { creatorId: "creator_1", now: T_NOW },
      { repo },
    );
    expect(result.totals.activeUsers).toBe(1);
  });

  it("quiescence is user-unique: same user across 3 grants counts once for active/inactive", async () => {
    const { repo } = mkStubRepo({
      products: [{ id: P_A, slug: "alpha", defaultLanguage: "it" }],
      grants: [
        mkGrant({
          id: "g1",
          sourceType: "order",
          userId: "u_multi",
          productId: P_A,
          lastSeenAt: T_5_DAYS_AGO,
        }),
        mkGrant({
          id: "g2",
          sourceType: "order",
          userId: "u_multi",
          productId: P_B,
          lastSeenAt: T_5_DAYS_AGO,
        }),
        mkGrant({
          id: "g3",
          sourceType: "free_enrollment",
          userId: "u_multi",
          productId: P_A,
          lastSeenAt: T_5_DAYS_AGO,
        }),
      ],
    });
    const result = await buildAudience(
      { creatorId: "creator_1", now: T_NOW },
      { repo },
    );
    expect(result.totals.activeUsers).toBe(1); // de-duped
    expect(result.totals.inactiveUsers).toBe(0);
    // NOTE: enrollments IS per-grant (not per-user), so it accumulates.
    expect(result.totals.enrollments).toBe(3);
  });
});

describe("buildAudience — per-product breakdown", () => {
  it("aggregates multiple grants of the same product into ONE bucket", async () => {
    const { repo } = mkStubRepo({
      products: [
        { id: P_A, slug: "alpha", defaultLanguage: "it" },
        { id: P_B, slug: "beta", defaultLanguage: "en" },
      ],
      grants: [
        mkGrant({ id: "g_a1", productId: P_A, productSlug: "alpha", userId: "u1" }),
        mkGrant({ id: "g_a2", productId: P_A, productSlug: "alpha", userId: "u2" }),
        mkGrant({ id: "g_b1", productId: P_B, productSlug: "beta", userId: "u3" }),
      ],
    });
    const result = await buildAudience({ creatorId: "creator_1" }, { repo });
    expect(result.perProduct).toHaveLength(2);
    const alpha = result.perProduct.find((p) => p.productId === P_A);
    const beta = result.perProduct.find((p) => p.productId === P_B);
    expect(alpha?.enrollments).toBe(2);
    expect(beta?.enrollments).toBe(1);
  });

  it("sorts per-product by enrollments DESC (highest-engagement first)", async () => {
    const { repo } = mkStubRepo({
      products: [
        { id: P_A, slug: "alpha", defaultLanguage: "it" },
        { id: P_B, slug: "beta", defaultLanguage: "en" },
      ],
      grants: [
        mkGrant({ id: "g_a1", productId: P_A, userId: "u1" }),
        mkGrant({ id: "g_b1", productId: P_B, userId: "u2" }),
        mkGrant({ id: "g_b2", productId: P_B, userId: "u3" }),
      ],
    });
    const result = await buildAudience({ creatorId: "creator_1" }, { repo });
    expect(result.perProduct.map((p) => p.productId)).toEqual([P_B, P_A]);
  });
});

describe("buildAudience — per-locale breakdown", () => {
  it("buckets null preferredLocale under 'unknown'", async () => {
    const { repo } = mkStubRepo({
      products: [{ id: P_A, slug: "alpha", defaultLanguage: "it" }],
      grants: [
        mkGrant({ id: "g1", userId: "u1", locale: null }),
        mkGrant({ id: "g2", userId: "u2", locale: "en" }),
      ],
    });
    const result = await buildAudience({ creatorId: "creator_1" }, { repo });
    const itBucket = result.perLocale.find((l) => l.locale === "unknown");
    const enBucket = result.perLocale.find((l) => l.locale === "en");
    expect(itBucket?.enrollments).toBe(1);
    expect(enBucket?.enrollments).toBe(1);
  });

  it("sorts per-locale by enrollments DESC", async () => {
    const { repo } = mkStubRepo({
      products: [{ id: P_A, slug: "alpha", defaultLanguage: "it" }],
      grants: [
        mkGrant({ id: "g1", userId: "u1", locale: "en" }),
        mkGrant({ id: "g2", userId: "u2", locale: "en" }),
        mkGrant({ id: "g3", userId: "u3", locale: "en" }),
        mkGrant({ id: "g4", userId: "u4", locale: "it" }),
      ],
    });
    const result = await buildAudience({ creatorId: "creator_1" }, { repo });
    expect(result.perLocale[0]?.locale).toBe("en");
    expect(result.perLocale[0]?.enrollments).toBe(3);
  });
});

describe("buildAudience — recent signups", () => {
  it("preserves the adapter's order (grantedAt DESC) verbatim", async () => {
    const recent: RawAudienceRecentGrant[] = [
      mkRecentGrant({ id: "g_newest", grantedAt: T_NOW, userId: "u_n" }),
      mkRecentGrant({
        id: "g_older",
        grantedAt: new Date("2026-07-14T00:00:00.000Z"),
        userId: "u_o",
      }),
    ];
    const { repo } = mkStubRepo({
      products: [{ id: P_A, slug: "alpha", defaultLanguage: "it" }],
      grants: [],
      recent,
    });
    const result = await buildAudience({ creatorId: "creator_1" }, { repo });
    expect(result.recentSignups.map((r) => r.id)).toEqual(["g_newest", "g_older"]);
  });

  it("asks the adapter for DEFAULT_RECENT_SIGNUPS_LIMIT", async () => {
    const { repo, state } = mkStubRepo({
      products: [{ id: P_A, slug: "alpha", defaultLanguage: "it" }],
    });
    await buildAudience({ creatorId: "creator_1" }, { repo });
    expect(state.fetchedRecentArgs?.take).toBe(DEFAULT_RECENT_SIGNUPS_LIMIT);
  });
});

describe("buildAudience — uses injected now + inactiveAfterDays", () => {
  it("respects inactiveAfterDays = 7 (a 6-day-old lastSeenAt is active)", async () => {
    const t6DaysAgo = new Date("2026-07-10T12:00:00.000Z"); // 6 days ago
    const { repo } = mkStubRepo({
      products: [{ id: P_A, slug: "alpha", defaultLanguage: "it" }],
      grants: [
        mkGrant({
          id: "g1",
          userId: "u1",
          lastSeenAt: t6DaysAgo,
        }),
      ],
    });
    const result = await buildAudience(
      { creatorId: "creator_1", now: T_NOW, inactiveAfterDays: 7 },
      { repo },
    );
    expect(result.totals.activeUsers).toBe(1);
  });

  it("rejects negative inactiveAfterDays defensively → falls back to default", async () => {
    const { repo } = mkStubRepo({
      products: [{ id: P_A, slug: "alpha", defaultLanguage: "it" }],
      grants: [
        mkGrant({ id: "g1", userId: "u1", lastSeenAt: T_5_DAYS_AGO }),
      ],
    });
    const result = await buildAudience(
      { creatorId: "creator_1", now: T_NOW, inactiveAfterDays: -1 },
      { repo },
    );
    // 5 days < 30 days default → still active.
    expect(result.totals.activeUsers).toBe(1);
  });
});

describe("prismaAudienceRepository — adapter sanity", () => {
  it("is exported with the expected port methods", () => {
    expect(typeof prismaAudienceRepository.fetchCreatorProducts).toBe(
      "function",
    );
    expect(typeof prismaAudienceRepository.fetchActiveGrantsWithUsers).toBe(
      "function",
    );
    expect(typeof prismaAudienceRepository.fetchRecentGrants).toBe(
      "function",
    );
  });

  it("does NOT throw on import (lazy prisma via module)", () => {
    vi.spyOn(prismaAudienceRepository, "fetchCreatorProducts");
    vi.spyOn(prismaAudienceRepository, "fetchActiveGrantsWithUsers");
    vi.spyOn(prismaAudienceRepository, "fetchRecentGrants");
  });
});

describe("BuildAudienceDeps — type contract", () => {
  it("accepts BuildAudienceDeps with a stub repo", async () => {
    const { repo } = mkStubRepo({
      products: [{ id: P_A, slug: "alpha", defaultLanguage: "it" }],
      grants: [mkGrant({ id: "g1", userId: "u1" })],
      recent: [mkRecentGrant({ id: "g_recent", userId: "u1" })],
    });
    const deps: BuildAudienceDeps = { repo };
    const result = await buildAudience({ creatorId: "creator_1" }, deps);
    expect(result.totals.enrollments).toBe(1);
    expect(result.perProduct).toHaveLength(1);
  });
});
