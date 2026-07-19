/**
 * src/domains/creator-ops/access/resolve-creator-page-access.ts
 *
 * Pure use case — page-level mirror of `resolveCreatorProductAccess`.
 * ONE canonical resolver for "can this actor perform
 * `requiredAction` on this page?" Reuses the SAME 3-source allow-rule
 * (admin → owner → approved_creator) but keyed on `pageId`.
 *
 * ─── MCR Phase 1 — page-level access resolver ─────────────────────
 *
 * Orchestrates (in this exact order):
 *
 *   1. PARSE/GUARD — defensive empty-string check for actorId +
 *      pageId. Empty → typed `forbidden` denial (the route layer
 *      is the primary auth gate; this is belt-and-braces).
 *
 *   2. LOAD       — single port call:
 *        `loadPageAccessContext({ pageId, actorId })`
 *      Returns `{ actor, product, application, pageProductId }`
 *      with each independently nullable. `pageProductId === null`
 *      means the page doesn't exist → `page_not_found` denial.
 *
 *   3. EVALUATE   — branch on the 3-source allow-rule (mirrors
 *      the product resolver):
 *        (a) `actor.role === "admin"`            → `admin`
 *        (b) `product.creatorId === actorId`     → `owner`
 *        (c) `actor.role === "creator"` +
 *            `application.status === "approved"`  → `approved_creator`
 *      Order matters: admin wins (privilege), then owner
 *      (creation), then approved-creator. Each branch
 *      short-circuits.
 *
 *   4. RETURN    — translate to the domain discriminated union.
 *      Soft denials (`actor_not_found` / `page_not_found` /
 *      `forbidden`) are typed returns, NO AppError throws. The
 *      route's `apiErrorResponse` mapper surfaces them as
 *      401/404/403 respectively.
 *
 * ─── Why `pageProductId` is echoed on `allowed: true` ─────────────
 *
 * Downstream use cases (`renameContentPage`, `saveContentDocument`)
 * require `productId` in their input. Forwarding the resolved
 * `pageProductId` saves a second JOIN that the use case would
 * otherwise perform in its pre-check. The use case STILL verifies
 * `page.productId === input.productId` internally (defense in
 * depth) — a stale `pageProductId` is caught by the use case's
 * inline check, surfacing `not_found` from there.
 */

import {
  ResolveCreatorPageAccessDenialReason,
  type ResolveCreatorPageAccessContext,
  type ResolveCreatorPageAccessInput,
  type ResolveCreatorPageAccessPort,
  type ResolveCreatorPageAccessResult,
} from "./resolve-creator-page-access-types";

/**
 * Dependency injection contract. Mirrors the product resolver's
 * deps shape — single `port` field.
 */
export interface ResolveCreatorPageAccessDeps {
  port: ResolveCreatorPageAccessPort;
}

/**
 * Resolve creator-side page access for an actor + page + required
 * action. Returns the discriminated-union outcome.
 *
 * Never throws on soft denials (callers match on `allowed` + the
 * discriminated `source | reason` literal). Programmer errors
 * (DB connection failures, schema drift) bubble to the route's
 * error boundary for a 500.
 *
 * Allow-rule (in evaluation order):
 *
 *   1. admin            — `actor.role === "admin"`
 *   2. owner            — `product.creatorId === actorId`
 *   3. approved_creator — `actor.role === "creator"` AND
 *                          `application.status === "approved"`
 *
 * Deny reasons (mutually exclusive — first matching null wins):
 *
 *   - `actor_not_found`  — port returned null actor (rare race:
 *                          session user was deleted)
 *   - `page_not_found`   — port returned `pageProductId === null`
 *                          (page doesn't exist OR couldn't be
 *                          joined to a product)
 *   - `forbidden`        — actor/page exist but none of the
 *                          3 sources match (route surfaces 403)
 *
 * Notes on defense in depth at the use cases:
 *
 *   Even when this resolver returns `allowed: true, source: admin`
 *   for a page whose product is owned by another creator, the
 *   downstream `renameContentPage` / `saveContentDocument` use
 *   cases STILL inline-check `productCreatorId !== actorId` and
 *   reject with `forbidden`. So an admin attempting to edit
 *   another creator's page gets: resolver 200 (allowed: admin),
 *   then cascade 403 (use case `forbidden`). This intentional
 *   cascade keeps the domain strict-owner-only by design (the
 *   file headers of both use cases flag this as future-proofing
 *   — if admin-edit is ever added, it's a separate use case OR
 *   a `bypassOwnership` flag extension, mirroring the publish
 *   use case's pattern in commit a312d84).
 */
