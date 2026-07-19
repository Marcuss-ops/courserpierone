/**
 * src/domains/catalog/products/prisma-create-product-draft-repository.ts
 *
 * Prisma adapter for `CreateProductDraftRepository` (MCR Phase 1 —
 * Notion-like pages feature, draft bootstrapper).
 *
 * ─── Adapter Layer (per ADR-0016 §1 dep direction) ──────────────
 *
 * Imports the port contract from `./create-product-draft-types` and
 * exports a concrete implementation of `CreateProductDraftRepository`.
 * The use case (`./create-product-draft`) NEVER imports this file
 * directly — it receives the adapter via dependency injection at the
 * route's composition root.
 *
 * ─── Field-by-field SQL mapping ─────────────────────────────────
 *
 * Single `prisma.product.create` call:
 *   - `slug`        ← input.slug (validated upstream by
 *                     `contentSlugSchema`).
 *   - `creatorId`   ← input.actorId. CRITICAL: the field is
 *                     sourced from the `actorId` parameter on the
 *                     port input, which is the SESSION-DERIVED
 *                     identity (forwarded from `getServerUser()` by
 *                     the route). NEVER from any payload-derived
 *                     field. Defended by the type system: the input
 *                     shape doesn't expose a payload `creatorId`.
 *   - `contentKind` ← `PRODUCT_DRAFT_CONTENT_KIND` constant
 *                     (literal `"document_course"`). Hardcoded in
 *                     this adapter, not parameterized. Future kinds
 *                     are separate use cases.
 *   - `status`      ← `"draft"` (literal). Matches the DB default
 *                     but explicit for grep-ability + future
 *                     audit logging.
 *   - `templateId`, `defaultLanguage`, `price`, `currency`,
 *     `coverUrl`, `lemonVariantId` — all DB-defaulted.
 *     Omitted from the `data` object to let Prisma use the schema
 *     `@default` values.
 *
 * ─── Slug uniqueness (DB is SSOT) ─────────────────────────────────
 *
 * `Product.slug` has `@@unique` (Postgres). Concurrent creates for
 * the same slug fire `Prisma.PrismaClientKnownRequestError` with
 * code `P2002` for the first INSERT that loses the race. This
 * adapter catches P2002 and translates it to the typed
 * `{ created: false, reason: "slug_taken" }` outcome — no
 * TOCTOU pre-check, the DB is the source of truth for uniqueness.
 *
 * ─── Why no transaction ──────────────────────────────────────────
 *
 * Single INSERT with no follow-up reads/writes. Wrapping in
 * `prisma.$transaction(async tx => ...)` would add a serialization
 * point without benefit. The race-safety is provided by the
 * single-statement INSERT against the unique index.
 */

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

import {
  PRODUCT_DRAFT_CONTENT_KIND,
  type CreateProductDraftRepository,
  type ProductDraftRecord,
} from "./create-product-draft-types";

/**
 * Canonical Prisma adapter — the only implementation. Exported as
 * a module-level constant (the prisma client singleton is managed
 * via `globalForPrisma` so no overhead here).
 */
export const prismaCreateProductDraftRepository: CreateProductDraftRepository = {
  async createProductDraft(input) {
    try {
      // ─── Single SQL INSERT ─────────────────────────────────────
      //
      // `select` returns ONLY the fields ProductDraftRecord needs.
      // Prisma uses a single SQL `INSERT ... RETURNING ...` under
      // the hood (no N+1, no separate read).
      //
      // CRITICAL FIELD MAPPING (this is the security boundary):
      //   `creatorId: input.actorId` — the field on the DB row is
      //   `creatorId`, but the port input uses `actorId` (semantic
      //   distinction: identity of the acting user vs. ownership
      //   attribute). The rename happens ONCE here, in this single
      //   data literal. After this point, no payload field can
      //   influence `creatorId` because:
      //     - The port input has no `creatorId` field
      //     - The use case input has no `creatorId` field
      //     - The route forwards `actorId` from `getServerUser()` ONLY
      const product = await prisma.product.create({
        data: {
          slug: input.slug,
          creatorId: input.actorId,
          contentKind: PRODUCT_DRAFT_CONTENT_KIND,
          status: "draft",
        },
        select: {
          id: true,
          slug: true,
          creatorId: true,
          contentKind: true,
          status: true,
          defaultLanguage: true,
          price: true,
          currency: true,
          coverUrl: true,
          templateId: true,
          lemonVariantId: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      // ─── Map Prisma row → Domain record ────────────────────────
      //
      // Direct structural mapping: every field of ProductDraftRecord
      // maps 1:1 to the Prisma select. No transformation, no
      // normalization, no Date.toISOString() — caller decides
      // serialization. This adapter is pure pass-through.
      const record: ProductDraftRecord = {
        id: product.id,
        slug: product.slug,
        creatorId: product.creatorId,
        contentKind: product.contentKind,
        status: product.status,
        defaultLanguage: product.defaultLanguage,
        price: product.price,
        currency: product.currency,
        coverUrl: product.coverUrl,
        templateId: product.templateId,
        lemonVariantId: product.lemonVariantId,
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
      };

      return { created: true, product: record };
    } catch (error) {
      // ─── P2002 → slug_taken ───────────────────────────────────
      //
      // Prisma's known-error code for unique-constraint violations.
      // We verify it's exactly the slug field (vs. some other future
      // unique index that might also land here) by inspecting
      // `error.meta?.target`. Defensive — if Prisma ever adds
      // another unique on Product, we want to surface the right
      // reason, not silently swallow.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        // `meta.target` is an array of field names OR a string.
        // For a single-column unique like `Product.slug`, it's
        // typically `["slug"]` (Prisma 5). Older Prisma versions
        // returned a single string. Normalize both.
        const target = error.meta?.target;
        const fields = Array.isArray(target)
          ? target
          : typeof target === "string"
            ? [target]
            : [];
        // If a future unique on a different field collides, we
        // bubble it as a programmer error rather than masking it
        // as slug_taken. (Only collapse to slug_taken when slug is
        // the offender; otherwise throw.)
        if (fields.includes("slug")) {
          return { created: false, reason: "slug_taken" };
        }
      }
      // Anything else (connection failure, schema drift, FK violation)
      // is a PROGRAMMER error — bubble to the route's
      // `apiErrorResponse` for a 500.
      throw error;
    }
  },
};

/**
 * Type-narrowing helper exported for tests and (potentially) other
 * adapters that might want to detect P2002 without importing
 * `@prisma/client` (Prisma dependency stays isolated to this file).
 *
 * Currently unused outside this module, but exposed in case a future
 * adapter or test needs the check without duplicating the instanceof
 * dance.
 */
export function isPrismaUniqueConstraintError(
  error: unknown,
  field?: string,
): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== "P2002"
  ) {
    return false;
  }
  if (field === undefined) return true;
  const target = error.meta?.target;
  const fields = Array.isArray(target)
    ? target
    : typeof target === "string"
      ? [target]
      : [];
  return fields.includes(field);
}
