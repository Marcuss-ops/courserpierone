// size-budget-exempt — atomic reorder orchestration; ADR-0016 §1.
/**
 * src/domains/catalog/content-pages/reorder-content-pages.ts
 *
 * Pure use case — ONE canonical entry point for "renumber sibling
 * pages within a (productId, parentId) scope".
 *
 * ─── MCR Phase 1 — Notion-like pages feature ─────────────────────
 *
 * Orchestrates (in this exact order):
 *   1. PARSE        — validate `orderedPages` against
 *                     `reorderEntriesSchema` (shape: pageId +
 *                     newPosition ≥ 1; array length 1..1000).
 *                     Invalid → typed `invalid_ordered_pages`
 *                     denial carrying the ZodError.
 *   2. GUARD        — defensive empty-string rejection for
 *                     actorId + productId (collapsed to
 *                     `not_found`).
 *   3. OWNER        — verify product existence + ownership via
 *                     single port call. Missing → `not_found`.
 *                     Wrong creator → `forbidden`.
 *   4. LIST SCOPE   — fetch the COMPLETE sibling set under
 *                     `(productId, parentId)`. Empty scope is
 *                     valid (newly created branches); the
 *                     invariant checks below handle it.
 *   5. DETECT       — four independent invariant checks, in
 *                     precedence order (first match wins):
 *                       (a) duplicate_page_id     — same pageId
 *                                                    twice in input
 *                       (b) non_contiguous_positions — positions
 *                                                    don't form
 *                                                    [1, N]
 *                       (c) scope_mismatch        — some pageIds
 *                                                    in input but
 *                                                    not in scope
 *                       (d) incomplete_set        — some pages
 *                                                    in scope but
 *                                                    not in input
 *                     Each carries an echo payload
 *                     (supplied[] / extras[] / missingFromScope[] /
 *                     expectedSize) for diagnostic clarity in the
 *                     editor UI.
 *   6. APPLY        — single atomic batch UPDATE via the port
 *                     (the adapter wraps in $transaction).
 *   7. RETURN       — translate to the discriminated union; the
 *                     success branch includes a `reordered` list
 *                     sorted by the NEW `position` for stable
 *                     client-side render order.
 *
 * ─── Why pure (no Prisma import) ─────────────────────────────────
 *
 * ADR-0016 §1 dep direction:
 *   - This file: Domain layer. NO `@prisma/client` import.
 *   - Persistence goes through `ReorderContentPagesPort`
 *     (declared in `./reorder-content-pages-types`).
 *   - The Prisma adapter will live in a sibling file in a
 *     follow-up commit; the route composition root wires the
 *     adapter at call time.
 *
 * Test stub: `tests/reorder-content-pages.test.ts` builds an
 * in-memory implementation of the port (no Prisma mock).
 *
 * ─── Why precedence in DETECT is what it is ──────────────────────
 *
 *   (a) duplicate_page_id BEFORE (b)–(d): a dupe would inflate
 *       the input set semantics (size vs unique-count mismatch),
 *       confusing the later checks. Reject early.
 *   (b) non_contiguous_positions BEFORE (c)/(d): a positions
 *       shape error is a more fundamental problem than a
 *       scope mismatch — if the input is malformed, the scope
 *       check is meaningless.
 *   (c) scope_mismatch BEFORE (d): "you sent pages that don't
 *       belong here" is more diagnostic than "you missed some
 *       pages" — fix the supply list before worrying about
 *       completeness.
 *
 * The `z.ZodError` from invalid_ordered_pages is the EARLIEST
 * failure (validation precedes ownership, by the established
 * pattern across the other content-pages use cases).
 *
 * ─── Why the input's `newPosition` is treated as authoritative ──
 *
 * The caller (editor) computed the new positions from a snapshot
 * of the tree + the user's drag gesture. The use case does NOT
 * re-derive positions from array order — array order is the
 * SHIPPING order (which can be any), while `newPosition` is the
 * INTENDED slot. Treating `newPosition` as authoritative keeps
 * the editor's mental model honest: "I want page X at position
 * Y" maps 1:1 to the input shape.
 */

