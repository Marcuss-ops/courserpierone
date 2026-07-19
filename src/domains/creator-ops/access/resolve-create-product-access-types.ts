/**
 * src/domains/creator-ops/access/resolve-create-product-access-types.ts
 *
 * Domain types + port contract for `resolveCreateProductAccess`
 * (Phase 7 sibling — gate that authorises a NEW product to be
 * bootstrapped, BEFORE the product row exists in the DB).
 *
 * ─── Purpose ──────────────────────────────────────────────────────
 *
 * One canonical resolver for "can this actor BOOTSTRAP a new
 * product?" — distinguishes from `resolveCreatorProductAccess`
 * (which gates actions on existing products). The product row
 * does NOT exist yet at create time, so the existing
 * 3-source allow rule (admin / owner / approved_creator) is
 * partial:
 *
 *   - `admin`           — admin can create any product (mirrors
 *                         the existing rule).
 *   - `internal_creator` — actor has `role="creator"` AND has
 *                         NO `CreatorApplication` row. Internal
 *                         creators are made by direct role
 *                         assignment; they don't apply.
 *   - `external_approved_creator` — actor has `role="creator"`
 *                         AND `CreatorApplication.status =
 *                         "approved"` (Phase 6 onboarding done).
 *
 * The "owner" source from `resolveCreatorProductAccess` does
 * NOT apply (no productId → no `product.creatorId === actorId`
 * check possible). So this resolver is a 3-allow-source variant.
 *
 * ─── Why a separate resolver (NOT a flag in existing one) ───────
 *
 * The existing `resolveCreatorProductAccess` requires
 * `productId: string` in its input. Synthesising a fake
 * productId for the create case (e.g. "NEW") would:
 *   - Leak "no product yet" semantics through a synthetic value,
 *     inviting future bugs.
 *   - Confuse the audit log (the resolver echoes "I checked
 *     productId=NEW, which doesn't exist, denied").
 *
 * A purpose-built resolver with no productId input keeps each
 * use case's contract natural.
 *
 * ─── Architecture (per ADR-0016 §1 dep direction) ──────────────
 *
 * This file lives at the Domain layer. It declares:
 *   1. The use-case input shape (just `{ actorId }`).
 *   2. The discriminated-union result (`allowed` 3-branch /
 *      `!allowed` 2-branch).
 *   3. The persistence port (`ResolveCreateProductAccessPort`) —
 *      read-only, returns actor's role + (optional)
 *      application status. The Prisma adapter lives in a
 *      sibling file (separate commit, this PR ships use-case +
 *      route + port + tests; mirrors the prior PR boundaries).
 */

import type { CreatorApplicationStatus } from "../onboarding/creator-application-status";

// Re-use the role literal from the existing access resolver for type
// alignment. The two resolvers do not share a port (create has no
// productId), but the role literal is the same.
import type { ActorRole } from "./resolve-creator-product-access-types";

// ─── Discriminated union result ──────────────────────────────────

/**
 * Five exhaustive outcomes:
 *   - `success: true` (3 sources)
 *     - `source: "admin"`                    — `actor.role === "admin"`
 *     - `source: "internal_creator"`         — `actor.role === "creator"`
 *       AND no `CreatorApplication` row (internal creator; made by
 *       direct role assignment, no onboarding needed).
 *     - `source: "external_approved_creator"` — `actor.role === "creator"`
 *       AND `application.status === "approved"` (Phase 6 onboarding
 *       completed).
 *     `actorId` is echoed for downstream correlation without a
 *     second parameter.
 *   - `success: false` (2 reasons)
 *     - `reason: "actor_not_found"`   — empty `actorId` OR port
 *       returned `role: null` (defensive; e.g., session user
 *       was deleted). Collapses to 401-style.
 *     - `reason: "forbidden"`         — actor exists but none of
 *       the 3 sources match (role=`"student"`, or
 *       role=`"creator"` with non-null non-`"approved"`
 *       application status). No info leak about which check
 *       failed.
 */
export type ResolveCreateProductAccessResult =
  | {
      allowed: true;
      source: "admin" | "internal_creator" | "external_approved_creator";
      actorId: string;
    }
  | { allowed: false; reason: "actor_not_found" }
  | { allowed: false; reason: "forbidden" };

/**
 * Stable string union of denial reasons. Used for dispatch
 * tables + `instanceof`-free `switch` checks at call sites.
 * The const+type merged binding pattern matches
 * `ResolveCreatorProductAccessDenialReason`.
 */
export const ResolveCreateProductAccessDenialReason = {
  ActorNotFound: "actor_not_found",
  Forbidden: "forbidden",
} as const;

export type ResolveCreateProductAccessDenialReason =
  (typeof ResolveCreateProductAccessDenialReason)[keyof typeof ResolveCreateProductAccessDenialReason];

// ─── Port payload shape ──────────────────────────────────────────

/**
 * Returned by `loadCreateAccessContext`. Both fields are
 * independently nullable so the resolver can distinguish "no
 * actor" (session went stale) from "actor exists with
 * application status" (concerning the application status for
 * the role check).
 *
 * The adapter is responsible for populating both with a single
 * Prisma query (User LEFT JOIN CreatorApplication).
 */
export interface ResolveCreateProductAccessContext {
  /** Actor's role. `null` ↔ the actor no longer exists. */
  role: ActorRole | null;
  /** Application status. `null` ↔ no application row (internal
   *  creators, or external creators who never applied, OR the
   *  session user vanished). */
  applicationStatus: CreatorApplicationStatus | null;
}

// ─── Port contract ───────────────────────────────────────────────

/**
 * Persistence port for the create-access resolver. ONE method
 * that returns the role + (optional) application status.
 *
 * The Prisma adapter is responsible for:
 *   - Single Prisma query `SELECT role, CreatorApplication.status
 *     FROM User LEFT JOIN CreatorApplication ON userId = id
 *     WHERE User.id = $actorId` (the LEFT JOIN makes the
 *     "no application row" case naturally return `null` for
 *     `applicationStatus`).
 *   - Returning `role: null` for missing users (NOT throwing).
 *   - No transaction: a single read.
 *
 * The dependency direction (Domain → Port) matches ADR-0016 §1;
 * the Prisma adapter lives in a sibling file (separate commit).
 */
export interface ResolveCreateProductAccessPort {
  loadCreateAccessContext(input: {
    actorId: string;
  }): Promise<ResolveCreateProductAccessContext>;
}
