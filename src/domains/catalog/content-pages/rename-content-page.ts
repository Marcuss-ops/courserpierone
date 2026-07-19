/**
 * src/domains/catalog/content-pages/rename-content-page.ts
 *
 * Pure use case — ONE canonical entry point for "rename the
 * default translation title of a ContentPage".
 *
 * ─── MCR Phase 1 — Notion-like pages feature ─────────────────────
 *
 * Orchestrates (in this exact order):
 *   1. PARSE        — validate `newTitle` against
 *                     `contentPageTitleSchema` (trim/empty/max).
 *                     Invalid → typed `invalid_title` denial.
 *   2. GUARD        — defensive empty-string rejection for
 *                     actorId, productId, pageId (collapsed to
 *                     `not_found` so the route layer can map
 *                     404 without leaking which field was blank).
 *   3. PRODUCT      — single port call to fetch
 *                     `{ defaultLanguage, creatorId }` and
 *                     verify product existence + ownership.
 *                     Missing → `not_found`. Wrong creator →
 *                     `forbidden`.
 *   4. PAGE         — single port call to verify the page
 *                     belongs to `input.productId`. Missing OR
 *                     cross-product → `not_found` (no info leak).
 *   5. LOCALE       — resolve the target translation locale:
 *                     `input.locale ?? product.defaultLanguage`.
 *   6. PERSIST      — strict UPDATE on the translation row.
 *                     Missing → typed `translation_not_found`.
 *   7. RETURN       — translate port result to the 5-branch
 *                     discriminated union.
 *
 * ─── Why pure (no Prisma import) ─────────────────────────────────
 *
 * ADR-0016 §1 dep direction:
 *   - This file: Domain layer. NO `@prisma/client` import.
 *   - Persistence goes through `RenameContentPagePort` (declared
 *     in `./rename-content-page-types`).
 *   - The Prisma adapter will live in a sibling file in a follow-up
 *     commit; the route composition root wires the adapter.
 *
 * Test stub: `tests/rename-content-page.test.ts` builds an
 * in-memory implementation of the port (no Prisma mock).
 *
 * ─── Why the edit flow is strict (no upsert) ────────────────────
 *
 * See the file-header rationale in `./rename-content-page-types`.
 * Summary: a rename that auto-creates a title-only translation
 * would create a `ContentPageTranslation` row with `document`
 * undefined (null JSONB), an inconsistent state. The editor
 * flow calls SaveContentDocument first (with a real document),
 * then Rename. The strict contract enforces that ordering.
 *
 * ─── Why the title is trimmed at the schema layer ───────────────
 *
 * All-whitespace titles are ambiguous (" " vs ""), hard to
 * render with consistent spacing in lists, and a common UI bug
 * (user submits before typing). `.trim().min(1)` rejects the
 * case AND locks the stored value to its trimmed form — no
 * double-trimming downstream.
 */

import { z } from "zod";

import {
  RenameContentPageDenialReason, // value import — used as Reason.X in the return branches below; the merged-binding export at the bottom does NOT bring the symbol into local scope
  contentPageTitleSchema,
  type RenameContentPageInput,
  type RenameContentPagePort,
  type RenameContentPageResult,
} from "./rename-content-page-types";

/**
 * Dependency injection contract. The use case NEVER imports
 * the Prisma adapter directly; the route composition root
 * wires it.
 */
export interface RenameContentPageDeps {
  port: RenameContentPagePort;
}

/**
 * Rename the default translation of a ContentPage.
 *
 * Returns the discriminated-union outcome. Never throws on
 * soft validation / ownership / not-found / conflict failures
 * (caller matches on `success` boolean + `reason` literal).
 *
 * Error surface (NEVER thrown from soft branches):
 *   - `not_found`              — product OR page missing OR
 *     page-in-different-product (collapsed for no info leak).
 *   - `forbidden`              — actorId !== product.creatorId.
 *   - `invalid_title`          — Zod schema violation; `error`
 *     is the ZodError for form-level diagnostics.
 *   - `translation_not_found`  — translation row missing for
 *     the resolved `(pageId, locale)`. The editor flow must
 *     call SaveContentDocument first.
 */
