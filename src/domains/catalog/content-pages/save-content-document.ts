/**
 * src/domains/catalog/content-pages/save-content-document.ts
 *
 * Pure use case — ONE canonical entry point for "save the structured
 * document for a content page translation".
 *
 * ─── MCR Phase 1 — Notion-like pages feature ─────────────────────
 *
 * Orchestrates (in this exact order):
 *   1. PARSE        — validate input.document against ContentDocumentV1
 *                     (schemaVersion=1, structural blocks, no free HTML).
 *                     Invalid → return typed `invalid_document` denial.
 *   2. CONTEXT      — verify product + page existence and ownership.
 *                     Missing → `not_found`. Wrong owner → `forbidden`.
 *   3. EXTRACT      — derive `plainText` eagerly via
 *                     `extractDocumentText` so search/SEO/AI
 *                     consumers see the new content immediately.
 *   4. PERSIST      — delegate to `ContentPageTranslationRepository.
 *                     upsertTranslationDoc` with the optimistic-
 *                     concurrency token (`expectedRevision`).
 *   5. RETURN       — translate the port's `saved | !saved` result
 *                     into the domain discriminated union:
 *                     `success: true` (with new revision + updatedAt)
 *                     or `success: false, reason: "conflict"` (with
 *                     `currentRevision` for the client to refetch).
 *
 * ─── Why pure (no Prisma import) ─────────────────────────────────
 *
 * ADR-0016 §1 dep direction:
 *   - This file: Domain layer (use case). NO `@prisma/client` import.
 *   - The persistence side is `ContentPageTranslationRepository`
 *     (port, declared in `./save-content-document-types`).
 *   - The Prisma adapter will live in a sibling file in a follow-up
 *     commit; the route composition root wires the adapter into
 *     the `deps` argument at call time.
 *
 * Test stub: `tests/save-content-document.test.ts` builds an
 * in-memory implementation of the port (no Prisma mock).
 *
 * ─── Why eager plainText extraction ─────────────────────────────
 *
 * `ContentPageTranslation.plainText` (nullable `@db.Text`) is the
 * denormalized index for full-text search and SEO meta. The DB
 * column is nullable specifically so a future background worker
 * could lazy-fill it — but the worker adds latency, requires a
 * status-event surface, and the extraction itself is cheap
 * (`O(blocks.length)`). Same-row UPDATE means we already pay for
 * one DB write; adding `plainText` to the SET clause costs
 * nothing in network round-trips and makes the index consistent
 * with the structured doc at all times.
 *
 * ─── Why a discriminated union return (vs. throws) ──────────────
 *
 * Mirrors the watchlist / offer-card pattern. Autosave callers
 * (the editor) need typed signals to drive UI:
 *   - `conflict`         → refetch + toast "another tab saved"
 *   - `invalid_document` → highlight the failing block via
 *                          ZodError.issue.path
 *   - `not_found`        → "page was deleted" UI
 *   - `forbidden`        → "lost edit access" UI
 *
 * Prisma-level errors (connection failures, schema drift) are
 * PROGRAMMER errors and propagate to the route's
 * `apiErrorResponse` for a 500 response.
 *
 * ─── Conflict semantics ─────────────────────────────────────────
 *
 * The `revision` field on `ContentPageTranslation` is the canonical
 * optimistic-concurrency token (documented in `prisma/schema.prisma`
 * on the `ContentPageTranslation` model).
 *
 * The adapter's responsibility (so this use case doesn't have to
 * know about transactions): atomically check-and-set the revision.
 * Race-safety comes from the adapter using `prisma.updateMany`
 * with a WHERE clause that includes the revision (Prisma translates
 * this to a single conditional UPDATE in PG — atomic at the row
 * level). The pre-check is a separate read for the conflict-
 * current-revision lookup, NOT for safety.
 */

import {
  extractDocumentText,
  safeParseContentDocumentV1,
} from "@/domains/catalog/blocks";

import type {
  ContentPageTranslationRepository,
  SaveContentDocumentInput,
  SaveContentDocumentResult,
} from "./save-content-document-types";

/**
 * Dependency injection contract. The use case NEVER imports the
 * Prisma adapter directly; the route composition root wires it.
 *
 * `repo` is the only required dep in this PR. Future extensions
 * (analytics port, lock-management port) would land in this same
 * interface without breaking the call sites.
 */
export interface SaveContentDocumentDeps {
  repo: ContentPageTranslationRepository;
}

/**
 * Default title used when the adapter's UPSERT hits the create
 * branch (no ContentPageTranslation row pre-existed for the
 * `(pageId, locale)` pair). Title is intentionally NOT exposed in
 * `SaveContentDocumentInput` to keep the use-case surface focused
 * on document persistence — title rename is a separate concern.
 */
const DEFAULT_FALLBACK_TITLE = "Untitled";

