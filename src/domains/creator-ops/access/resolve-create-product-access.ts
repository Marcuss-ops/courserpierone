/**
 * src/domains/creator-ops/access/resolve-create-product-access.ts
 *
 * Pure use case — ONE canonical resolver for "can this actor
 * BOOTSTRAP a new product?" (the create-time sibling of
 * `resolveCreatorProductAccess`).
 *
 * ─── Phase 7 — create-time access resolver ──────────────────────
 *
 * Orchestrates (in this exact order):
 *   1. GUARD      — defensive empty-string check for `actorId`.
 *      Empty → typed `actor_not_found` denial (the route
 *      layer's `requireSession` is the primary auth gate; this
 *      is belt-and-braces).
 *   2. LOAD       — single port call:
 *        `loadCreateAccessContext({ actorId })`
 *      Returns `{ role, applicationStatus }` with each
 *      independently nullable.
 *   3. EVALUATE   — branch on the 3-source allow-rule:
 *        (a) `actor.role === "admin"`                      → `admin`
 *        (b) `actor.role === "creator"` AND applicationStatus === null
 *                                                          → `internal_creator`
 *        (c) `actor.role === "creator"` AND applicationStatus === "approved"
 *                                                          → `external_approved_creator`
 *      Order matters: admin wins (privilege), then
 *      internal_creator (the common path for our seeded
 *      creators), then external_approved_creator (post-
 *      onboarding creators). Each branch short-circuits.
 *   4. RETURN    — translate to the 5-branch domain
 *      discriminated union.
 *
 * ─── Why a 5-branch discriminated union (not the existing 6) ────
 *
 * The existing `resolveCreatorProductAccess` has 3 deny reasons
 * (`actor_not_found`, `product_not_found`, `forbidden`). The
 * create version drops `product_not_found` because no
 * productId is supplied — there's nothing to "not find" here.
 * The 5-branch result has 3 allow sources × 2 deny reasons =
 * 5 outcomes.
 *
 * ─── Why a CONSOLIDATED port call (not 2 separate) ──────────────
 *
 * Two ports × two round-trips = 2 RTTs to the DB. Single
 * `loadCreateAccessContext` returns both nullable pieces in one
 * call. The Prisma adapter satisfies this with a single LEFT
 * JOIN (User LEFT JOIN CreatorApplication) — natural fit.
 *
 * ─── Why internal creators check applicationStatus === null ────
 *
 * The Phase 6 onboarding flow distinguishes:
 *   - Internal creators: role assignment by an admin operator;
 *     they DO NOT submit a CreatorApplication at all.
 *   - External creators: must submit a CreatorApplication; only
 *     `status === "approved"` is allowed to publish/create.
 *
 * Because internal creators never INSERT a CreatorApplication
 * row, the LEFT JOIN's `application.status` is `null` for them.
 * The check `applicationStatus === null` is the cleanest signal
 * for "this is an internal creator". Alternative: a separate
 * `creatorType` column on the User row — but the project
 * deferred that to keep Phase 6 schema-light.
 *
 * ─── What "approved" means in the create flow ───────────────────
 *
 * The Phase 6 state machine (see
 * `src/domains/creator-ops/onboarding/creator-application-status.ts`)
 * has terminal states `approved` AND `rejected`. Non-terminal
 * states (`draft`, `submitted`, `under_review`) are also denied.
 * The check is strict `=== "approved"` — no fudging on
 * "submitted" or "under_review".
 *
 * ─── Why NO `requiredAction` enum ──────────────────────────────
 *
 * This resolver handles ONE action ("create product"). Unlike
 * the existing `resolveCreatorProductAccess` (which captures a
 * `RequiredAction` for action-specific future guard rails), the
 * create resolver is action-pinned — `requiredAction` would be
 * tautologically `"create"`. The simpler signature (no action)
 * is intentional.
 */

import {
  ResolveCreateProductAccessDenialReason,
  type ResolveCreateProductAccessContext,
  type ResolveCreateProductAccessPort,
  type ResolveCreateProductAccessResult,
} from "./resolve-create-product-access-types";

/**
 * Dependency injection contract. The use case NEVER imports
 * the Prisma adapter directly; the route composition root
 * wires it.
 */
export interface ResolveCreateProductAccessDeps {
  port: ResolveCreateProductAccessPort;
}

