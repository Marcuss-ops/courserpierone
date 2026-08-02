/**
 * src/domains/catalog/content-pages/save-content-document-types.ts
 *
 * Domain types + port contract for `SaveContentDocument` (MCR Phase 1 —
 * Notion-like content pages feature).
 *
 * ─── Architecture (per ADR-0016 §1 dep direction) ──────────────
 *
 * This file lives at the Domain layer. It declares:
 *   1. The use-case input shape (`SaveContentDocumentInput`).
 *   2. The discriminated-union result (`SaveContentDocumentResult`)
 *      — mirrors `watchlist` pattern: typed denials, no `AppError`
 *      throws for soft failures (not_found / forbidden / conflict /
 *      invalid_document). Validation failures carry the ZodError so
 *      the UI can show block-level diagnostics.
 *   3. The persistence port (`ContentPageTranslationRepository`)
 *      — pure TypeScript interface; the Prisma adapter lives in a
 *      sibling file (separate commit, this PR is use-case-only).
 *
 * ─── Why discriminated-union return instead of thrown AppErrors ─
 *
 * Autosave from the creator's editor requires precise typed signals
 * for the front end:
 *   - `conflict`         → client re-fetches and shows "another
 *     browser tab saved; reload to merge" toast
 *   - `invalid_document` → client highlights the offending block
 *     (the ZodError `issue.path` is the block index)
 *   - `not_found`        → 404, page was deleted under us
 *   - `forbidden`        → 403, lost admin/creator edit rights
 *
 * Throws are reserved for programmer errors and unexpected
 * conditions (Prisma connection failures, etc.). Soft denials are
 * return-shaped so the route's `apiErrorResponse` mapper can stay
 * branchless on the happy path.
 *
 * ─── Conflict semantics (the `revision` field) ─────────────────
 *
 * `ContentPageTranslation.revision` is the optimistic-concurrency
 * token. The editor sends its last-read revision as
 * `expectedRevision`. The adapter:
 *
 *   - If the row doesn't exist yet → create with `revision = 1`
 *     (first save, regardless of what `expectedRevision` was).
 *   - If the row exists AND `db.revision === expectedRevision` →
 *     `UPDATE ... SET revision = revision + 1` succeeds.
 *   - If the row exists BUT `db.revision !== expectedRevision` →
 *     adapter returns `{ saved: false, currentRevision: db.revision }`
 *     and the use case surfaces `conflict`.
 *
 * The use case treats `expectedRevision = 0` as "I believe this is
 * the first save" — semantically equivalent to `expectedRevision = 1`
 * for the create branch (row never existed → no revision to compare).
 * The adapter normalizes this so the use case doesn't have to.
 */

import { z } from "zod";


// ─── Use case input ──────────────────────────────────────────────

/**
 * Input to the `saveContentDocument` use case.
 *
 * Field-by-field:
 *   - `actorId`        — User.id of the calling creator/admin.
 *     Defense-in-depth: the route has already verified the session,
 *     but the use case re-checks `actorId === product.creatorId` so
 *     a future caller (cron replay, queue worker) can't bypass
 *     ownership by accident.
 *   - `productId`      — ContentPage.productId. Required to resolve
 *     ownership (creator lives on Product, not on ContentPage).
 *   - `pageId`         — ContentPage.id being saved.
 *   - `locale`         — BCP-47 tag ("it", "en", "es", ...). One
 *     ContentPage can have N translations; each save targets one.
 *   - `expectedRevision` — Client's last-read revision. `0` means
 *     "first save" (the client never saw a row). The mismatch
 *     branch is `conflict`.
 *   - `document`       — Untrusted JSON from the client. Validated
 *     against `contentDocumentV1Schema` + free-HTML guard inside
 *     the use case; the adapter re-validates (defense in depth).
 *   - `fallbackTitle`  — Only used on the CREATE branch (no row
 *     pre-existed). Title renaming is a SEPARATE future use case
 *     (`RenameContentPageTranslation`) — keeping concerns split.
 *   - `now`            — Injectable clock for deterministic tests.
 *     Defaults to `new Date()` at the call site.
 */
export interface SaveContentDocumentInput {
  actorId: string;
  productId: string;
  pageId: string;
  locale: string;
  expectedRevision: number;
  document: unknown;
  fallbackTitle?: string;
  now?: Date;
}

// ─── Discriminated union result ──────────────────────────────────

/**
 * Five exhaustive outcomes:
 *   - `success: true`        — saved; `revision` is the NEW value
 *     (always `expectedRevision + 1` on update, `1` on create);
 *     `updatedAt` mirrors what was written to the DB row.
 *   - `success: false` (4 reason branches)
 *     - `conflict`            — DB revision != expectedRevision;
 *       `currentRevision` tells the client what to refetch.
 *     - `invalid_document`   — Schema or free-HTML violation;
 *       `error` is the ZodError so the UI can route diagnostics.
 *     - `not_found`           — Product or Page doesn't exist.
 *     - `forbidden`           — Caller isn't the product's creator.
 */
