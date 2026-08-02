// size-budget-exempt — authorization decision stays atomic; ADR-0016 §1.
/**
 * src/domains/creator-ops/access/resolve-creator-product-access.ts
 *
 * Pure use case — ONE canonical resolver for creator-side product
 * access. Unifies the previously-scattered checks (admin override,
 * product ownership, CreatorApplication gating) into a SINGLE
 * discriminated-union answer.
 *
 * ─── Phase 7 — Unified creator-side access resolver ───────────────
 *
 * Orchestrates a single load via the port, then evaluates the
 * 3-source allow-rule:
 *
 *   1. PARSE/GUARD — defensive empty-string check for actorId +
 *      productId. Empty → typed `forbidden` denial (the route
 *      layer is the primary auth gate; this is belt-and-braces).
 *
 *   2. LOAD       — single port call:
 *        `loadAccessContext({ actorId, productId })`
 *      Returns `{ actor, product, application }` with each
 *      independently nullable. Collapsing nulls into "not found"
 *      upstream would lose information (e.g., "actor doesn't
 *      exist" vs "product doesn't exist").
 *
 *   3. EVALUATE   — branch on the 3-source allow-rule (per spec):
 *        (a) `actor.role === "admin"`            → `admin`
 *        (b) `product.creatorId === actorId`     → `owner`
 *        (c) `actor.role === "creator"` +
 *            `application.status === "approved"`  → `approved_creator`
 *      Order matters: admin wins (privilege), then owner
 *      (creation), then approved-creator (rare fallback for
 *      cross-product moderation). Each branch short-circuits.
 *
 *   4. RETURN    — translate to the domain discriminated union.
 *      Soft denials (`actor_not_found` / `product_not_found` /
 *      `forbidden`) are typed returns, NO AppError throws. The
 *      route's `apiErrorResponse` mapper surfaces them as
 *      401/404/403 respectively.
 *
 * ─── Why a 6-branch discriminated union ──────────────────────────
 *
 * Three allow sources × three deny reasons = 6 outcomes. The
 * `requiredAction` is echoed in `allowed: true` for audit
 * correlation (so the action type can be logged without losing
 * the discriminator switch).
 *
 * ─── Why a CONSOLIDATED port call (not 3 separate) ──────────────
 *
 * Three ports × three round-trips = 3 RTTs to the DB. A single
 * consolidated `loadAccessContext` returns all three nullables
 * in one call, with no transaction wrapping (each read is
 * independent and read-only). The Prisma adapter can satisfy
 * this via Promise.all of 3 queries OR a single JOIN; latency
 * is network-bound anyway.
 *
 * Independent nullability is the KEY design choice: collapsing
 * "no user row" + "no product row" into a single null would lose
 * the ability to surface distinct deny reasons.
 *
 * ─── Why no `requiredAction` branching ────────────────────────────
 *
 * v1 uses uniform logic across actions: any of the 3 allow
 * sources passes for any `requiredAction`. Action-specific
 * guard rails (e.g., publish requires additional approval beyond
 * ownership) are NOT in this PR — they're a clean follow-up.
 * The action IS captured in the result for forward compatibility.
 */

import {
  ResolveCreatorProductAccessDenialReason,
  type ResolveCreatorProductAccessContext,
  type ResolveCreatorProductAccessPort,
  type ResolveCreatorProductAccessResult,
  type RequiredAction,
} from "./resolve-creator-product-access-types";

/**
 * Dependency injection contract. The use case NEVER imports the
 * Prisma adapter directly; the route composition root wires it.
 *
 * `port` is the only required dep in this PR.
 */
export interface ResolveCreatorProductAccessDeps {
  port: ResolveCreatorProductAccessPort;
}

/**
 * Resolve creator-side product access for an actor + product
 * + required action. Returns the discriminated-union outcome.
 *
 * Never throws on soft denials (callers match on `allowed` +
 * `source | reason` literals). Programmer errors (DB connection
 * failures, schema drift) bubble to the route's
 * `apiErrorResponse` for a 500.
 *
 * Allow-rule (in evaluation order):
 *
 *   1. admin            — `actor.role === "admin"`
 *   2. owner           — `product.creatorId === actorId`
 *   3. approved_creator — `actor.role === "creator"`
 *                        AND `application.status === "approved"`
 *
 * Deny reasons (mutually exclusive — first matching null wins):
 *
 *   - `actor_not_found`    — port returned null actor (rare: session
 *                            user was deleted; route should treat as
 *                            logged-out, ideally re-auth)
 *   - `product_not_found`  — port returned null product (route
 *                            surfaces 404)
 *   - `forbidden`          — actor/product exist but none of the
 *                            3 sources match (route surfaces 403)
 *
 * Defensive guards:
 *
 *   - Empty `actorId` or `productId` short-circuits to
 *     `forbidden` BEFORE any port call (defense in depth against
 *     session-edge cases)
 *
 * Action-specific rules (NOT in v1): the action is captured in
 * the input and echoed in `success: true` for audit logging, but
 * uniform logic applies across all actions today. Future PRs
 * can extend with action-specific guard rails without changing
 * this resolver's signature.
 */