import { z } from "zod";

import {
  ReorderContentPagesDenialReason, // value import - used as Reason.X in return branches
  reorderEntriesSchema,
  type ReorderContentPagesInput,
  type ReorderContentPagesPort,
  type ReorderContentPagesResult,
  type ReorderedPageResult,
} from "./reorder-content-pages-types";

/**
 * Dependency injection contract. The use case NEVER imports
 * the Prisma adapter directly; the route composition root
 * wires it.
 */
export interface ReorderContentPagesDeps {
  port: ReorderContentPagesPort;
}

/**
 * Renumber all sibling pages in the scope.
 *
 * Returns the discriminated-union outcome. Never throws on
 * soft validation / ownership / scope-invariance failures
 * (caller matches on `success` boolean + `reason` literal).
 *
 * Error surface (NEVER thrown from soft branches):
 *   - `not_found`                — product missing.
 *   - `forbidden`                — actorId !== product.creatorId.
 *   - `invalid_ordered_pages`    — Zod shape violation; `error`
 *                                  is the ZodError for form-level
 *                                  diagnostics.
 *   - `duplicate_page_id`        — input has the same pageId
 *                                  twice.
 *   - `non_contiguous_positions` — positions don't form `[1, N]`;
 *                                  echoes `expectedSize` +
 *                                  `supplied` for the editor.
 *   - `scope_mismatch`           — some pageIds in input are not
 *                                  in scope; `extras` echoes them.
 *   - `incomplete_set`           — some scope pages are missing
 *                                  from input; `missingFromScope`
 *                                  echoes them.
 */