export type SaveContentDocumentResult =
  | { success: true; revision: number; updatedAt: Date }
  | { success: false; reason: "conflict"; currentRevision: number }
  | { success: false; reason: "invalid_document"; error: z.ZodError }
  | { success: false; reason: "not_found" }
  | { success: false; reason: "forbidden" };

/**
 * Stable string union of denial reasons — mirrors the
 * `WatchlistDenialReason` pattern. Callers SHOULD compare via the
 * `reason` field of the result (typed), not against these strings
 * directly. Exposed for dispatch tables / `instanceof`-free
 * `switch` checks.
 */
export const SaveContentDocumentDenialReason = {
  Conflict: "conflict",
  InvalidDocument: "invalid_document",
  NotFound: "not_found",
  Forbidden: "forbidden",
} as const;

export type SaveContentDocumentDenialReason =
  (typeof SaveContentDocumentDenialReason)[keyof typeof SaveContentDocumentDenialReason];

// ─── Port contract ───────────────────────────────────────────────

/**
 * Combined read for ownership + page-scoped existence.
 *
 * Returned shape:
 *   - `null`                — Product doesn't exist → use case
 *                             returns `not_found`.
 *   - `{ productCreatorId, pageExists: false }` — Product exists,
 *                             page does NOT belong to it →
 *                             use case returns `not_found` (don't
 *                             leak whether the page exists in a
 *                             different product).
 *   - `{ productCreatorId, pageExists: true }`  — Page exists
 *                             in the product → use case verifies
 *                             ownership against `actorId`.
 *
 * The `null` for "no product" + the `pageExists: false` are
 * collapsed into a single `not_found` outcome at the use case to
 * avoid leaking page-id existence across products. (Matches the
 * watchlist/enrollFreeCourse "defensive 404" pattern.)
 */
export interface FindProductAndPageContextResult {
  productCreatorId: string;
  pageExists: boolean;
}

/**
 * Port for the persistence side of the content-pages write path.
 *
 * Two methods:
 *   1. `findProductAndPageContext` — read-only existence +
 *      ownership lookup (used BEFORE the write).
 *   2. `upsertTranslationDoc`     — conditional upsert with
 *      optimistic concurrency (used AS the write).
 *
 * The dependency direction (Domain → Port) matches ADR-0016 §1;
 * the Prisma adapter lives in a sibling file and is registered
 * by the route's composition root.
 */
export interface ContentPageTranslationRepository {
  /**
   * Resolve ownership + page-scoped existence in a single round-trip.
   * See `FindProductAndPageContextResult` for return semantics.
   */
  findProductAndPageContext(input: {
    productId: string;
    pageId: string;
  }): Promise<FindProductAndPageContextResult | null>;

  /**
   * Persist the new translation document.
   *
   * The adapter is responsible for:
   *   - Re-validating `document` against `contentDocumentV1Schema`
   *     (defense in depth — the use case has already validated).
   *   - Pre-checking the existing row's `revision` against
   *     `expectedRevision` and returning a conflict signal if
   *     they differ (race-safe via `prisma.updateMany` on the
   *     compound unique key OR a `$transaction`).
   *   - On conflict, returning the CURRENT DB revision so the
   *     client knows what to refetch.
   *   - On create branch (no row exists), using `fallbackTitle`
   *     as the new translation's `title`. (Title rename is out of
   *     scope for this use case.)
   *
   * Outputs:
   *   - `{ saved: true, revision, updatedAt }` on success.
   *     `revision` is the new DB revision (always `expectedRevision + 1`
   *     on update path, `1` on create path).
   *   - `{ saved: false, currentRevision }` on conflict. The
   *     use case surfaces this as `conflict` to the caller.
   *
   * NOTE: `document` is typed as `unknown` here because the
   * use case has already narrowed it to `ContentDocumentV1` and
   * we want to force the adapter to re-validate. A typing it as
   * `ContentDocumentV1` would let the adapter skip the
   * schema check, which is what defense-in-depth is meant to
   * prevent.
   */
  upsertTranslationDoc(input: UpsertTranslationDocInput): Promise<UpsertTranslationDocResult>;
}

/**
 * Input for `upsertTranslationDoc`. All fields are mandatory —
 * the use case computes `plainText` (eager extraction) and
 * `now` (testable clock) before calling.
 */
export interface UpsertTranslationDocInput {
  pageId: string;
  locale: string;
  document: unknown;
  plainText: string;
  expectedRevision: number;
  fallbackTitle: string;
  now: Date;
}

/**
 * Output for `upsertTranslationDoc`. The discriminator is
 * `saved: boolean`.
 */
export type UpsertTranslationDocResult =
  | { saved: true; revision: number; updatedAt: Date }
  | { saved: false; currentRevision: number };