/**
 * Resolve create-time product access for an actor.
 *
 * Returns the discriminated-union outcome. Never throws on
 * soft denials (caller matches on `allowed` + `source | reason`
 * literals). Programmer errors (DB connection failures, schema
 * drift) bubble to the route's `apiErrorResponse` for a 500.
 *
 * Allow-rule (in evaluation order):
 *
 *   1. admin                  — `actor.role === "admin"`
 *   2. internal_creator       — `actor.role === "creator"`
 *                                AND `applicationStatus === null`
 *                                (no CreatorApplication row)
 *   3. external_approved_creator — `actor.role === "creator"`
 *                                AND `applicationStatus === "approved"`
 *
 * Deny reasons (mutually exclusive — first matching null wins):
 *
 *   - `actor_not_found`   — empty `actorId` OR port returned
 *                           `role: null` (rare: session user
 *                           deleted; route should treat as
 *                           logged-out, ideally re-auth)
 *   - `forbidden`         — actor exists but none of the 3
 *                           sources match (role=`"student"`,
 *                           OR role=`"creator"` +
 *                           application in any non-`"approved"` ,
 *                           non-null status)
 *
 * Defensive guards:
 *
 *   - Empty `actorId` short-circuits to `actor_not_found`
 *     BEFORE any port call (defense in depth against session-
 *     edge cases).
 */
export async function resolveCreateProductAccess(
  input: {
    actorId: string;
  },
  deps: ResolveCreateProductAccessDeps,
): Promise<ResolveCreateProductAccessResult> {
  // ─── 1. GUARD — defensive empty-input rejection ──────────────
  //
  // The route layer (`getCurrentUser`) is the primary auth
  // gate; an empty actorId can only reach here via a future
  // caller (cron replay, queue worker) that bypasses the
  // route. Collapsed to `actor_not_found` so the route surfaces
  // 401-style.
  if (!input.actorId) {
    return {
      allowed: false,
      reason: ResolveCreateProductAccessDenialReason.ActorNotFound,
    };
  }

  // ─── 2. LOAD — single consolidated port call ─────────────────
  //
  // Returns two independently-nullable pieces. Collapsing nulls
  // upstream (e.g., into a single null when "no user")
  // would lose the ability to surface "actor exists, missing
  // application" vs "actor doesn't exist" distinctly.
  const ctx: ResolveCreateProductAccessContext =
    await deps.port.loadCreateAccessContext({
      actorId: input.actorId,
    });

  // ─── 3. EVALUATE — defensive existence check ────────────────
  //
  // actor_not_found is rare (session user deleted) but distinct
  // from a 403 — collapse to a typed reason so the route can
  // surface the right HTTP code.
  if (!ctx.role) {
    return {
      allowed: false,
      reason: ResolveCreateProductAccessDenialReason.ActorNotFound,
    };
  }

  // ─── 4. EVALUATE — 3-source allow-rule ──────────────────────
  //
  // (a) Admin override — highest privilege, no product-specific
  //     knowledge needed.
  if (ctx.role === "admin") {
    return {
      allowed: true,
      source: "admin",
      actorId: input.actorId,
    };
  }

  // (b) Internal creator — `role = "creator"` BUT NO
  //     CreatorApplication row (Phase 6 internal creators are
  //     assigned by admin operators; they don't apply).
  if (ctx.role === "creator" && ctx.applicationStatus === null) {
    return {
      allowed: true,
      source: "internal_creator",
      actorId: input.actorId,
    };
  }

  // (c) External approved creator — `role = "creator"` AND
  //     Phase 6 onboarding completed (`status = "approved"`).
  //     Strict equality: `"draft"`, `"submitted"`,
  //     `"under_review"`, `"rejected"` ARE NOT allowed.
  if (
    ctx.role === "creator" &&
    ctx.applicationStatus === "approved"
  ) {
    return {
      allowed: true,
      source: "external_approved_creator",
      actorId: input.actorId,
    };
  }

  // ─── 5. DEFAULT — generic forbidden ─────────────────────────
  //
  // All three sources failed OR the actor's role is `"student"`
  // (which never reaches the `role === "creator"` checks). The
  // role-literal collapse is the security posture: we don't
  // leak which check failed to a malicious caller.
  return {
    allowed: false,
    reason: ResolveCreateProductAccessDenialReason.Forbidden,
  };
}

/**
 * Re-export the discriminated union + reason enum + port types
 * so callers can import everything they need from
 * `./resolve-create-product-access` (single canonical entry
 * point, mirrors `resolve-creator-product-access` re-export
 * pattern).
 *
 * The merged-binding form is used for
 * `ResolveCreateProductAccessDenialReason` (it's BOTH a const
 * and a type alias under the same identifier — same TS2300
 * workaround).
 */
export {
  ResolveCreateProductAccessDenialReason, // value+type merged binding
} from "./resolve-create-product-access-types";
export type {
  // type-only names
  ResolveCreateProductAccessContext,
  ResolveCreateProductAccessPort,
  ResolveCreateProductAccessResult,
} from "./resolve-create-product-access-types";
