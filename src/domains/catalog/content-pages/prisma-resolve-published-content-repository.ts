/**
 * src/domains/catalog/content-pages/prisma-resolve-published-content-repository.ts
 *
 * Prisma adapter implementing `ResolvePublishedContentPort`
 * (the Domain port from `./resolve-published-content-types`).
 *
 * ─── Why raw SQL (not Prisma findMany) ────────────────────────
 *
 * The port requires locale-chain resolution: for each
 * ContentPage, return the FIRST translation whose locale is
 * in the `locales[]` chain. Achieving this with Prisma's
 * typed `findMany` + nested query would require either:
 *   - N+1 roundtrips (one query per locale, per page)
 *   - A custom relation `where` with `orderBy` that orders
 *     by "external array position" — not supported by Prisma's
 *     type-safe orderBy (only by literal column names)
 *
 * Raw SQL with a `LEFT JOIN LATERAL` + `array_position()`
 * expresses the policy in a single roundtrip, with PG's
 * planner optimizing the sub-select via the
 * `@@index([pageId])` on ContentPageTranslation.
 *
 * ─── SQL shape ─────────────────────────────────────────────────
 *
 *   SELECT cp.id, cp."parentId", cp.slug, cp.position,
 *          cp."publishedAt",
 *          t.title, t.document, t.revision, t.locale
 *   FROM "ContentPage" cp
 *   LEFT JOIN LATERAL (
 *     SELECT title, document, revision, locale
 *     FROM "ContentPageTranslation"
 *     WHERE "pageId" = cp.id
 *       AND locale = ANY($locales::text[])
 *     ORDER BY array_position($locales::text[], locale) ASC
 *     LIMIT 1
 *   ) t ON true
 *   WHERE cp."productId" = $productId
 *     AND cp.status = 'published'
 *   ORDER BY cp."parentId" NULLS FIRST, cp.position ASC
 *
 * The LATERAL subquery picks at most ONE translation per
 * page (LIMIT 1) — the first locale in the chain that has a
 * translation row. `array_position` returns the 1-based index
 * of the locale in the chain array; sorting ASC means the
 * primary locale wins over the fallback.
 *
 * `LEFT JOIN LATERAL ... ON true` is the canonical PG pattern
 * for "pick the first matching row per outer row, possibly
 * none". When the translation is missing, the LATERAL
 * yields NULL and the JOIN's columns come back NULL — the
 * use case surfaces `title: null, document: null, ...`.
 *
 * ─── Adapter scoping (ADR-0018 §b) ───────────────────────────
 *
 * This adapter is the ONLY file in the public-read seam
 * that imports `prisma` directly. UI/use case/types/tests
 * import it indirectly via `deps.port`.
 */

import { Prisma } from "@prisma/client";
import { z } from "zod";

import { isContentDocumentV1, type ContentDocumentV1 } from "@/domains/catalog/blocks";
import { prisma } from "@/lib/db/prisma";

import type {
  PublishedPageRow,
  ResolvePublishedContentPort,
} from "./resolve-published-content-types";

// ─── Raw row shape (matches the SELECT above) ─────────────────

interface RawPublishedRow {
  id: string;
  parentId: string | null;
  slug: string;
  position: number;
  publishedAt: Date | null;
  title: string | null;
  document: unknown;
  revision: number | null;
  locale: string | null;
}

function isRawPublishedRow(value: unknown): value is RawPublishedRow {
  return !!value && typeof value === "object" && "id" in value;
}

// ─── Document defensiveness ───────────────────────────────────

/**
 * `ContentPageTranslation.document` is JSONB. The writer-side
 * (SaveContentDocument) enforces ContentDocumentV1 schema +
 * free-HTML sweep, BUT a legacy import / migration bug / DB
 * tampering could leave a malformed blob. The reader MUST NOT
 * crash on such rows; we surface `document: null` so the
 * renderer can decide what to do (a "translation not
 * available" stub). The use case trusts this adapter's
 * per-row parse.
 */
function safelyParseDocument(raw: unknown): ContentDocumentV1 | null {
  if (raw === null || raw === undefined) return null;
  if (isContentDocumentV1(raw)) return raw;
  // Last-resort: try to coerce through the Zod safeParse.
  const result = z
    .object({
      schemaVersion: z.literal(1),
      blocks: z.array(z.unknown()),
    })
    .safeParse(raw);
  if (!result.success) return null;
  if (!isContentDocumentV1(result.data)) return null;
  return result.data;
}

// ─── Adapter ───────────────────────────────────────────────────

export const prismaResolvePublishedContentRepository: ResolvePublishedContentPort =
  {
    // ─── findPublishedProductBySlug ──────────────────────────
    //
    // Single SELECT filtered by both slug AND status. The
    // collapse (no product / product unpublished both → null)
    // is enforced by the WHERE predicate, not in JS.
    async findPublishedProductBySlug({ slug }) {
      if (!slug) return null;
      const row = await prisma.product.findFirst({
        where: { slug, status: "published", deletedAt: null },
        select: {
          id: true,
          slug: true,
          defaultLanguage: true,
          publishedAt: true,
        },
      });
      if (!row) return null;
      if (!row.publishedAt) {
        // Defensive: the publish gate invariant says any
        // product with status='published' MUST have
        // publishedAt set. This guard surfaces the rare
        // race in which a half-completed publish transition
        // left the product reachable without a date.
        return null;
      }
      return {
        productId: row.id,
        slug: row.slug,
        defaultLanguage: row.defaultLanguage,
        publishedAt: row.publishedAt,
      };
    },

    // ─── listPublishedPagesWithOneTranslation ───────────────
    //
    // Single SQL roundtrip. The locale chain is passed as
    // a `text[]` array via Prisma.sql.
    async listPublishedPagesWithOneTranslation({ productId, locales }) {
      if (!productId) return { items: [] };
      const localeList = (locales ?? []).filter(
        (l): l is string => typeof l === "string" && l.length > 0,
      );
      if (localeList.length === 0) return { items: [] };

      const rows = await prisma.$queryRaw<RawPublishedRow[]>(Prisma.sql`
        SELECT
          cp.id,
          cp."parentId",
          cp.slug,
          cp.position,
          cp."publishedAt",
          t.title,
          t.document,
          t.revision,
          t.locale
        FROM "ContentPage" cp
        LEFT JOIN LATERAL (
          SELECT
            title,
            document,
            revision,
            locale
          FROM "ContentPageTranslation"
          WHERE "pageId" = cp.id
            AND locale = ANY(${localeList}::text[])
          ORDER BY array_position(${localeList}::text[], locale) ASC
          LIMIT 1
        ) t ON true
        WHERE cp."productId" = ${productId}
          AND cp.status = 'published'
        ORDER BY cp."parentId" NULLS FIRST, cp.position ASC
      `);

      const items: PublishedPageRow[] = rows
        .filter(isRawPublishedRow)
        .map((row) => ({
          pageId: row.id,
          parentId: row.parentId,
          slug: row.slug,
          position: row.position,
          publishedAt: row.publishedAt,
          title: row.title,
          document: safelyParseDocument(row.document) ?? null,
          revision: row.revision,
          resolvedLocale: row.locale,
        }));

      return { items };
    },
  };