export async function reorderContentPages(
  input: ReorderContentPagesInput,
  deps: ReorderContentPagesDeps,
): Promise<ReorderContentPagesResult> {
  // ─── 1. PARSE — validate orderedPages shape ──────────────────
  //
  // The shape schema enforces: non-empty pageId, integer position
  // >= 1, array length 1..REORDER_BATCH_MAX. Full invariant
  // checks (contiguous, duplicate, scope match) come AFTER — they
  // need the port-loaded scope set.
  const entriesResult = reorderEntriesSchema.safeParse(input.orderedPages);
  if (!entriesResult.success) {
    return {
      success: false,
      reason: ReorderContentPagesDenialReason.InvalidOrderedPages,
      error: new z.ZodError(entriesResult.error.issues),
    };
  }
  const entries = entriesResult.data;

  // ─── 2. GUARD — defensive empty-input rejection ───────────────
  //
  // The route layer is the primary gate; an empty actorId can
  // only reach here via a future caller that bypasses the route.
  // `parentId: null` IS the legitimate "top-level scope" sentinel
  // so we don't reject it here.
  if (!input.actorId || !input.productId) {
    return {
      success: false,
      reason: ReorderContentPagesDenialReason.NotFound,
    };
  }

  // ─── 3. OWNER — verify product + ownership ──────────────────
  const owner = await deps.port.findProductOwner({
    productId: input.productId,
  });
  if (!owner) {
    return {
      success: false,
      reason: ReorderContentPagesDenialReason.NotFound,
    };
  }
  if (owner.creatorId !== input.actorId) {
    return {
      success: false,
      reason: ReorderContentPagesDenialReason.Forbidden,
    };
  }

  // ─── 4. LIST SCOPE — fetch the COMPLETE sibling set ─────────
  //
  // Single port call resolves the sibling pageIds in
  // `(productId, parentId)`. The adapter can satisfy this with
  // a `SELECT id FROM "ContentPage" WHERE productId = $X AND
  // parentId IS NOT DISTINCT FROM $Y` query.
  const scope = await deps.port.listContentPagesInScope({
    productId: input.productId,
    parentId: input.parentId,
  });
  const scopePageIdSet = new Set(scope.pageIds);
  const inputPageIds = entries.map((e) => e.pageId);
  const inputPageIdSet = new Set(inputPageIds);

  // ─── 5. DETECT — invariant checks in precedence order ───────

  // (a) duplicate_page_id — input has the same pageId more than
  // once. Set comparison (size vs length) catches it without
  // iterating.
  if (inputPageIdSet.size !== inputPageIds.length) {
    return {
      success: false,
      reason: ReorderContentPagesDenialReason.DuplicatePageId,
    };
  }

  // (b) non_contiguous_positions — the newPosition values must
  // form exactly [1, N] contiguous. Detection:
  //   - unique count must equal input length (catches duplicate
  //     positions AND gap-free position overflow)
  //   - sorted unique must equal [1, 2, ..., N]
  const positions = entries.map((e) => e.newPosition);
  const sortedUniquePositions = [...new Set(positions)].sort(
    (a, b) => a - b,
  );
  const expectedPositions = Array.from(
    { length: entries.length },
    (_, i) => i + 1,
  );
  const isContiguous =
    sortedUniquePositions.length === positions.length &&
    sortedUniquePositions.every((p, i) => p === expectedPositions[i]);
  if (!isContiguous) {
    return {
      success: false,
      reason: ReorderContentPagesDenialReason.NonContiguousPositions,
      expectedSize: entries.length,
      supplied: positions,
    };
  }

  // (c) scope_mismatch — some pageIds in the input are NOT in
  // the scope's set. Cross-scope leakage attempt (or a stale
  // editor snapshot).
  const extras = inputPageIds.filter((id) => !scopePageIdSet.has(id));
  if (extras.length > 0) {
    return {
      success: false,
      reason: ReorderContentPagesDenialReason.ScopeMismatch,
      extras,
    };
  }

  // (d) incomplete_set — the scope has pages that aren't in the
  // input array. The caller didn't supply the COMPLETE sibling
  // set; the invariant REQUIRES completeness (see types file
  // header for rationale).
  const missingFromScope = scope.pageIds.filter(
    (id) => !inputPageIdSet.has(id),
  );
  if (missingFromScope.length > 0) {
    return {
      success: false,
      reason: ReorderContentPagesDenialReason.IncompleteSet,
      missingFromScope,
    };
  }

  // ─── 6. APPLY — atomic batch UPDATE via the port ────────────
  //
  // The adapter issues a single $transaction containing N UPDATEs
  // (or one CASE-WHEN bulk update). Race-safe with concurrent
  // renumbers of the same scope via PG row locks.
  const now = input.now ?? new Date();
  await deps.port.applyReorder({
    productId: input.productId,
    parentId: input.parentId,
    entries,
    now,
  });

  // ─── 7. RETURN — success branch with sorted `reordered` ─────
  //
  // `reordered` is sorted by the NEW `position` (1-indexed
  // ascending) so the caller / client can render the new order
  // WITHOUT re-sorting client-side. The `scope` echo documents
  // which parent the reorder applied to (audit trail).
  const reordered: ReorderedPageResult[] = entries
    .slice()
    .sort((a, b) => a.newPosition - b.newPosition)
    .map((e) => ({ pageId: e.pageId, position: e.newPosition }));

  return {
    success: true,
    reordered,
    scope: { productId: input.productId, parentId: input.parentId },
  };
}

/**
 * Re-export the discriminated union + reason enum + port types
 * so callers can import everything they need from
 * `./reorder-content-pages` (single canonical entry point,
 * mirrors the rename-content-page + create-content-page +
 * save-content-document re-export patterns).
 *
 * The merged-binding form is used for
 * `ReorderContentPagesDenialReason` (it's BOTH a const and a
 * type alias under the same identifier — same TS2300 workaround
 * documented in the prior PRs).
 */
export {
  ReorderContentPagesDenialReason, // value+type merged binding
  reorderEntriesSchema,            // shape schema re-exported for client-side preview validation
} from "./reorder-content-pages-types";
export type {
  // type-only names
  ReorderContentPagesPort,
  ReorderContentPagesResult,
  ReorderContentPagesInput,
  ReorderEntry,
  ReorderedPageResult,
} from "./reorder-content-pages-types";
