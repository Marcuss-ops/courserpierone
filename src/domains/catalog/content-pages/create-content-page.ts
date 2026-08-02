/**
 * src/domains/catalog/content-pages/create-content-page.ts
 *
 * Pure use case — ONE canonical entry point for "create a new page
 * in a product's content tree".
 *
 * ─── MCR Phase 1 — Notion-like pages feature ─────────────────────
 *
 * Orchestrates (in this exact order):
 *   1. PARSE        — validate input.slug and input.status against
 *                     Zod schemas. Invalid → typed `invalid_slug`
 *                     or `invalid_status` denial.
 *   2. OWNER        — verify product existence + ownership.
 *                     Missing → `not_found`. Wrong creator →
 *                     `forbidden`.
 *   3. PARENT       — verify the parent page (if provided) belongs
 *                     to the SAME product. Mismatch OR missing →
 *                     `parent_not_found` (collapsed to avoid
 *                     cross-product page-id leak).
 *   4. PERSIST      — delegate to `ContentPageRepository.
 *                     createContentPage`. The adapter is responsible
 *                     for auto-assigning `position = max + 1`
 *                     atomically and catching the
 *                     `@@unique([productId, slug])` P2002.
 *   5. RETURN       — translate the port's `created | !created` to
 *                     the 7-branch domain discriminated union.
 *
 * ─── Why pure (no Prisma import) ─────────────────────────────────
 *
 * ADR-0016 §1 dep direction:
 *   - This file: Domain layer (use case). NO `@prisma/client` import.
 *   - Persistence goes through `ContentPageRepository` port
 *     (declared in `./create-content-page-types`).
 *   - The Prisma adapter will live in a sibling file in a follow-up
 *     commit; the route composition root wires the adapter.
 *
 * Test stub: `tests/create-content-page.test.ts` builds an
 * in-memory implementation of the port (no Prisma mock).
 *
 * ─── Why a 7-branch discriminated union ─────────────────────────
 *
 * Mirrors `SaveContentDocument` (5 branches) and the watchlist
 * pattern (3 branches). The additional branches here reflect the
 * CREATE-specific concerns — slug uniqueness, parent-in-same-
 * product — that the autosave flow doesn't have.
 *
 * ─── Position semantics ─────────────────────────────────────────
 *
 * The caller NEVER supplies `position`. The adapter computes
 * `max(position) + 1` within the `(productId, parentId)` scope via
 * a single SQL `INSERT ... SELECT COALESCE(MAX(position)+1, 1) FROM
 * ... WHERE ...` statement. Concurrent CREATE calls in the same
 * scope are serialized by PG's transaction: the second sees the
 * first's committed position and picks max+1 accordingly. The use
 * case doesn't have to know about concurrency.
 *
 * For brand-new products or new (productId, parentId) scopes, the
 * COALESCE expression yields `1` so the first page is at position 1
 * (not 0; positions are 1-indexed).
 */

import { z } from "zod";

import { contentSlugSchema } from "@/domains/catalog/content-type-registry";

import {
  contentPageStatusSchema,
  type ContentPageRepository,
  type CreateContentPageInput,
  type CreateContentPageResult,
  type PageStatus,
} from "./create-content-page-types";

/**
 * Dependency injection contract. The use case NEVER imports the
 * Prisma adapter directly; the route composition root wires it.
 */
export interface CreateContentPageDeps {
  repo: ContentPageRepository;
}

/**
 * Default status when the caller omits the field. Mirrors the DB
 * `@default("draft")` on `ContentPage.status`.
 */
const DEFAULT_PAGE_STATUS: PageStatus = "draft";

/**
 * Create a new ContentPage.
 *
 * Returns the discriminated-union outcome. Never throws on soft
 * validation/ownership/conflict failures (caller matches on the
 * `success` boolean + `reason` literal).
 *
 * Auto-assigned `position` semantics:
 *   - The adapter assigns `position = max(position) + 1` within the
 *     `(productId, parentId)` scope atomically (single SQL INSERT).
 *   - For new products or new parent scopes, position === 1.
 *   - Concurrent CREATEs in the same scope are race-safe at the
 *     PG transaction level (no duplicate positions in normal load).
 *
 * Error surface (NEVER thrown from soft branches):
 *   - `invalid_slug`    — slug failed `contentSlugSchema` regex;
 *     `error` is the ZodError so the form can highlight.
 *   - `invalid_status`  — status not in {draft|published|archived};
 *     `error` is the ZodError.
 *   - `not_found`       — Product doesn't exist.
 *   - `forbidden`       — actorId !== product.creatorId.
 *   - `parent_not_found`— parentId null/missing OR belongs to a
 *     different product. Collapsed for no info leak.
 *   - `slug_taken`      — DB `@@unique([productId, slug])`
 *     violation surfaced as P2002 from the adapter.
 */