export async function renameContentPage(
  input: RenameContentPageInput,
  deps: RenameContentPageDeps,
): Promise<RenameContentPageResult> {
  // ─── 1. PARSE — validate newTitle ─────────────────────────────
  //
  // Use the SAFE variant so we return a typed denial instead of
  // throwing through the route's error boundary. Zod's `.trim()`
  // normalizes the input BEFORE the regex checks, so the error
  // path returns a fresh ZodError over the trimmed string (not
  // the raw input).
  const titleResult = contentPageTitleSchema.safeParse(input.newTitle);
  if (!titleResult.success) {
    return {
      success: false,
      reason: RenameContentPageDenialReason.InvalidTitle,
      error: new z.ZodError(titleResult.error.issues),
    };
  }

  // ─── 2. GUARD — defensive empty-input rejection ───────────────
  //
  // The route layer (e.g. session middleware) is the primary
  // gate; an empty actorId can only reach here via a future
  // caller that bypasses the route. We refuse rather than forge
  // an identity from empty string. The same collapse for
  // productId + pageId (no info leak about which field was blank).
  if (!input.actorId || !input.productId || !input.pageId) {
    return {
      success: false,
      reason: RenameContentPageDenialReason.NotFound,
    };
  }

  // ─── 3. PRODUCT — fetch defaultLanguage + creatorId ──────────
  //
  // Single read combining the two values we need (avoids a
  // second round-trip). Returns `null` when the product doesn't
  // exist → `not_found`. Wrong creator → `forbidden`.
  const productCtx = await deps.port.findProductLocaleAndOwner({
    productId: input.productId,
  });
  if (!productCtx) {
    return {
      success: false,
      reason: RenameContentPageDenialReason.NotFound,
    };
  }
  if (productCtx.creatorId !== input.actorId) {
    return {
      success: false,
      reason: RenameContentPageDenialReason.Forbidden,
    };
  }

  // ─── 4. PAGE — verify page belongs to product ────────────────
  //
  // Mirrors the CreateContentPage "page in same product" check.
  // Collapses both "page missing" and "page in different product"
  // to a single `not_found` reason — no info leak about whether
  // the page id exists under a DIFFERENT productId.
  const pageCtx = await deps.port.findPageProductId({
    pageId: input.pageId,
  });
  if (!pageCtx || pageCtx.productId !== input.productId) {
    return {
      success: false,
      reason: RenameContentPageDenialReason.NotFound,
    };
  }

  // ─── 5. LOCALE — resolve target translation ──────────────────
  //
  // Priority: explicit `input.locale` (when provided) wins over
  // the product's default. `null`/`undefined` falls back to
  // `productCtx.defaultLanguage` (DB default `"it"`).
  //
  // The locale is forwarded verbatim to the port. The use case
  // does NOT normalize case or split region tags — that's a
  // i18n-layer concern and lives outside the catalog domain.
  const locale: string = input.locale ?? productCtx.defaultLanguage;

  // ─── 6. PERSIST — strict UPDATE on the translation row ────────
  //
  // Clock is injectable for deterministic tests; the use case
  // supplies `input.now ?? new Date()` as a single resolution
  // point.
  const now = input.now ?? new Date();
  const portResult = await deps.port.renameContentPageTranslation({
    pageId: input.pageId,
    locale,
    title: titleResult.data,
    now,
  });

  // ─── 7. RETURN — translate port result to domain result ──────
  if (!portResult.updated) {
    return {
      success: false,
      reason: RenameContentPageDenialReason.TranslationNotFound,
      locale,
    };
  }

  return {
    success: true,
    title: portResult.title,
    locale,
    revision: portResult.revision,
    updatedAt: portResult.updatedAt,
  };
}

/**
 * Re-export the discriminated union + reason enum + port types
 * so callers can import everything they need from
 * `./rename-content-page` (single canonical entry point, mirrors
 * the save-content-document + create-content-page re-export
 * pattern).
 *
 * The merged-binding form is used for
 * `RenameContentPageDenialReason` (it's BOTH a const and a type
 * alias under the same identifier — same TS2300 workaround
 * documented in the prior PRs).
 */
export {
  RenameContentPageDenialReason, // value+type merged binding
  contentPageTitleSchema,         // schema re-exported so callers can validate client-side too
} from "./rename-content-page-types";
export type {
  // type-only names
  RenameContentPagePort,
  RenameContentPageResult,
  RenameContentPageInput,
} from "./rename-content-page-types";