/**
 * Save the structured document for a content page translation.
 *
 * Returns the discriminated-union outcome. Never throws on soft
 * validation/ownership/conflict failures (caller matches on the
 * `success` boolean + `reason` literal).
 *
 * Concurrency contract:
 *   - On the create branch (no row existed), the returned `revision`
 *     is always `1`, regardless of the client's `expectedRevision`.
 *   - On the update branch, the returned `revision` is always
 *     `expectedRevision + 1` IF the write succeeded. The client is
 *     expected to store this and pass it back as `expectedRevision`
 *     on the next save round.
 *
 * Error surface (NEVER thrown from soft branches):
 *   - `invalid_document` — input.document failed Zod schema or
 *     the free-HTML heuristic. The ZodError is exposed so the UI
 *     can highlight block-level diagnostics.
 *   - `not_found`         — Product doesn't exist OR page doesn't
 *     belong to the product (collapsed to avoid leaking cross-
 *     product page-id existence).
 *   - `forbidden`         — `actorId !== product.creatorId`. Admin
 *     override is intentionally NOT in scope for this use case —
 *     if admins need to edit, the route layer (with admin session
 *     check) wraps a separate `adminSaveContentDocument` thin
 *     wrapper later.
 *   - `conflict`          — DB's revision is ahead of client's
 *     `expectedRevision`. The adapter's pre-check + atomic
 *     conditional update ensures we surface this cleanly.
 */
export async function saveContentDocument(
  input: SaveContentDocumentInput,
  deps: SaveContentDocumentDeps,
): Promise<SaveContentDocumentResult> {
  // ─── 1. PARSE — validate document shape and HTML-freeness ─────
  //
  // We use the SAFE variant (not `parseContentDocumentV1`) so we
  // can return the typed `invalid_document` branch with the ZodError
  // instead of throwing through the route's error boundary.
  const parseResult = safeParseContentDocumentV1(input.document);
  if (!parseResult.ok) {
    return {
      success: false,
      reason: "invalid_document",
      error: parseResult.error,
    };
  }
  const validatedDocument = parseResult.data;

  // ─── 2. CONTEXT — existence + ownership check ────────────────
  //
  // Done in TWO defensive branches before any write so we never
  // half-mutate the DB. The port's `findProductAndPageContext`
  // collapses three DB conditions (no product / no page /
  // wrong owner) into the two return shapes we model here.
  const context = await deps.repo.findProductAndPageContext({
    productId: input.productId,
    pageId: input.pageId,
  });

  if (!context) {
    // Product doesn't exist (or the lookup wasn't possible).
    return { success: false, reason: "not_found" };
  }

  if (!context.pageExists) {
    // Page doesn't belong to this product — collapse to
    // "not_found" to avoid leaking whether the page ID exists
    // under a different product (defensive; matches the
    // watchlist "no info leak" pattern).
    return { success: false, reason: "not_found" };
  }

  if (context.productCreatorId !== input.actorId) {
    // Caller isn't the product's creator. Admins are out of
    // scope for this use case; if a future PR adds admin-edit,
    // it'll be a separate use case (or wrap this one with an
    // `actor.isAdmin` bypass in the route layer).
    return { success: false, reason: "forbidden" };
  }

  // ─── 3. EXTRACT — eager plainText derivation ─────────────────
  //
  // `ContentPageTranslation.plainText` is the denormalized index
  // for full-text search + SEO + AI tooling. Extracting eagerly
  // keeps the index consistent with `document` at all times —
  // no worker latency, no background-event surface, and the
  // extraction is `O(blocks)` (already paid for by the UPDATE).
  const plainText = extractDocumentText(validatedDocument);

  // ─── 4. PERSIST — port call with optimistic concurrency ───────
  //
  // The adapter is responsible for:
  //   (a) re-validating `document` (defense in depth; we just
  //       validated but the port contract types it as `unknown`)
  //   (b) reading the current revision + atomically conditional
  //       updating via `prisma.updateMany` on the (pageId, locale)
  //       unique key
  //   (c) creating the row on the first-save branch
  const upsertResult = await deps.repo.upsertTranslationDoc({
    pageId: input.pageId,
    locale: input.locale,
    document: validatedDocument,
    plainText,
    expectedRevision: input.expectedRevision,
    fallbackTitle: input.fallbackTitle ?? DEFAULT_FALLBACK_TITLE,
    now: input.now ?? new Date(),
  });

  // ─── 5. RETURN — translate port outcome to domain result ──────
  if (!upsertResult.saved) {
    return {
      success: false,
      reason: "conflict",
      currentRevision: upsertResult.currentRevision,
    };
  }

  return {
    success: true,
    revision: upsertResult.revision,
    updatedAt: upsertResult.updatedAt,
  };
}

/**
 * Re-export the discriminated union and reason enum so callers can
 * import everything they need from `./save-content-document`
 * (single canonical entry point for the use case shape).
 *
 * Mirrors the `watchlist.ts` re-export pattern: the port and types
 * are technically in a sibling types file, but for ergonomics the
 * use case module re-exports the public surface so consumers don't
 * have to know the internal type-file split.
 */
// `SaveContentDocumentDenialReason` is declared in the types file as
// BOTH a `const` (the `as const` enum-shaped object) AND a `type`
// alias under the same identifier — TypeScript treats this as a
// merged binding occupying both namespaces simultaneously.
//
// To re-export a merged binding without triggering TS2300, we use
// the value form (which re-exports BOTH namespaces implicitly) and
// then re-export the type-only names separately. Putting the name
// in BOTH `export { ... }` and `export type { ... }` would declare
// the binding twice → TS2300.
// See https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-5.html#type-on-exported-names
export {
  SaveContentDocumentDenialReason, // re-exports value + type (merged binding)
} from "./save-content-document-types";
export type {
  // type-only names
  ContentPageTranslationRepository,
  SaveContentDocumentInput,
  SaveContentDocumentResult,
  FindProductAndPageContextResult,
  UpsertTranslationDocInput,
  UpsertTranslationDocResult,
} from "./save-content-document-types";