export async function createContentPage(
  input: CreateContentPageInput,
  deps: CreateContentPageDeps,
): Promise<CreateContentPageResult> {
  // ─── 1. PARSE — validate slug + status against Zod ──────────
  //
  // Use the SAFE variant so we return typed denial branches
  // instead of throwing through the route's error boundary.
  const slugResult = contentSlugSchema.safeParse(input.slug);
  if (!slugResult.success) {
    return {
      success: false,
      reason: "invalid_slug",
      error: new z.ZodError(slugResult.error.issues),
    };
  }

  // Status: defaults to "draft" if not supplied.
  const statusToUse: PageStatus = input.status ?? DEFAULT_PAGE_STATUS;
  const statusResult = contentPageStatusSchema.safeParse(statusToUse);
  if (!statusResult.success) {
    return {
      success: false,
      reason: "invalid_status",
      error: new z.ZodError(statusResult.error.issues),
    };
  }

  // ─── 2. OWNER — verify product + ownership ──────────────────
  //
  // Defensive empty-string guard for actorId + productId is folded
  // into the ownership lookup (a missing product returns `null`
  // → `not_found` collapses both cases without leaking).
  if (!input.actorId || !input.productId) {
    return { success: false, reason: "not_found" };
  }

  const owner = await deps.repo.findProductOwner({ productId: input.productId });
  if (!owner) {
    // Product doesn't exist.
    return { success: false, reason: "not_found" };
  }
  if (owner.creatorId !== input.actorId) {
    // Caller isn't the product's creator. (Admin-bypass is out of
    // scope for this use case — same rationale as SaveContentDocument.)
    return { success: false, reason: "forbidden" };
  }

  // ─── 3. PARENT — verify parent in same product (if given) ───
  //
  // When parentId is null/undefined the page is top-level and we
  // short-circuit. When provided, we MUST verify it belongs to the
  // SAME product — otherwise a creator could attach their page to
  // another creator's tree (the FK self-relation doesn't enforce
  // same-product because parentId is just an id, not a (id, prod) pair).
  const parentId: string | null = input.parentId ?? null;
  if (parentId !== null) {
    const parent = await deps.repo.findPageProductId({ pageId: parentId });
    if (!parent) {
      // Parent page doesn't exist (or was deleted) — collapse to
      // `parent_not_found` (no info leak).
      return { success: false, reason: "parent_not_found" };
    }
    if (parent.productId !== input.productId) {
      // Parent exists but belongs to a DIFFERENT product — collapse
      // to `parent_not_found` to avoid letting the caller probe
      // page-id existence across products.
      return { success: false, reason: "parent_not_found" };
    }
  }

  // ─── 4. PERSIST — atomic create with auto-position ──────────
  //
  // The adapter is responsible for:
  //   (a) running the atomic INSERT with max+1 subquery
  //   (b) catching P2002 on @@unique([productId, slug]) → slug_taken
  //   (c) re-verifying the parent-product in a transaction for
  //       defense in depth (covers a TOCTOU race where the parent
  //       is deleted between our check and the INSERT)
  const portResult = await deps.repo.createContentPage({
    productId: input.productId,
    parentId,
    slug: slugResult.data,
    status: statusResult.data,
  });

  // ─── 5. RETURN — translate port outcome to domain result ────
  if (!portResult.created && portResult.reason === "slug_taken") {
    return { success: false, reason: "slug_taken" };
  }
  if (!portResult.created && portResult.reason === "parent_not_found") {
    // Adapter caught a race where the parent was deleted between
    // our pre-check and the INSERT. Surface as `parent_not_found`.
    return { success: false, reason: "parent_not_found" };
  }

  return { success: true, page: portResult.page };
}

/**
 * Re-export the discriminated union + reason enum so callers can
 * import everything they need from `./create-content-page`
 * (single canonical entry point, mirrors the save-content-document
 * re-export pattern).
 *
 * The merged-binding form is used for `CreateContentPageDenialReason`
 * (it's BOTH a const and a type alias), and the value re-export
 * re-binds both namespaces without TS2300.
 */
export {
  CreateContentPageDenialReason, // re-exports value + type (merged binding)
} from "./create-content-page-types";
export type {
  // type-only names
  ContentPageRecord,
  ContentPageRepository,
  CreateContentPageInput,
  CreateContentPageInputPort,
  CreateContentPagePortOutput,
  CreateContentPageResult,
  PageStatus,
} from "./create-content-page-types";
