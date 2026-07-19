/**
 * src/domains/creator-ops/access/resolve-creator-product-access-types.ts
 *
 * Domain types + port contract for `resolveCreatorProductAccess`
 * (Phase 7 — unified creator-side product access resolver).
 *
 * ─── Purpose ──────────────────────────────────────────────────────
 *
 * One canonical resolver for "can this actor perform
 * `requiredAction` on this product?" Replaces the scattered role
 * checks across routes (admin override in some, owner-only in
 * others, creator-application guards in a third). Consolidates
 * into a SINGLE discriminator with three alternative allow
 * sources, ordered by privilege.
 *
 * ─── Three allow sources (per user spec) ──────────────────────────
 *
 *   1. `admin`              — `actor.role === "admin"`. Highest
 *      privilege; overrides every other check.
 *   2. `owner`              — `product.creatorId === actorId`. The
 *      actor created/owns the product directly. This is the
 *      canonical "I built this, I can edit it" path. Covers
 *      internal creators (who always own their products) AND
 *      external creators (after first draft creation).
 *   3. `approved_creator`   — `actor.role === "creator"` AND the
 *      actor has an approved CreatorApplication. This path
 *      covers actions that don't require ownership (e.g., a
 *      creator moderating a community feed across their
 *      approved products, or accessing creator-only tooling).
 *      WITHOUT an approved application the actor is denied.
 *
 * ─── Why ONE resolver, not three ────────────────────────────────
 *
 * Before this resolver existed, the same check (can creator X
 * edit product Y?) was implemented in at least three places:
 *   - `require-creator-or-admin.ts` (route-level auth gate)
 *   - `creator-application-guards.ts` (role + creatorType logic
 *     for create/publish, action-tied)
 *   - Per-route inline checks (e.g. `if authorized.role !== "admin"
 *     && product.creatorId !== authorized.userId` in
 *     `src/app/api/products/[id]/route.ts`)
 *
 * Each implementation drifted independently. This resolver is
 * the SSOT (single source of truth) that all three call into.
 * Per ADR-0016 §1 dep direction:
 *   - Domain rule lives at `src/domains/creator-ops/access/`
 *   - Persistence goes through the port (defined here)
 *   - The Prisma adapter will live in a sibling adapter file
 *     (this PR ships use-case + port + tests only; mirrors the
 *     established prior PR boundaries)
 *
 * ─── Action-specific rules (future PR) ────────────────────────────
 *
 * `requiredAction` is captured but v1 uses UNIFORM logic across
 * actions (any of the 3 allow sources passes). Future PRs can add
 * action-specific guard rails (e.g., require additional approval
 * for "publish"). The action IS echoed in `success: true` so
 * audit logs can correlate by action type without a separate
 * switch. Today we keep the surface minimal.
 *
 * ─── Port design (consolidated read for testability) ────────────
 *
 * One port method (`loadAccessContext`) returns all the pieces
 * the resolver needs in a single call:
 *   - `actor`           — `{ role }` or null (defensive 401-style
 *                         when session user is gone — rare race)
 *   - `product`         — `{ creatorId }` or null (404-style)
 *   - `application`     — `{ status }` or null (no application row)
 *
 * Three returnable nulls is intentional — it lets the resolver
 * surface distinct denial reasons (`actor_not_found` vs
 * `product_not_found` vs `forbidden`) without leaking the
 * existence of one entity while probing another. The Prisma
 * adapter can satisfy this in a single query (or 2-3 small
 * queries; latency is dominated by network anyway).
 *
 * The stub-based unit tests can pre-set each piece independently
 * via `state.actorResult` / `state.productResult` /
 * `state.applicationResult` — the full truth-table of
 * (role, owner-yes/no, app-status) combinations is reachable
 * from one fixture.
 */

import type { CreatorApplicationStatus } from "../onboarding/creator-application-status";

// ─── Action enum ──────────────────────────────────────────────────

