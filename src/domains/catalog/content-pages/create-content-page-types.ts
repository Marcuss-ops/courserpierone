/**
 * src/domains/catalog/content-pages/create-content-page-types.ts
 *
 * Domain types + port contract for `CreateContentPage` (MCR Phase 1 —
 * Notion-like content pages feature).
 *
 * ─── Architecture (per ADR-0016 §1 dep direction) ──────────────
 *
 * This file lives at the Domain layer. It declares:
 *   1. The use-case input shape (`CreateContentPageInput`).
 *   2. The discriminated-union result (`CreateContentPageResult`)
 *      — 7 exhaustive branches mirroring the watchlist/saveContent-
 *      Document pattern: typed denials, no AppError throws.
 *   3. The persistence port (`ContentPageRepository`) — a SEPARATE
 *      port from `ContentPageTranslationRepository` (which serves
 *      `SaveContentDocument`) because:
 *        - `CreateContentPage` operates on the ContentPage entity
 *          (slug, position, parentId)
 *        - `SaveContentDocument` operates on ContentPageTranslation
 *          (document, revision)
 *      Splitting limits transaction scope + keeps each use case
 *      single-responsibility. Both ports are wired by the route
 *      composition root from sibling files.
 *   4. The page-level status enum + Zod schema. Note: this does NOT
 *      reuse `contentStatusSchema` from `@/domains/catalog/content-
 *      type-registry` because the registry's scheme (draft /
 *      awaiting_approval / published / archived / rejected) does not
 *      match the ContentPage schema comment (draft / published /
 *      archived). The two represent different lifecycles: page-level
 *      edit lifecycle vs. moderation lifecycle. Local definition
 *      here; promote to a shared registry if a future use case needs
 *      both.
 *
 * ─── Why a 7-branch discriminated union ────────────────────────
 *
 * The autosave + tree-management UI needs precise typed signals:
 *   - `not_found`         → product disappeared under us (404)
 *   - `forbidden`         → lost edit rights (403)
 *   - `invalid_slug`      → highlight the slug field in the form
 *   - `invalid_status`    → highlight the status select
 *   - `slug_taken`        → "this slug already exists" toast (409)
 *   - `parent_not_found`  → parent deleted under us (collapse to
 *                            404 to avoid leaking cross-product
 *                            page-id existence)
 *   - `success: true`     → returns the new ContentPageRecord
 *                            with the AUTO-assigned position
 *
 * Throws are reserved for programmer errors (Prisma connection
 * failures, etc.). Soft denials are return-shaped so the route's
 * `apiErrorResponse` mapper stays branchless on the happy path.
 *
 * ─── Position assignment contract ──────────────────────────────
 *
 * The caller NEVER supplies `position`. The adapter is responsible
 * for computing `max(position) + 1` within the
 * `(productId, parentId)` scope — atomically, ideally via:
 *
 *   INSERT INTO "ContentPage"
 *     (id, "productId", "parentId", slug, position, status,
 *      "createdAt", "updatedAt")
 *   VALUES
 *     ($id, $productId, $parentId, $slug,
 *      (SELECT COALESCE(MAX(position)+1, 1)
 *         FROM "ContentPage"
 *         WHERE "productId" = $productId
 *           AND "parentId" IS NOT DISTINCT FROM $parentId),
 *      $status, $now, $now)
 *
 * The MAX+1 subquery is part of the INSERT statement — single atomic
 * SQL command, race-safe at the row level via PG's transactional
 * UPDATE. The existing `@@index([productId, parentId, position])`
 * makes the subquery O(log N).
 *
 * Two CREATE CONTENT PAGE calls firing concurrently in the same
 * `(productId, parentId)` scope are STILL serialized by the PG
 * transaction: the second sees the first's committed `position` and
 * picks `max + 1` accordingly. The use case doesn't have to know.
 */

import { z } from "zod";

// ─── Page status (local; not the registry's status scheme) ──────

