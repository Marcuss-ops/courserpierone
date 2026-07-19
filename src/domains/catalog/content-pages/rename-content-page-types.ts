/**
 * src/domains/catalog/content-pages/rename-content-page-types.ts
 *
 * Domain types + port contract for `renameContentPage`
 * (MCR Phase 1 — Notion-like content pages feature).
 *
 * ─── Architecture (per ADR-0016 §1 dep direction) ──────────────
 *
 * Declares, at the Domain layer:
 *   1. `RenameContentPageInput` — use case input.
 *   2. `RenameContentPageResult` — discriminated union result
 *      (typed denials, no AppError throws for soft failures).
 *   3. `RenameContentPagePort` — persistence port for the
 *      three-step read (product locale+owner, page-in-product,
 *      translation-rename). The Prisma adapter lives in a
 *      sibling file (separate commit, this PR is use-case only).
 *
 * ─── Why auto-create of translation is REJECTED ────────────────
 *
 * The SaveContentDocument use case is the canonical "create +
 * update" path; its `upsertTranslationDoc` creates a translation
 * row IF missing. `renameContentPage` is intentionally a
 * STRICT update — it returns `translation_not_found` when the
 * row is absent. Reasons:
 *
 *   - A rename that auto-creates an empty (title-only) row would
 *     yield a `ContentPageTranslation` with `document = ?` (null
 *     JSONB), creating a new data inconsistency.
 *   - The editor flow should ALWAYS hit SaveContentDocument first
 *     (with the document body), THEN Rename to update the title.
 *     This is the contract the editor implements; rename just
 *     enforces it.
 *   - Keeps the use case single-purpose: rename a known-existing
 *     translation's title. Not "upsert a title-only stub".
 *
 * ─── Why the title schema is a Zod string + trim() ─────────────
 *
 * `newTitle` is a trimmed string in [1, 200] characters after
 * trim(). Whitespace-only titles (`"   "`) collapse to empty and
 * are rejected (`invalid_title`). Upper bound of 200 chars
 * matches Notion's hard limit on page titles; the DB stores
 * `String` without `@db.Text` (title is short, not body text).
 */

import { z } from "zod";

// ─── Title schema ────────────────────────────────────────────────

/**
 * Page title validation. Trims then enforces non-empty +
 * 200-char upper bound.
 */
export const contentPageTitleSchema = z
  .string()
  .trim()
  .min(1, "page title must be non-empty after trimming")
  .max(200, "page title must be <= 200 characters");

// ─── Use case input ──────────────────────────────────────────────

/**
 * Input to `renameContentPage`.
 *
 * Field-by-field:
 *   - `actorId`   — User.id of the calling creator. Defense in
 *     depth: route layer has verified the session, but the use
 *     case re-checks `actorId === product.creatorId`.
 *   - `productId` — Product that owns the page. Used for
 *     ownership verification + for resolving the DEFAULT locale
 *     (when `locale` is not supplied).
 *   - `pageId`    — ContentPage being renamed.
 *   - `locale`    — Optional. The translation locale to update.
 *     When null/undefined, the use case resolves the page's
 *     DEFAULT translation by reading `Product.defaultLanguage`
 *     (default `"it"`). When a value is supplied, it MUST match
 *     a BCP-47 tag; the use case forwards verbatim (no
 *     normalization).
 *   - `newTitle`  — The replacement title. Validated via
 *     `contentPageTitleSchema` BEFORE the port call.
 *   - `now`       — Testable clock injection. Defaults to
 *     `new Date()` at the call site.
 *
 * Note: the use case NEVER accepts `actorRole` or session
 * cookies directly — these concerns are route-layer only.
 */
export interface RenameContentPageInput {
  actorId: string;
  productId: string;
  pageId: string;
  locale?: string | null;
  newTitle: string;
  now?: Date;
}

// ─── Discriminated union result ──────────────────────────────────