/**
 * The set of creator-side product actions this resolver can gate.
 *
 * v1: all actions share the same rule (any of the 3 allow sources
 * passes). Future PRs may add action-specific constraints (e.g.,
 * `publish` may require additional approval beyond ownership).
 *
 * The enum exists today to:
 *   1. Force explicit typing at call sites (route handlers
 *      declare which action they're gating).
 *   2. Echo the action in `success: true` for audit logging.
 *   3. Document the supported surface in one place.
 */
export const REQUIRED_ACTIONS = [
  "view",
  "edit",
  "publish",
  "delete",
  "create",
] as const;

export type RequiredAction = (typeof REQUIRED_ACTIONS)[number];

// ─── Discriminated union result ──────────────────────────────────

/**
 * Six exhaustive outcomes:
 *   - `success: true` (3 sources) — the actor may perform the
 *     action. `source` documents WHY allowed (audit-trail +
 *     debugging). `requiredAction` is echoed for downstream
 *     correlation without a second parameter.
 *     - `source: "admin"`            — actor.role === "admin"
 *     - `source: "owner"`            — product.creatorId === actorId
 *     - `source: "approved_creator"` — actor has approved
 *       CreatorApplication (external creator onboarding done)
 *   - `success: false` (3 reasons)
 *     - `reason: "actor_not_found"`   — defensive: the session user
 *       is gone. Should be rare; if it happens, the session
 *       itself is invalid.
 *     - `reason: "product_not_found"` — productId has no row;
 *       collapse to 404.
 *     - `reason: "forbidden"`         — generic 403. Combines ALL
 *       "actor exists, product exists, but none of the 3 allow
 *       sources match" cases (no info leak about which check
 *       failed).
 */
export type ResolveCreatorProductAccessResult =
  | {
      allowed: true;
      source: "admin" | "owner" | "approved_creator";
      requiredAction: RequiredAction;
    }
  | { allowed: false; reason: "actor_not_found" }
  | { allowed: false; reason: "product_not_found" }
  | { allowed: false; reason: "forbidden" };

/**
 * Stable string union of denial reasons. Used for dispatch tables
 * + `instanceof`-free `switch` checks at call sites.
 */
export const ResolveCreatorProductAccessDenialReason = {
  ActorNotFound: "actor_not_found",
  ProductNotFound: "product_not_found",
  Forbidden: "forbidden",
} as const;

export type ResolveCreatorProductAccessDenialReason =
  (typeof ResolveCreatorProductAccessDenialReason)[keyof typeof ResolveCreatorProductAccessDenialReason];

// ─── Port payload shape ──────────────────────────────────────────

/**
 * The persisted actor's role. Mirrors the User.role field in
 * Prisma (validated app-side; the resolver trusts the port's
 * narrowed literal).
 */
export type ActorRole = "admin" | "creator" | "student";

/**
 * Returned by `loadAccessContext`. Each field is independently
 * nullable so the resolver can distinguish every deny reason.
 */
export interface ResolveCreatorProductAccessContext {
  /** Session user info. Null ↔ the actor no longer exists. */
  actor: { id: string; role: ActorRole } | null;
  /** Product ownership lookup. Null ↔ the productId has no row. */
  product: { creatorId: string } | null;
  /**
   * External-creator application status. Null ↔ the actor has
   * never submitted a CreatorApplication (internal creators
   * typically don't have rows).
   */
  application: { status: CreatorApplicationStatus } | null;
}

// ─── Port contract ───────────────────────────────────────────────

/**
 * Persistence port for the unified creator-side product access
 * resolver. ONE method that returns all three pieces of context
 * the resolver needs.
 *
 * The Prisma adapter is responsible for:
 *   - Single Prisma query (or 2-3 small parallel queries) covering
 *     User + Product + CreatorApplication
 *   - Returning null for any missing piece (NOT throwing) so the
 *     resolver can discriminate the 3 denial reasons
 *   - No transaction: each read is independent and read-only
 *
 * The dependency direction (Domain → Port) matches ADR-0016 §1;
 * the Prisma adapter lives in a sibling file (separate commit).
 */
export interface ResolveCreatorProductAccessPort {
  loadAccessContext(input: {
    actorId: string;
    productId: string;
  }): Promise<ResolveCreatorProductAccessContext>;
}
