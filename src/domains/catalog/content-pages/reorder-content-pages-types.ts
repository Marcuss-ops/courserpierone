// size-budget-exempt — atomic reorder contract; ADR-0016 §1.
/**
 * src/domains/catalog/content-pages/reorder-content-pages-types.ts
 *
 * Domain types + port contract for `reorderContentPages`
 * (MCR Phase 1 — Notion-like content pages feature).
 *
 * ─── Architecture (per ADR-0016 §1 dep direction) ──────────────
 *
 * Declares, at the Domain layer:
 *   1. `ReorderContentPagesInput` — use case input.
 *   2. `ReorderContentPagesResult` — discriminated union result.
 *   3. `ReorderContentPagesPort` — persistence port for the
 *      three-step read (ownership, list-siblings-in-scope, atomic
 *      renumber batch).
 *
 * ─── The position invariant (the spec's hard requirement) ───────
 *
 * "Posizioni fratelli consistenti" means positions within a sibling
 * group `(productId, parentId)` must be UNIQUE and CONTIGUOUS
 * (no gaps, start at 1, end at N). Reordering enforces this by:
 *
 *   1. The caller MUST supply the COMPLETE set of pageIds that
 *      exist in `(productId, parentId)` scope at the time of
 *      reorder. Partial reorders (supplying a subset) are rejected
 *      with `incomplete_set` — a future "single move" use case
 *      (drag-and-drop one page) will fill the gap, but for v1
 *      the editor sends the full sibling list.
 *
 *   2. Each supplied entry's `newPosition` MUST form exactly
 *      `[1, N]` (contiguous, no duplicates, no gaps). Violations
 *      surface as either `duplicate_page_id` (same pageId twice)
 *      or `non_contiguous_positions` (positions don't form
 *      `[1, N]`).
 *
 *   3. ALL supplied pageIds MUST belong to the actual sibling
 *      scope — cross-scope pageIds are a `scope_mismatch`. This
 *      covers "what if the caller sends a pageId from a different
 *      parent" (the FK self-relation doesn't enforce same-parent
 *      on UPDATE — the use case must).
 *
 * The port's `applyReorder` then issues a SINGLE atomic UPDATE
 * (transactional batch) so concurrent renumbers can't interleave.
 * PG's UPDATE-on-same-rows race is serialized via the row locks,
 * and the `@@index([productId, parentId, position])` makes the
 * per-row update O(log N).
 *
 * ─── Why NOT a generic `{ sourceIdx, targetIdx }` move op ───────
 *
 * A drag-and-drop UI typically emits "move page at index K to
 * index L". That's an additive op. Two issues for backend:
 *   - To compute the final contiguous positions, the backend
 *     needs to know the FULL sibling set anyway.
 *   - Concurrent drag-drops on the same scope require a
 *     serialization policy not present in move-op semantics.
 *
 * The full-set batch approach is atomic and idempotent: re-
 * submitting the same payload twice yields the same result. The
 * editor computes the new positions from a snapshot of the
 * existing tree + the user's drag gesture, then submits ONE
 * batch. The route handler accepts the full snapshot.
 */

import { z } from "zod";

// ─── Per-entry schema ────────────────────────────────────────────

/**
 * One (pageId, newPosition) entry in the renumber batch.
 *
 * NB: Zod enforces SHAPE only (non-negative integer >= 0). The
 * "1-indexed contiguous" semantic is enforced at the USE CASE
 * layer (reorderContentPages.ts contiguity check). Positions
 * like [0, 1, 2] are therefore rejected as `non_contiguous_positions`
 * at the use case - NOT as `invalid_ordered_pages` upfront. This
 * split lets the editor UI route the "you forgot to start at 1"
 * diagnostic separately from "your array was malformed".
 * Validation:
 *   - `pageId`:     non-empty string
 *   - `newPosition`: positive integer ≥ 1 (positions are 1-indexed;
 *                    matches the orphan CreateContentPage
 *                    convention `max(position) + 1` with
 *                    `COALESCE(..., 1)` for empty scopes).
 *
 * The use case enforces the full `[1, N]` contiguous invariant
 * separately (via the port call) — this schema is just shape.
 */