export async function resolveCreatorPageAccess(
  input: ResolveCreatorPageAccessInput,
  deps: ResolveCreatorPageAccessDeps,
): Promise<ResolveCreatorPageAccessResult> {
  // ─── 1. PARSE / GUARD — defensive empty-input rejection ─────
  //
  // Empty actorId can only reach here via a future caller that
  // bypasses the route's session middleware. We refuse rather
  // than forge an identity from empty string. Same collapse for
  // pageId so route layer can surface 403 without leaking
  // which field was blank.
  if (!input.actorId || !input.pageId) {
    return {
      allowed: false,
      reason: ResolveCreatorPageAccessDenialReason.Forbidden,
    };
  }

  // ─── 2. LOAD — single consolidated port call ─────────────────
  //
  // Returns four independently-nullable pieces. The port is
  // responsible for the page → product JOIN + actor lookup +
  // application lookup. Latency is dominated by network
  // round-trips anyway. The Prisma adapter (separate file,
  // scheduled follow-up PR) can satisfy this via Promise.all
  // of small queries OR a single SELECT with nested relation
  // filters.
  const ctx: ResolveCreatorPageAccessContext =
    await deps.port.loadPageAccessContext({
      pageId: input.pageId,
      actorId: input.actorId,
    });

  // ─── 3. EVALUATE — defensive existence checks ────────────────
  //
  // actor_not_found is rare (session user deleted) but distinct
  // from 403 — collapse to typed reason so the route can surface
  // the right HTTP code.
  if (!ctx.actor) {
    return {
      allowed: false,
      reason: ResolveCreatorPageAccessDenialReason.ActorNotFound,
    };
  }
  if (!ctx.pageProductId) {
    // Covers BOTH "page doesn't exist" AND "page in different
    // product" — the port's page→product JOIN returns null when
    // the page row is absent; we don't leak whether the pageId
    // exists in another product (defensive 404 pattern).
    return {
      allowed: false,
      reason: ResolveCreatorPageAccessDenialReason.PageNotFound,
    };
  }

  // ─── 4. EVALUATE — 3-source allow-rule ────────────────────────
  //
  // Order matters: admin wins first (privilege), then owner
  // (canonical "I built this"), then approved-creator. Each
  // branch short-circuits with a fully-typed result including
  // `pageProductId` (echoed so the route can forward to
  // downstream use cases).

  // (a) Admin override.
  if (ctx.actor.role === "admin") {
    return {
      allowed: true,
      source: "admin",
      requiredAction: input.requiredAction,
      pageProductId: ctx.pageProductId,
    };
  }

  // (b) Owner check — actor created the product the page belongs to.
  if (ctx.product?.creatorId === input.actorId) {
    return {
      allowed: true,
      source: "owner",
      requiredAction: input.requiredAction,
      pageProductId: ctx.pageProductId,
    };
  }

  // (c) Approved creator — external creator with completed
  // onboarding, NOT owner of THIS product. Approved_creator
  // path is for cross-product moderation workflows. Both
  // rename + save use cases reject non-owner callers downstream
  // (strict inline check) — so this branch wins the resolver
  // gate but loses at the use case. Intentional: the resolver
  // mirrors the product resolver's 3-source rule for SSOT
  // consistency even though the downstream use cases are
  // currently strict-owner.
  if (
    ctx.actor.role === "creator" &&
    ctx.application?.status === "approved"
  ) {
    return {
      allowed: true,
      source: "approved_creator",
      requiredAction: input.requiredAction,
      pageProductId: ctx.pageProductId,
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
    reason: ResolveCreatorPageAccessDenialReason.Forbidden,
  };
}

/**
 * Re-export the discriminated union + reason enum + port types
 * so callers can import everything they need from
 * `./resolve-creator-page-access` (single canonical entry
 * point, mirrors the product resolver's re-export pattern).
 *
 * The merged-binding form is used for
 * `ResolveCreatorPageAccessDenialReason` (it's BOTH a const
 * and a type alias under the same identifier — same TS2300
 * workaround documented in the product resolver).
 */
export {
  ResolveCreatorPageAccessDenialReason, // value+type merged binding
} from "./resolve-creator-page-access-types";
export type {
  // type-only names — ResolveCreatorPageAccessDeps is defined
  // locally above (interfaces stay close to the use case body
  // for the same reason SaveContentDocumentDeps lives in its
  // impl module, not the types module).
  ResolveCreatorPageAccessInput,
  ResolveCreatorPageAccessContext,
  ResolveCreatorPageAccessResult,
  ResolveCreatorPageAccessPort,
} from "./resolve-creator-page-access-types";
