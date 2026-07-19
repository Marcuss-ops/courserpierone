/**
 * src/domains/catalog/content-pages/list-creator-pages.ts
 *
 * Pure use case — ONE canonical entry point for "list every
 * ContentPage of a product, with the default-language title
 * denormalized, for the creator-side sidebar".
 *
 * ─── MCR Phase 1 — Notion-like pages feature ─────────────────────
 *
 * Orchestrates (in this exact order):
 *   1. GUARD       — defensive empty-string rejection for
 *                    `actorId` + `productId`. Collapsed to
 *                    `not_found` so the page-route layer maps
 *                    404 without leaking which field was blank.
 *   2. OWNER       — single port call resolving the product's
 *                    `creatorId + defaultLanguage`. Missing
 *                    product → `not_found`. Wrong creator →
 *                    `forbidden`.
 *   3. LIST PAGES  — single port call returning the flat list
 *                    with the default-language title
 *                    denormalized (LATERAL join).
 *   4. RETURN      — translate the port output verbatim to
 *                    the 3-branch discriminated union.
 *
 * ─── Why pure (no Prisma import) ─────────────────────────────────
 *
 * ADR-0016 §1 dep direction:
 *   - This file: Domain layer. NO `@prisma/client` import.
 *   - Persistence goes through `ListCreatorPagesPort` (declared
 *     in `./list-creator-pages-types`).
 *   - The Prisma adapter lives in a sibling file in the SAME
 *     commit; the page.tsx composition root wires both.
 *
 * ─── Why an "owner" check rather than the SSOT resolver ────────
 *
 * `listCreatorPages` is a READ-side use case (sidebar fetch).
 * The SSOT resolver `resolveCreatorProductAccess` is for MUTATE
 * actions (create/rename/reorder/publish). For READ, an inline
 * `actorId === product.creatorId` check is sufficient — the
 * upstream layout already gates the page route. This matches
 * the pattern of other read-side use cases in the codebase.
 *
 * Admin-read (cross-product) is NOT a v1 concern. If a future
 * PR adds admin-view-other-creators' sidebars, the use case
 * grows a `bypassOwnership` flag (mirrors the publish use
 * case's forward-design).
 *
 * ─── Why no pagination in v1 (implied 1000-page cap) ───────────
 *
 * The adapter returns ALL pages of the product in one query.
 * The implicit cap matches `REORDER_BATCH_MAX = 1000`; the
 * sidebar/reorder interaction permits at most 1000 pages in
 * scope. Future PRs add a `cursor` input for larger products.
 */

import {
  ListCreatorPagesDenialReason, // value import — used as Reason.X in the return branches
  type ListCreatorPagesInput,
  type ListCreatorPagesPageRow,
  type ListCreatorPagesPort,
  type ListCreatorPagesResult,
} from "./list-creator-pages-types";

/**
 * Dependency injection contract. The use case NEVER imports
 * the Prisma adapter directly; the page.tsx composition root
 * wires it.
 */
export interface ListCreatorPagesDeps {
  repo: ListCreatorPagesPort;
}

/**
 * Safe default for a `status` value that fails the
 * `PageStatus` union narrowing. The DB column accepts any
 * string; an unexpected value (legacy / corrupted row) is
 * coerced to `"draft"` so the sidebar renders a stable row
 * rather than crashing render.
 */
const SAFE_FALLBACK_STATUS: ListCreatorPagesPageRow["status"] = "draft";

/**
 * Cast-or-fallback helper for adapter-supplied status
 * strings. Validates using the PageStatus array literal from
 * the canonical source — keeps the union narrowing
 * authoritative.
 */
function coerceStatus(raw: string): ListCreatorPagesPageRow["status"] {
  if (raw === "draft" || raw === "published" || raw === "archived") {
    return raw;
  }
  return SAFE_FALLBACK_STATUS;
}

/**
 * List every ContentPage of the product with the default-
 * language title denormalized for the sidebar.
 *
 * Returns the discriminated-union outcome. Never throws on
 * soft validation / ownership / not-found failures (caller
 * matches on the `success` boolean + `reason` literal).
 *
 * Error surface (NEVER thrown from soft branches):
 *   - `not_found`   — product doesn't exist OR empty
 *     actorId / productId inputs (collapsed for no info
 *     leak about which field was blank).
 *   - `forbidden`   — actorId !== product.creatorId. Mirror
 *     of the SSOT resolver's outcome for the "edit" action.
 *
 * Programmer-error paths (caller has a bug — adapter wiring
 * missing, etc.) surface through the route's error boundary
 * as 5xx; the use case does NOT encode adapter concerns in
 * soft denials.
 */
export async function listCreatorPages(
  input: ListCreatorPagesInput,
  deps: ListCreatorPagesDeps,
): Promise<ListCreatorPagesResult> {
  // ─── 1. GUARD — defensive empty-input rejection ─────────────
  //
  // Both `actorId` and `productId` collapse to `not_found`.
  // Upstream session middleware is the primary gate; an empty
  // string can only reach here via a future caller that
  // bypasses the page-route layer. We refuse rather than
  // forge an identity.
  if (!input.actorId || !input.productId) {
    return {
      success: false,
      reason: ListCreatorPagesDenialReason.NotFound,
    };
  }

  // ─── 2. OWNER — verify product + ownership ────────────────
  //
  // Single port call resolves both `creatorId` (for the
  // strict-owner check) and `defaultLanguage` (for the
  // translation LATERAL-join filter). Missing product →
  // `not_found`. Wrong creator → `forbidden`.
  const product = await deps.repo.findProductOwner({
    productId: input.productId,
  });
  if (!product) {
    return {
      success: false,
      reason: ListCreatorPagesDenialReason.NotFound,
    };
  }
  if (product.creatorId !== input.actorId) {
    return {
      success: false,
      reason: ListCreatorPagesDenialReason.Forbidden,
    };
  }

  // ─── 3. LIST PAGES — flat list with default-language title ─
  //
  // Single port call. The adapter is responsible for the
  // `(parentId NULLS FIRST, position ASC)` ordering and the
  // LEFT JOIN LATERAL on the default-language translation.
  // The use case trusts the adapter's shape verbatim.
  const result = await deps.repo.listContentPagesWithDefaultTitle({
    productId: input.productId,
    defaultLanguage: product.defaultLanguage,
  });

  // ─── 4. RETURN — translate port result to domain result ────
  //
  // Adapter-side `status` strings are coerced into the
  // canonical PageStatus union defensively (legacy /
  // corrupted rows shouldn't crash the sidebar). The
  // adapter's order is preserved verbatim so the client-
  // side tree builder is deterministic.
  const pages: ListCreatorPagesPageRow[] = result.items.map((row) => ({
    ...row,
    status: coerceStatus(row.status),
    defaultLanguage: product.defaultLanguage,
  }));

  return { success: true, pages };
}

/**
 * Re-export the discriminated union + reason enum + port
 * types so callers can import everything they need from
 * `./list-creator-pages` (single canonical entry point,
 * mirrors the save-content-document + create +
 * rename + reorder re-export pattern).
 *
 * The merged-binding form is used for
 * `ListCreatorPagesDenialReason` (it's BOTH a const and a
 * type alias under the same identifier — same TS2300
 * workaround documented in the prior PRs).
 */
export {
  ListCreatorPagesDenialReason, // value+type merged binding
} from "./list-creator-pages-types";
export type {
  // type-only names
  ListCreatorPagesPageRow,
  ListCreatorPagesPort,
  ListCreatorPagesInput,
  ListCreatorPagesResult,
} from "./list-creator-pages-types";
