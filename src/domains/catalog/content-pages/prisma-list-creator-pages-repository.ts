/**
 * src/domains/catalog/content-pages/prisma-list-creator-pages-repository.ts
 *
 * Prisma adapter wiring for `ListCreatorPagesPort` (Domain
 * port declared in `./list-creator-pages-types`).
 *
 * ─── Architecture (per ADR-0016 §1 dep direction) ──────────────
 *
 * This is the ONLY file in the listCreatorPages area that
 * imports `@prisma/client`. UI / use case / types / tests
 * import only via the use case's `deps.repo`, never directly.
 *
 * Two port methods:
 *   1. `findProductOwner`            — single PK read.
 *   2. `listContentPagesWithDefaultTitle` — single findMany
 *      with a sub-select that brings in the default-language
 *      translation's title (LEFT JOIN-style via Prisma's
 *      `translations: { where, take, select }` clause).
 *
 * ─── Why ONE LATERAL subquery (not two queries) ────────────────
 *
 * Splitting into "list pages, then list translations" would
 * generate a 2-query plan + manual JOIN on the use-case side.
 * Prisma translates the single findMany + nested sub-select
 * into one SQL with a subquery on `ContentPageTranslation`,
 * which is what Postgres's planner optimizes into a HASH
 * join. Net: one DB roundtrip, one result-set marshaling.
 *
 * The use case trusts the adapter's per-row shape: `title` is
 * `null` when no matching translation row exists in the
 * default language. The sidebar renders the slot using `slug`
 * when `title` is null.
 *
 * ─── Status handling at the READ seam ──────────────────────────
 *
 * The DB accepts any string for `ContentPage.status` (no
 * column-level CHECK constraint, no Prisma enum — validated
 * application-side). At READ time, legacy rows with unknown
 * statuses should not crash the sidebar. The use case's
 * `coerceStatus` helper handles this on the Domain layer; the
 * adapter forwards verbatim without filtering.
 */

import { prisma } from "@/lib/db/prisma";

import type {
  ListCreatorPagesPageRow,
  ListCreatorPagesPort,
  PageStatus,
} from "./list-creator-pages-types";

// ─── Adapter row shape (Prisma's findMany select with subselect) ─

/**
 * Row shape returned by the inner query. Mirrors the Prisma
 * select block below. Extracted as a TS interface so the
 * typecheck catches mistyped keys at compile time (the
 * `prisma.contentPage.findMany` call site uses literal keys).
 */
interface PrismaContentPageRow {
  id: string;
  parentId: string | null;
  slug: string;
  position: number;
  status: string;
  updatedAt: Date;
  translations: { title: string }[];
}

// ─── Row mapper ─────────────────────────────────────────────────

/**
 * Convert one Prisma row + the parent product's default
 * language to the Domain DTO. The defaultLanguage is supplied
 * by the use case (forwarded verbatim so the row carries the
 * echo for the sidebar component).
 *
 * Note: the `title` from the relation is the FIRST matched
 * translation row's title. We take index 0 because the Prisma
 * sub-select already applies `take: 1` and `where: { locale }`.
 * No null-handling needed at this layer; the use case receives
 * `title: <undefined>` as `null` via the findMany result.
 */
function toPageRow(
  row: PrismaContentPageRow,
  defaultLanguage: string,
): ListCreatorPagesPageRow {
  return {
    id: row.id,
    parentId: row.parentId,
    slug: row.slug,
    position: row.position,
    // Cast through `string` here — the Domain `coerceStatus`
    // narrows to the PageStatus union at the use-case layer.
    status: row.status as PageStatus,
    title: row.translations[0]?.title ?? null,
    defaultLanguage,
    updatedAt: row.updatedAt,
  };
}

// ─── Adapter ────────────────────────────────────────────────────

/**
 * Module-exported Prisma adapter. The page.tsx composition
 * root imports this directly and forwards as `deps.repo` to
 * the use case. Production wiring (server startup) and unit
 * tests both use this object.
 */
export const prismaListCreatorPagesRepository: ListCreatorPagesPort = {
  // ─── findProductOwner ─────────────────────────────────────
  //
  // Single primary-key read. Both fields the use case needs
  // (creatorId + defaultLanguage) are selected together so
  // we don't pay a second roundtrip per request.
  async findProductOwner({ productId }) {
    if (!productId) return null;
  const row = await prisma.product.findFirst({
    where: { id: productId, deletedAt: null },
      select: {
        creatorId: true,
        defaultLanguage: true,
      },
    });
    if (!row?.creatorId) return null;
    return {
      creatorId: row.creatorId,
      defaultLanguage: row.defaultLanguage,
    };
  },

  // ─── listContentPagesWithDefaultTitle ─────────────────────
  //
  // Single findMany with a sub-select on the translations
  // relation. The sub-select is filtered by the default
  // language + take 1, so the row carries at most one
  // translation. The `title` field is `null` in the use case
  // if the translations array is empty.
  async listContentPagesWithDefaultTitle({ productId, defaultLanguage }) {
    if (!productId) return { items: [] };

    const rows = await prisma.contentPage.findMany({
      where: { productId },
      // OrderBy matches the use case's spec: parentId ASC
      // (with NULLS FIRST so root pages come BEFORE children,
      // and children group with their parent), then position
      // ASC within the scope. The shadow-array sort on the
      // client side mirrors this so optimistic reorder can
      // POST the full sibling set in contiguous positions.
      //
      // We use `parentId: "asc"` here; Prisma passes NULLs
      // FIRST by default in PostgreSQL which matches the
      // tree-builder's expectation (roots → branches).
      orderBy: [{ parentId: "asc" }, { position: "asc" }],
      select: {
        id: true,
        parentId: true,
        slug: true,
        position: true,
        status: true,
        updatedAt: true,
        translations: {
          where: { locale: defaultLanguage },
          take: 1,
          select: { title: true },
        },
      },
    });

    const items: ListCreatorPagesPageRow[] = rows.map((r) =>
      toPageRow(
        {
          id: r.id,
          parentId: r.parentId,
          slug: r.slug,
          position: r.position,
          status: r.status,
          updatedAt: r.updatedAt,
          translations: r.translations,
        },
        defaultLanguage,
      ),
    );

    return { items };
  },
};