/**
 * Five exhaustive outcomes:
 *   - `success: true` — translation renamed; `title` echoed
 *     back, `locale` is the ACTUAL locale updated (resolves
 *     to product.defaultLanguage when caller omitted input),
 *     `revision` is the NEW post-update revision (= old + 1 —
 *     mirrors SaveContentDocument's revision contract for
 *     shared editor's optimistic concurrency model), `updatedAt`
 *     is the new row timestamp.
 *   - `success: false` (4 reason branches)
 *     - `not_found` — Product doesn't exist OR page doesn't
 *       exist OR page is not part of `productId` (collapsed
 *       to avoid leaking page-id existence across products).
 *     - `forbidden` — `actorId !== product.creatorId`.
 *     - `invalid_title` — `newTitle` failed the trim/empty/
 *       max-length validation. `error` carries the ZodError so
 *       the form can highlight the field.
 *     - `translation_not_found` — The translation row for
 *       `(pageId, locale)` doesn't exist. The editor flow must
 *       call SaveContentDocument first. `locale` echoes the
 *       resolved locale (NOT the product's default, to help
 *       the client show what was being looked up).
 */
export type RenameContentPageResult =
  | {
      success: true;
      title: string;
      locale: string;
      revision: number;
      updatedAt: Date;
    }
  | { success: false; reason: "not_found" }
  | { success: false; reason: "forbidden" }
  | { success: false; reason: "invalid_title"; error: z.ZodError }
  | {
      success: false;
      reason: "translation_not_found";
      locale: string;
    };

/**
 * Stable string union of denial reasons. Mirrors the
 * `CreateContentPageDenialReason` pattern.
 */
export const RenameContentPageDenialReason = {
  NotFound: "not_found",
  Forbidden: "forbidden",
  InvalidTitle: "invalid_title",
  TranslationNotFound: "translation_not_found",
} as const;

export type RenameContentPageDenialReason =
  (typeof RenameContentPageDenialReason)[keyof typeof RenameContentPageDenialReason];

// ─── Port contract ───────────────────────────────────────────────

/**
 * Persistence port for the rename flow.
 *
 * Three methods:
 *   1. `findProductLocaleAndOwner` — single read combining
 *      `defaultLanguage` + `creatorId` so the use case can
 *      resolve ownership + resolve-the-default-translation
 *      locale in one trip.
 *   2. `findPageProductId` — same shape as the CreateContentPage
 *      port's method: returns the page's productId for the
 *      page-in-same-product check.
 *   3. `renameContentPageTranslation` — strict UPDATE on an
 *      EXISTING translation row. The adapter is responsible
 *      for:
 *        - Issuing `UPDATE ... SET title = $title, revision =
 *          revision + 1, updatedAt = $now WHERE pageId = $pageId
 *          AND locale = $locale`. Returns
 *          `{ updated: true, title, revision, updatedAt }` on
 *          1 row affected.
 *        - Returning `{ updated: false, reason:
 *          "translation_not_found" }` on 0 rows affected (race:
 *          the row was deleted between the use case's pre-check
 *          and the UPDATE; or the row never existed).
 *        - The adapter does NOT insert (the design choice
 *          explained in the file header). If a future PR wants
 *          an upsert, that's a separate use case + port (to
 *          keep this PR's semantics clean).
 *
 * The dependency direction (Domain → Port) matches ADR-0016 §1;
 * the Prisma adapter lives in a sibling file and is registered
 * by the route's composition root.
 */
export interface RenameContentPagePort {
  /**
   * Combined read of a product's defaultLanguage + creatorId.
   * Returns `null` when the product doesn't exist.
   */
  findProductLocaleAndOwner(input: {
    productId: string;
  }): Promise<{ defaultLanguage: string; creatorId: string } | null>;

  /**
   * Look up the productId the page belongs to. Returns `null`
   * if the page doesn't exist. Used to verify
   * `(page.productId === input.productId)`.
   */
  findPageProductId(input: {
    pageId: string;
  }): Promise<{ productId: string } | null>;

  /**
   * Persist the new title.
   *
   * Strict UPDATE: does NOT create. Returns
   * `translation_not_found` when the row is missing.
   */
  renameContentPageTranslation(input: {
    pageId: string;
    locale: string;
    title: string;
    now: Date;
  }): Promise<
    | { updated: true; title: string; revision: number; updatedAt: Date }
    | { updated: false; reason: "translation_not_found" }
  >;
}