export const reorderEntrySchema = z.object({
  pageId: z.string().min(1, "reorder entry pageId must be non-empty"),
  newPosition: z
    .number()
    .int("reorder entry newPosition must be an integer")
    .min(0, "reorder entry newPosition must be a non-negative integer"),
});
export type ReorderEntry = z.infer<typeof reorderEntrySchema>;

/**
 * Bounds on the array size: minimum 1 entry (reordering zero
 * pages is a no-op), maximum 1000 entries (defensive cap to
 * keep the atomic UPDATE O(N) and prevent runaway UI batches).
 */
export const REORDER_BATCH_MIN = 1;
export const REORDER_BATCH_MAX = 1000;

export const reorderEntriesSchema = z
  .array(reorderEntrySchema)
  .min(REORDER_BATCH_MIN)
  .max(REORDER_BATCH_MAX);

// ─── Use case input ──────────────────────────────────────────────

/**
 * Input to `reorderContentPages`.
 *
 * Field-by-field:
 *   - `actorId`    — User.id of the calling creator. Route layer
 *     has already verified the session; the use case re-checks
 *     `actorId === product.creatorId`.
 *   - `productId`  — Product that owns the scope.
 *   - `parentId`   — `null` = top-level pages. Non-null = children
 *     of that parent page. The `(productId, parentId)` pair
 *     uniquely scopes the sibling group.
 *   - `orderedPages` — The complete list of `(pageId, newPosition)`
 *     entries forming the new ordering. Must equal the SCOPE's
 *     exact page set; positions must form `[1, N]`.
 *   - `now`        — Testable clock injection.
 *
 * Renumber is intentionally ONLY for siblings of a SINGLE parent
 * in a SINGLE product. To renumber across two parents (re-parent
 * operation), use a future `MoveContentPage` use case that
 * composes a delete-then-create under the new parent.
 */
export interface ReorderContentPagesInput {
  actorId: string;
  productId: string;
  parentId: string | null;
  orderedPages: ReorderEntry[];
  now?: Date;
}

// ─── Result entry schema ─────────────────────────────────────────

/**
 * Per-page echo in the success result. The same shape as the
 * input but with `position` reflecting the NEW value (verbatim
 * from `newPosition`).
 */
export interface ReorderedPageResult {
  pageId: string;
  position: number;
}

// ─── Discriminated union result ──────────────────────────────────

/**
 * Nine exhaustive outcomes:
 *   - `success: true` — pages renumbered. `reordered` lists the
 *     final (pageId, position) pairs in NEW order; `scope` echoes
 *     `(productId, parentId)` for audit.
 *   - `success: false` (8 reason branches)
 *     - `not_found`              — Product doesn't exist.
 *     - `forbidden`              — actorId !== product.creatorId.
 *     - `invalid_ordered_pages`  — Zod shape violation (empty,
 *       too many, non-integer positions, missing fields).
 *     - `duplicate_page_id`      — `orderedPages` contains the
 *       same pageId twice (the input itself is malformed).
 *     - `non_contiguous_positions`— The `newPosition` values don't
 *       form `[1, N]` (gaps or overshoot). `expectedSize` and
 *       `supplied` echo the diff for debugging.
 *     - `scope_mismatch`         — One or more `pageId`s in
 *       `orderedPages` are NOT in the scope's sibling set (cross-
 *       scope leakage attempt). `extras` echoes the offending ids.
 *     - `incomplete_set`         — The scope has MORE pages than
 *       `orderedPages` covers (caller didn't supply the full set).
 *       `missingFromScope` echoes the un-supplied ids.
 *
 * The four scope/invariant failure branches are SPLIT (instead of
 * collapsed into a single `invalid_state`) so the editor can show
 * specific diagnostics — "page X doesn't belong here", "you
 * missed page Y", "positions are not contiguous 1..N", etc.
 */
