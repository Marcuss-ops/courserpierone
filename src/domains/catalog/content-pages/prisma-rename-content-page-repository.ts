/**
 * src/domains/catalog/content-pages/prisma-rename-content-page-repository.ts
 *
 * Prisma adapter for `RenameContentPagePort` (MCR Phase 1 —
 * Notion-like pages feature, content-page rename flow).
 *
 * ─── Adapter Layer (per ADR-0016 §1 dep direction) ──────────────
 *
 * Implements the port contract declared in `./rename-content-page-types`:
 *
 *   1. `findProductLocaleAndOwner` — single read combining
 *      `Product.defaultLanguage` + `Product.creatorId`. The use
 *      case (`renameContentPage`) needs both to verify ownership
 *      + resolve the default translation locale when the caller
 *      omitted `input.locale`.
 *
 *   2. `findPageProductId` — single read of `ContentPage.productId`
 *      for the "page belongs to this product" guard. Returns
 *      `null` when the page doesn't exist.
 *
 *   3. `renameContentPageTranslation` — STRICT UPDATE on the
 *      `(pageId, locale)` translation row. NO upsert. The use
 *      case's port contract mandates strict semantics (see
 *      `./rename-content-page-types.ts` file header for the
 *      rationale — auto-creating a title-only row would leave
 *      `document = null` in the DB, an inconsistent state).
 *
 * ─── Error mapping ──────────────────────────────────────────────
 *
 *   - `P2025` (`RecordNotFound`) → `{ updated: false, reason:
 *     "translation_not_found" }`. This is the PRIMARY failure
 *     mode: the strict UPDATE matched zero rows (race: row was
 *     deleted between the use case's pre-check and the UPDATE,
 *     or the row never existed because the editor flow forgot
 *     to call SaveContentDocument first).
 *
 *   - `P2002` (`UniqueConstraintViolation`) → BUBBLE. We do NOT
 *     change `pageId` or `locale` in the UPDATE — only `title`,
 *     `revision`, `updatedAt`. The schema's `@@unique([pageId,
 *     locale])` cannot be violated by our UPDATE shape, so P2002
 *     is structurally unreachable here. If it ever fires (e.g.,
 *     a future migration adds a unique constraint on title),
 *     the programmer-error path (route 500) is the correct
 *     surface — silently collapsing to `translation_not_found`
 *     would mask a real schema-drift bug.
 *
 *   - Any other error (connection, FK violation, schema drift)
 *     → bubble to the route's `apiErrorResponse` for 500.
 *
 * ─── Revision increment ─────────────────────────────────────────
 *
 * `ContentPageTranslation.revision` increments by 1 on every
 * UPDATE via the canonical `revision: { increment: 1 }` Prisma
 * shape. The new value is read back in the `select` and echoed
 * to the use case for the editor's optimistic-concurrency model
 * (shared with `SaveContentDocument`).
 *
 * ─── No transaction ─────────────────────────────────────────────
 *
 * Single UPDATE + read-back. No cross-row consistency
 * requirement. Wrapping in `$transaction` would add a
 * serialization point without benefit. The race against
 * concurrent renames of the SAME row is serialized by PG's
 * row lock acquired during the UPDATE.
 */

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

import type {
  RenameContentPagePort,
} from "./rename-content-page-types";

// ─── Adapter ────────────────────────────────────────────────────

/**
 * Canonical Prisma adapter — the only implementation. Wired
 * into the route composition root via the `port` dependency
 * injection parameter on `renameContentPage(input, { port })`.
 */
export const prismaRenameContentPageRepository: RenameContentPagePort = {
  // ─── findProductLocaleAndOwner ──────────────────────────────
  //
  // Single `findUnique` keyed by product PK. Returns `null` when
  // the product doesn't exist — the use case translates to
  // `not_found`. We `select` only the two fields the use case
  // needs (no over-fetch); `defaultLanguage` and `creatorId` are
  // both NOT NULL columns in the schema.
  async findProductLocaleAndOwner({ productId }) {
    if (!productId) return null;
    const row = await prisma.product.findUnique({
      where: { id: productId },
      select: {
        defaultLanguage: true,
        creatorId: true,
      },
    });
    if (!row) return null;
    return {
      defaultLanguage: row.defaultLanguage,
      creatorId: row.creatorId,
    };
  },

  // ─── findPageProductId ───────────────────────────────────────
  //
  // Single `findUnique` keyed by ContentPage PK. Returns `null`
  // when the page doesn't exist — the use case translates to
  // `not_found` (collapsing the page-not-in-product case to the
  // same outcome to avoid leaking page-id existence across
  // products).
  async findPageProductId({ pageId }) {
    if (!pageId) return null;
    const row = await prisma.contentPage.findUnique({
      where: { id: pageId },
      select: { productId: true },
    });
    if (!row) return null;
    return { productId: row.productId };
  },

  // ─── renameContentPageTranslation ───────────────────────────
  //
  // STRICT UPDATE on the compound `@@unique([pageId, locale])`
  // key. The `pageId_locale` identifier is Prisma's auto-
  // generated input type for the composite unique constraint.
  //
  // Failure mapping (see file header):
  //   - P2025 (RecordNotFound) → `{ updated: false, reason:
  //     "translation_not_found" }`. Primary failure mode.
  //   - P2002 (UniqueConstraintViolation) → bubble. Unreachable
  //     under the current UPDATE shape; surface as programmer
  //     error if a future schema change makes it possible.
  async renameContentPageTranslation({ pageId, locale, title, now }) {
    if (!pageId || !locale) {
      // Defensive — the use case never forwards empty ids, but
      // a future caller might. Returning the typed outcome (vs.
      // throwing) keeps the adapter's contract narrow.
      return { updated: false, reason: "translation_not_found" };
    }
    try {
      const row = await prisma.contentPageTranslation.update({
        where: { pageId_locale: { pageId, locale } },
        data: {
          title,
          revision: { increment: 1 },
          updatedAt: now,
        },
        select: {
          title: true,
          revision: true,
          updatedAt: true,
        },
      });
      return {
        updated: true,
        title: row.title,
        revision: row.revision,
        updatedAt: row.updatedAt,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
        // RecordNotFound → translation_not_found. PRIMARY
        // failure mode for the strict UPDATE.
        return { updated: false, reason: "translation_not_found" };
      }
      // P2002 and any other error bubble. See file header for
      // the rationale on leaving P2002 uncaught.
      throw error;
    }
  },
};