/**
 * Page-level edit lifecycle. Distinct from the content-type-registry's
 * moderation status. A ContentPage transitions through `draft` (creator
 * is editing), `published` (visible to students), and `archived`
 * (replaced; hidden but kept for history). `publishedAt` is set
 * independently so scheduled-publish is supported.
 */
export const PAGE_STATUSES = ["draft", "published", "archived"] as const;

export type PageStatus = (typeof PAGE_STATUSES)[number];

export const contentPageStatusSchema = z.enum(PAGE_STATUSES);

/**
 * Type-narrowing check: returns true iff `value` is a PageStatus.
 */
export function isContentPageStatus(value: unknown): value is PageStatus {
  return contentPageStatusSchema.safeParse(value).success;
}

/**
 * Strict parse: throws ZodError if `value` is not a PageStatus.
 */
export function parseContentPageStatus(value: unknown): PageStatus {
  return contentPageStatusSchema.parse(value);
}

// ─── Use case input ──────────────────────────────────────────────

/**
 * Input to the `createContentPage` use case.
 *
 * Field-by-field:
 *   - `actorId`   — User.id of the calling creator. The route
 *     re-verifies this via `actorId === product.creatorId` defense
 *     in depth (same pattern as SaveContentDocument).
 *   - `productId` — Product.id that owns this page. Creator
 *     ownership is verified against `Product.creatorId`.
 *   - `parentId`  — Optional. The parent page id when nesting
 *     a child under a section. `null`/`undefined` = top-level page.
 *     When provided, the use case verifies the parent belongs to
 *     the SAME product (collapses to `parent_not_found` otherwise —
 *     matches saveDocument's "no cross-product leak" pattern).
 *   - `slug`      — Per-product-unique slug. Validated via
 *     `contentSlugSchema` (lowercase alphanumeric + dashes, 3–64
 *     chars) before the port call. DB `@@unique([productId, slug])`
 *     enforces uniqueness; the adapter surfaces `slug_taken` on
 *     a P2002 violation.
 *   - `status`    — Optional. Defaults to `"draft"`. Validated via
 *     `contentPageStatusSchema`. Page lifecycle: draft | published
 *     | archived.
 *
 * Position is NOT in the input — the adapter auto-assigns
 * `max(position) + 1` within the `(productId, parentId)` scope.
 */
export interface CreateContentPageInput {
  actorId: string;
  productId: string;
  parentId?: string | null;
  slug: string;
  status?: PageStatus;
}

// ─── Discriminated union result ──────────────────────────────────

/**
 * Seven exhaustive outcomes:
 *   - `success: true`        — page created; the returned
 *     `page: ContentPageRecord` carries the AUTO-assigned `position`
 *     so the caller doesn't have to refetch.
 *   - `success: false` (6 reason branches)
 *     - `not_found`         — Product doesn't exist.
 *     - `forbidden`         — actorId !== product.creatorId.
 *     - `invalid_slug`      — slug failed Zod regex; `error` carries
 *       the ZodError for the form to highlight.
 *     - `invalid_status`    — status not in {draft|published|archived}.
 *     - `slug_taken`        — DB @@unique([productId, slug])
 *       violation, surfaced as P2002 by the adapter.
 *     - `parent_not_found`  — parentId missing OR belongs to a
 *       different product. Collapsed to avoid leaking page existence
 *       across products.
 */
export type CreateContentPageResult =
  | { success: true; page: ContentPageRecord }
  | { success: false; reason: "not_found" }
  | { success: false; reason: "forbidden" }
  | { success: false; reason: "invalid_slug"; error: z.ZodError }
  | { success: false; reason: "invalid_status"; error: z.ZodError }
  | { success: false; reason: "slug_taken" }
  | { success: false; reason: "parent_not_found" };

/**
 * Stable string union of denial reasons. Callers SHOULD compare via
 * the `reason` field of the result (typed), not against these
 * strings directly. Exposed for dispatch tables / `instanceof`-free
 * `switch` checks.
 */
export const CreateContentPageDenialReason = {
  NotFound: "not_found",
  Forbidden: "forbidden",
  InvalidSlug: "invalid_slug",
  InvalidStatus: "invalid_status",
  SlugTaken: "slug_taken",
  ParentNotFound: "parent_not_found",
} as const;