export async function resolveCreatorProductAccess(
  input: {
    actorId: string;
    productId: string;
    requiredAction: RequiredAction;
  },
  deps: ResolveCreatorProductAccessDeps,
): Promise<ResolveCreatorProductAccessResult> {
  // ─── 1. PARSE / GUARD — defensive empty-input rejection ─────
  //
  // The route layer (e.g., `require-creator-or-admin.ts`) is the
  // primary auth gate; an empty actorId can only reach here via
  // a future caller that bypasses the route. We refuse rather
  // than forge an identity from the empty string.
  if (!input.actorId || !input.productId) {
    return { allowed: false, reason: "forbidden" };
  }

  // ─── 2. LOAD — single consolidated port call ─────────────────
  //
  // Returns three independently-nullable pieces. Collapsing nulls
  // upstream would lose the ability to surface distinct deny
  // reasons — see the port docstring.
  const ctx: ResolveCreatorProductAccessContext =
    await deps.port.loadAccessContext({
      actorId: input.actorId,
      productId: input.productId,
    });

  // ─── 3. EVALUATE — defensive existence checks ────────────────
  //
  // actor_not_found is rare (session user deleted) but distinct
  // from a 403 — collapse to a typed reason so the route can
  // surface the right HTTP code.
  if (!ctx.actor) {
    return {
      allowed: false,
      reason: ResolveCreatorProductAccessDenialReason.ActorNotFound,
    };
  }
  if (!ctx.product) {
    return {
      allowed: false,
      reason: ResolveCreatorProductAccessDenialReason.ProductNotFound,
    };
  }

  // ─── 4. EVALUATE — 3-source allow-rule ────────────────────────
  //
  // Order matters: admin wins first (highest privilege, no
  // product-specific knowledge needed). Owner second (the actor
  // created the product — covers internal creators AND external
  // creators who already have at least one draft). Approved-
  // creator third (rare fallback for cross-product moderation or
  // creator-only tooling — gates on `application.status` being
  // "approved", not "draft/submitted/under_review/rejected").

  // (a) Admin override.
  if (ctx.actor.role === "admin") {
    return {
      allowed: true,
      source: "admin",
      requiredAction: input.requiredAction,
    };
  }

  // (b) Owner check — actor created the product directly.
  if (ctx.product.creatorId === input.actorId) {
    return {
      allowed: true,
      source: "owner",
      requiredAction: input.requiredAction,
    };
  }

  // (c) Approved creator — external creator with completed
  // onboarding. Internal creators SHOULD always be owners; this
  // branch primarily serves external creators who don't own this
  // specific product (e.g., moderating a community feed they have
  // access to via their approved application).
  if (
    ctx.actor.role === "creator" &&
    ctx.application?.status === "approved"
  ) {
    return {
      allowed: true,
      source: "approved_creator",
      requiredAction: input.requiredAction,
    };
  }

  // ─── 5. DEFAULT — generic forbidden ─────────────────────────
  //
  // All three sources failed OR the actor's role is "student"
  // (which never reaches `approved_creator` since role !== "creator").
  // Collapses to a single reason so we don't leak which check
  // failed to a malicious caller.
  return {
    allowed: false,
    reason: ResolveCreatorProductAccessDenialReason.Forbidden,
  };
}

/**
 * Re-export the discriminated union + reason enum + port types
 * so callers can import everything they need from
 * `./resolve-creator-product-access` (single canonical entry
 * point, mirrors the existing pattern in save-content-document,
 * create-content-page, create-product-draft).
 *
 * The merged-binding form is used for
 * `ResolveCreatorProductAccessDenialReason` (it's BOTH a const
 * and a type alias under the same identifier — same TS2300
 * workaround documented in the prior PRs).
 */
export {
  ResolveCreatorProductAccessDenialReason, // value+type merged binding
  // (re-exported only once — TS2300: a `const` + `type` under the same
  //  identifier can't be re-exported via `export type`.)
} from "./resolve-creator-product-access-types";
export type {
  // type-only names
  ResolveCreatorProductAccessPort,
  ResolveCreatorProductAccessResult,
  ResolveCreatorProductAccessContext,
  RequiredAction,
  ActorRole,
} from "./resolve-creator-product-access-types";
