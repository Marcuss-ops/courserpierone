/**
 * src/domains/creator-ops/access/resolve-creator-page-access-types.ts
 *
 * Domain types + port contract for `resolveCreatorPageAccess`
 * (page-level mirror of `resolveCreatorProductAccess`, for the
 * MCR Phase 1 content-pages routes).
 *
 * ─── Why a page-level resolver ────────────────────────────────────
 *
 * The existing `resolveCreatorProductAccess` is keyed on
 * `productId`. The new content-pages API routes are keyed on
 * `pageId` only (the URL has no `productId` — the creator
 * doesn't know or care which product a single page is in). We
 * need a sibling resolver that:
 *
 *   1. Loads `pageId → (pageProductId, product.creatorId)` in
 *      a single port call (one Prisma JOIN).
 *   2. Applies the SAME 3-source allow-rule
 *      (admin / owner / approved_creator) so routing logic is
 *      consistent across products and pages.
 *   3. Echoes the resolved `pageProductId` back into the result
 *      so the route can forward it into the downstream use
 *      case's `productId` field WITHOUT a second port read.
 *      (Net: one consolidated DB read regardless of route.)
 *
 * ─── Architecture (per ADR-0016 §1 dep direction) ──────────────
 *
 *   - Domain layer (this file): types + port contract. ZERO
 *     `@prisma/client` import.
 *   - Use case body (sibling file): pure orchestration.
 *   - Prisma adapter: scheduled for a follow-up PR; the route's
 *     composition root wires the adapter via `__setRouteDeps`.
 *
 * ─── Required actions scoped to page lifecycle ─────────────────────
 *
 * The product-level resolver lists 5 actions (view / edit /
 * publish / delete / create). At the page level, "create" is
 * meaningless (the page already exists). We narrow the union to
 * the 4 actions that apply to an EXISTING page. The enum stays
 * a TYPE alias of the same `RequiredAction` union (no value
 * widening) so callers can pass the canonical strings; runtime
 * narrowing is the responsibility of the calling route
 * (semantic; not a substring check at the resolver).
 *
 * ─── Discriminated union result shape ────────────────────────────
 *
 * 4 allow sources (3 — `admin | owner | approved_creator` — for
 * the 3-source rule; the result also carries `pageProductId` on
 * the allowed branch so the route can forward it directly) ×
 * 3 deny reasons (`actor_not_found`, `page_not_found`,
 * `forbidden`) = 6 outcomes.
 *
 * The denied branches are typed returns, NEVER AppError throws.
 * The route's `apiErrorResponse` mapper surfaces them as 401
 * (actor_not_found), 404 (page_not_found), 403 (forbidden).
 *
 * ─── Why `pageProductId` is exposed on the allowed branch ────────
 *
 * Downstream use cases (`renameContentPage`, `saveContentDocument`)
 * require `productId` in their input and verify `page.productId
 * === input.productId` internally. Forwarding the resolved
 * `pageProductId` into the use case saves a second JOIN in the
 * use case's pre-check port (`findProductLocaleAndOwner` /
 * `findProductAndPageContext`). The use case's inline check still
 * runs (defense in depth), so a stale `pageProductId` is caught.
 */

import type { CreatorApplicationStatus } from "../onboarding/creator-application-status";

// ─── Action enum (re-exported from product resolver for SSOT) ─────

/**
 * Re-export `RequiredAction` from the product-level resolver.
 *
 * Both resolvers share the same action vocabulary — page-level
 * actions are a subset (no "create" because a page-by-id route
 * operates on an already-existing page). The type alias mirrors
 * exactly so callers can pass the same enum to either resolver.
 */
import type { RequiredAction } from "./resolve-creator-product-access-types";
// Re-export so consumers can import either from the product
// resolver's types file (canonical) or from this file (local).
export type { RequiredAction };

// ─── Actor role ───────────────────────────────────────────────────

/**
 * The set of user roles this resolver considers. Mirrors the
 * product resolver's `ActorRole` — duplicated locally rather
 * than re-exported, because page-level routes also need it in
 * the port contract and re-exporting through one file creates
 * dependency cycles when the resolver body imports both.
 */
export type ActorRole = "admin" | "creator" | "student";

// ─── Use case input ──────────────────────────────────────────────