export type CreateContentPageDenialReason =
  (typeof CreateContentPageDenialReason)[keyof typeof CreateContentPageDenialReason];

// ─── Page record (return shape on success) ───────────────────────

/**
 * Canonical read-shape returned by the port on a successful create.
 *
 * Mirrors the `ContentPage` Prisma model exactly so the route can
 * hand the response straight back to the client. The `position`
 * field is the AUTO-assigned value (max + 1 within scope) — the
 * only reason this shape is distinct from "Prisma row" is to keep
 * the use-case layer agnostic of `Date.toISOString()` vs `Date`
 * (caller choice).
 */
export interface ContentPageRecord {
  id: string;
  productId: string;
  parentId: string | null;
  slug: string;
  position: number;
  status: PageStatus;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Port contract ───────────────────────────────────────────────

/**
 * Persistence port for the content-pages write path.
 *
 * Three methods:
 *   1. `findProductOwner`         — read-only ownership lookup
 *                                   (used BEFORE the write).
 *   2. `findPageProductId`        — for parent-page-in-same-product
 *                                   verification when `parentId` is
 *                                   supplied. Returns the productId
 *                                   the parent belongs to, or `null`
 *                                   if the parent doesn't exist.
 *   3. `createContentPage`        — atomic write with auto-position
 *                                   + DB-side slug uniqueness.
 *
 * The dependency direction (Domain → Port) matches ADR-0016 §1;
 * the Prisma adapter lives in a sibling file and is registered
 * by the route's composition root.
 */
export interface ContentPageRepository {
  /**
   * Resolve ownership of a product.
   *
   * Returns `null` when the product doesn't exist → use case
   * returns `not_found`.
   */
  findProductOwner(input: { productId: string }): Promise<{ creatorId: string } | null>;

  /**
   * Resolve the parent page's productId for the parent-in-same-
   * product check.
   *
   * Returns `null` when:
   *   - The page doesn't exist at all → use case returns
   *     `parent_not_found` (no info leak).
   *   - The page was deleted → same outcome.
   *
   * When the page exists, returns `{ productId }`. The use case
   * compares this `productId` against the input productId —
   * mismatches collapse to `parent_not_found` (defensive).
   */
  findPageProductId(input: { pageId: string }): Promise<{ productId: string } | null>;

  /**
   * Persist the new ContentPage.
   *
   * The adapter is responsible for:
   *   - Auto-assigning `position = max(position) + 1` within
   *     `(productId, parentId)` (race-safe via single INSERT with
   *     MAX+1 subquery).
   *   - Catching P2002 from `@@unique([productId, slug])` and
   *     returning `{ created: false, reason: "slug_taken" }` —
   *     the SSOT for uniqueness is the DB constraint.
   *   - Verifying the parent's productId matches (the use case
   *     pre-checks; the adapter re-verifies in `$transaction` for
   *     race safety — defense in depth).
   *
   * Outputs:
   *   - `{ created: true, page: ContentPageRecord }` on success.
   *   - `{ created: false, reason: "slug_taken" }` on @@unique
   *     violation.
   *   - `{ created: false, reason: "parent_not_found" }` if the
   *     adapter's parent-product re-check fails (covers a race
   *     where the parent was deleted between the use case's check
   *     and the INSERT).
   */
  createContentPage(input: CreateContentPageInputPort): Promise<CreateContentPagePortOutput>;
}

/**
 * Internal input shape for the port. Identical to
 * `CreateContentPageInput` MINUS `actorId` (the use case has
 * already resolved ownership and doesn't need to forward it;
 * the port trusts the productId-correct use case context).
 */
export interface CreateContentPageInputPort {
  productId: string;
  parentId: string | null;
  slug: string;
  status: PageStatus;
}

export type CreateContentPagePortOutput =
  | { created: true; page: ContentPageRecord }
  | { created: false; reason: "slug_taken" }
  | { created: false; reason: "parent_not_found" };