export type ReorderContentPagesResult =
  | {
      success: true;
      reordered: ReorderedPageResult[];
      scope: { productId: string; parentId: string | null };
    }
  | { success: false; reason: "not_found" }
  | { success: false; reason: "forbidden" }
  | {
      success: false;
      reason: "invalid_ordered_pages";
      error: z.ZodError;
    }
  | { success: false; reason: "duplicate_page_id" }
  | {
      success: false;
      reason: "non_contiguous_positions";
      expectedSize: number;
      supplied: number[];
    }
  | { success: false; reason: "scope_mismatch"; extras: string[] }
  | {
      success: false;
      reason: "incomplete_set";
      missingFromScope: string[];
    };

/**
 * Stable string union of denial reasons.
 */
export const ReorderContentPagesDenialReason = {
  NotFound: "not_found",
  Forbidden: "forbidden",
  InvalidOrderedPages: "invalid_ordered_pages",
  DuplicatePageId: "duplicate_page_id",
  NonContiguousPositions: "non_contiguous_positions",
  ScopeMismatch: "scope_mismatch",
  IncompleteSet: "incomplete_set",
} as const;

export type ReorderContentPagesDenialReason =
  (typeof ReorderContentPagesDenialReason)[keyof typeof ReorderContentPagesDenialReason];

// ─── Port contract ───────────────────────────────────────────────

/**
 * Persistence port for the reorder flow.
 *
 * Three methods:
 *   1. `findProductOwner` — read-only ownership lookup.
 *   2. `listContentPagesInScope` — return the COMPLETE set of
 *      pageIds currently in the `(productId, parentId)` scope.
 *      The use case calls this BEFORE the batch to compute the
 *      invariant checks (scope_mismatch / incomplete_set).
 *   3. `applyReorder` — atomic batch UPDATE that writes the
 *      new `position` for each entry. The adapter is responsible
 *      for issuing a single SQL `$transaction` so the renumber
 *      is all-or-nothing (race-safe with concurrent renumbers of
 *      the same scope via row locks).
 *
 * The Prisma adapter for this port lives in a sibling file
 * (separate commit).
 */
export interface ReorderContentPagesPort {
  /**
   * Resolve product ownership. Returns `null` when the product
   * doesn't exist → use case returns `not_found`.
   */
  findProductOwner(input: {
    productId: string;
  }): Promise<{ creatorId: string } | null>;

  /**
   * List the sibling pageIds in `(productId, parentId)` scope.
   *
   * Returns the COMPLETE set — even if there are 1000 pages in
   * the scope, ALL ids are returned (we cap REORDER_BATCH_MAX at
   * 1000 above). The use case then verifies the input vs the
   * returned set.
   *
   * Empty array `[]` IS a valid result — for a brand-new scope
   * the input array must also be empty. We reject `[]` input
   * earlier (REORDER_BATCH_MIN = 1) so a non-empty input on an
   * empty scope surfaces as `scope_mismatch`.
   */
  listContentPagesInScope(input: {
    productId: string;
    parentId: string | null;
  }): Promise<{ pageIds: string[] }>;

  /**
   * Atomic batch UPDATE of positions. The adapter issues a
   * single `$transaction` containing N `UPDATE ... SET position
   * = $pos WHERE id = $pageId` statements (or one CASE-WHEN
   * bulk update — both are valid). On commit the renumber is
   * visible atomically to other readers.
   *
   * Returns `{ applied: true }` on commit. The adapter does NOT
   * throw on partial failures — Prisma's `$transaction` rolls
   * back automatically; a thrown error surfaces through the
   * use case's programmer-error path (not the soft denial
   * branches).
   */
  applyReorder(input: {
    productId: string;
    parentId: string | null;
    entries: ReorderEntry[];
    now: Date;
  }): Promise<{ applied: true }>;
}