/**
 * Input to `resolveCreatorPageAccess`.
 *
 * Field-by-field:
 *   - `actorId`        — User.id from session. Same SSO user
 *     as the product resolver reads.
 *   - `pageId`         — ContentPage.id from the URL. Resolver
 *     internally joins to Product to fetch `creatorId` and
 *     `application` (if any).
 *   - `requiredAction` — Same action vocabulary as the product
 *     resolver. Page-level routes pass `"edit"` (rename/save
 *     are both edit-class mutations).
 */
export interface ResolveCreatorPageAccessInput {
  actorId: string;
  pageId: string;
  requiredAction: RequiredAction;
}

// ─── Port context (consolidated load) ─────────────────────────────

/**
 * Read-only context the resolver needs to evaluate the
 * 3-source allow-rule.
 *
 * All four pieces are INDEPENDENTLY nullable. The collapse to
 * single `null` (per "merge into one null upstream") would lose
 * the ability to surface distinct deny reasons:
 *
 *   - `actor === null`         → typed `actor_not_found` (rare
 *                                race; route surfaces 401)
 *   - `pageProductId === null` → typed `page_not_found` (404)
 *   - `product === null`      → collapses to `page_not_found`
 *                                (the page-row join yields no
 *                                product — same 404 reason)
 *   - `application` may be null legitimately (internal creators
 *     typically don't have an application row).
 *
 * Consolidation: a single Prisma query can satisfy the page →
 * product JOIN + actor lookup. The application row lookup is
 * ` prisma.creatorApplication.findFirst({ where: { userId } })`
 *  — a separate small query that the adapter can run inline.
 */
export interface ResolveCreatorPageAccessContext {
  actor: { role: ActorRole } | null;
  product: { creatorId: string } | null;
  application: { status: CreatorApplicationStatus } | null;
  pageProductId: string | null;
}

// ─── Discriminated union result ──────────────────────────────────

/**
 * Six exhaustive outcomes:
 *
 *   ── `allowed: true` (3 sources) ───────────────────────────────
 *     - `source: "admin"`            — `actor.role === "admin"`
 *     - `source: "owner"`            — `product.creatorId === actorId`
 *     - `source: "approved_creator"` — `role === "creator"` AND
 *                                       `application.status === "approved"`
 *     On the allowed branch, `pageProductId` is exposed for
 *     route-layer forwarding.
 *
 *   ── `allowed: false` (3 reasons) ──────────────────────────────
 *     - `actor_not_found`  — port returned null actor
 *     - `page_not_found`   — port returned `pageProductId === null`
 *     - `forbidden`        — actor/page exist but none of the
 *                            3 sources match (e.g., role=student,
 *                            or creator without approved
 *                            application)
 */
export type ResolveCreatorPageAccessResult =
  | {
      allowed: true;
      source: "admin" | "owner" | "approved_creator";
      requiredAction: RequiredAction;
      pageProductId: string;
    }
  | { allowed: false; reason: "actor_not_found" }
  | { allowed: false; reason: "page_not_found" }
  | { allowed: false; reason: "forbidden" };

/**
 * Stable string union of denial reasons. Re-declared locally
 * (not re-exported from product resolver) so the page resolver
 * has its own vocabulary — `page_not_found` instead of
 * `product_not_found`. Mirrors the
 * `SaveContentDocumentDenialReason` re-declaration pattern.
 */
export const ResolveCreatorPageAccessDenialReason = {
  ActorNotFound: "actor_not_found",
  PageNotFound: "page_not_found",
  Forbidden: "forbidden",
} as const;

export type ResolveCreatorPageAccessDenialReason =
  (typeof ResolveCreatorPageAccessDenialReason)[keyof typeof ResolveCreatorPageAccessDenialReason];

// ─── Port contract ───────────────────────────────────────────────

/**
 * Persistence port for the page-level access resolver.
 *
 * One consolidated method: `loadPageAccessContext({ pageId })`.
 * The Prisma adapter is responsible for issuing one (or a
 * `Promise.all` of small ones) read; latency is dominated by
 * network round-trips anyway.
 *
 * The `actor` field is keyed on the actorId from session (NOT
 * joined into the page-row query — actor is fetched
 * independently). This keeps the port semantically equivalent
 * to the product resolver's port while pivoting the join from
 * product → page.
 */
export interface ResolveCreatorPageAccessPort {
  loadPageAccessContext(input: {
    pageId: string;
    actorId: string;
  }): Promise<ResolveCreatorPageAccessContext>;
}
