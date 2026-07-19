/**
 * src/domains/catalog/content-pages/resolve-published-content-types.ts
 *
 * Domain types + port contract for `resolvePublishedContent`
 * (MCR Phase 1 — Notion-like content pages feature, public
 * reader mirror of `publishContentProduct`).
 *
 * The canonical "public read" action for a content product:
 * given a product slug and an optional requested locale, return
 * the published page tree with the right translation per page
 * (requested locale → product.defaultLanguage → no translation).
 *
 * ─── Architecture (per ADR-0016 §1 dep direction) ──────────────
 *
 * Declares, at the Domain layer:
 *   1. `ResolvePublishedContentInput`  — use case input.
 *   2. `ResolvePublishedContentResult` — discriminated union
 *      result (2 branches: success | not_found).
 *   3. `ResolvePublishedContentPort`    — persistence port with
 *      2 methods: find the published product by slug, then list
 *      every published page with one translation per page (the
 *      locale chain resolution happens at the port layer).
 *
 * ─── Public-read endpoint posture (collapsed not_found) ────────
 *
 * This is the public-facing endpoint `GET /api/products/:slug/content`.
 * Per the established pattern (route layer responses for
 * non-existent vs unpublished products collapse to `404` to avoid
 * leaking the existence of unpublished products), the use case
 * collapses BOTH "product missing" AND "product exists but
 * status !== 'published'" into a SINGLE `not_found` branch.
 *
 * No info leak about whether an unpublished or pending-review
 * product exists. A scraper probing slugs cannot distinguish
 * "no product" from "product in draft". This is deliberate.
 *
 * ─── The locale fallback chain (the spec's hard requirement) ───
 *
 * Spec (Italian): "traduzioni per la locale richiesta + fallback".
 *
 * Implemented as an ORDERED CHAIN with two hops:
 *
 *   1. `input.locale ?? product.defaultLanguage` — the primary
 *      request (explicit query param OR Accept-Language OR the
 *      product's default when absent).
 *   2. `product.defaultLanguage` — the fallback when the
 *      primary fails.
 *
 * The chain is `[primary, default]`. The PORT resolves per
 * page: for each ContentPage, the first non-null translation
 * whose `locale` is in the chain wins. If neither matches,
 * the page is surfaced with `title: null, document: null,
 * revision: null, resolvedLocale: null` (NOT omitted — see
 * "Orphan / no-translation handling" below).
 *
 * `isFallback` is computed downstream by the use case:
 *   - `false` if `resolvedLocale === input.locale` (the
 *     primary was the actual match).
 *   - `false` if `input.locale` was undefined (no
 *     "requested" — the default IS the resolved).
 *   - `false` if `resolvedLocale === null` (no translation
 *     at all; nothing was "fallen back" to).
 *   - `true` otherwise (the primary was missing; we fell
 *     back to default).
 *
 * The renderer uses `isFallback` to badge "showing in <X>
 * (your locale <Y> not available)" without an extra roundtrip.
 *
 * ─── Why the port resolves the locale chain (vs the use case) ─
 *
 * The use case reads THE CHAIN from the input + product
 * defaults and forwards it verbatim. The port's adapter is
 * responsible for the SQL JOIN: for each page, return the
 * first available translation in the chain order. This
 * keeps the use case body pure (no per-page translation
 * fetch logic; no two-port-call style "LIST pages THEN
 * FETCH translations"); the adapter gets to express the
 * locale resolution as a single correlated subquery +
 * lateral join.
 *
 * Single port call per request = single DB roundtrip on the
 * hot path.
 *
 * ─── Orphan / no-translation handling ──────────────────────────
 *
 * Two edge cases:
 *
 *   (a) **Published page, parent is draft.** The page is
 *       published, the parent isn't. The flat list still
 *       surfaces the page with `parentId` set (the parent
 *       id). The renderer decides whether to:
 *       - hoist orphans to root (parentId→null)
 *       - skip them (entire sub-tree invisible)
 *       - surface them as ghosts (parentId → "draft parent"
 *         placeholder in the sidebar)
 *       The use case preserves the truth (parentId as-is)
 *       and delegates the UX choice to the renderer. This
 *       keeps the read endpoint generic across rendering
 *       strategies.
 *
 *   (b) **No translation matches the chain (page IS published
 *       + has ≥1 translation, but none in either locale).**
 *       The page surfaces with translation fields null. The
 *       renderer renders a "translation not available" stub.
 *       (For a published product per the gate invariant, each
 *       page has ≥1 translation, but that translation may be
 *       in a third locale neither requested nor the default —
 *       e.g. requested="en", default="it", translation exists
 *       only in "es". The chain is bounded per spec; we do
 *       NOT silently widen to ANY locale.)
 *
 * ─── What NOT to revalidate on read ────────────────────────────
 *
 * This endpoint is a pure read. NO `next/cache` import, NO
 * `revalidatePath` call. The publish gate already
 * revalidates on transition (`publishContentProduct` owns
 * the cache lifecycle). Reads serve from the existing cache
 * layer (Next.js fetch cache, edge CDN). The port's
 * response time is bounded by the SQL query alone.
 *
 * ─── Document re-validation policy ─────────────────────────────
 *
 * `ContentPageTranslation.document` is validated at WRITE
 * time by `SaveContentDocument` (Zod `parseContentDocumentV1`
 * + free-HTML sweep). The READ endpoint TRUSTS this. If a
 * row is somehow corrupted (DB tampering / migration bug /
 * legacy import), the adapter can defensively
 * `safeParseContentDocumentV1` and surface `document: null`
 * — but the use case does NOT do this itself. Validation at
 * write is the trust boundary; read is fast.
 */

import type { ContentDocumentV1 } from "@/domains/catalog/blocks/document";

// ─── Page DTO returned by the port ───────────────────────────────

/**
 * One row from `listPublishedPagesWithOneTranslation`.
 *
 * The adapter materializes this with a single SQL query
 * (LEFT JOIN LATERAL 'pick-first-matching-translation' on
 * locales order, filtered by `ContentPage.status =
 * 'published'`). The use case reads it verbatim.
 *
 * The translation fields are `null` when:
 *   - The page has no translation matching the locale chain
 *     (NEITHER the requested nor the default language).
 *   - The page's translation row's `document` JSONB fails
 *     `safeParseContentDocumentV1` (corruption — adapter
 *     surfaces `document: null` defensively; title + revision
 *     are still populated from the row, if they exist).
 *
 * `resolvedLocale` is the locale that matched (or `null`
 * when nothing matched). It is the source of truth for the
 * `isFallback` computation in the use case.
 */
export interface PublishedPageRow {
  pageId: string;
  parentId: string | null;
  slug: string;
  position: number;
  publishedAt: Date | null;
  /** `null` when no matching translation OR when document failed schema parse. */
  title: string | null;
  document: ContentDocumentV1 | null;
  /** `null` when no matching translation. */
  revision: number | null;
  /** `null` when no matching translation. */
  resolvedLocale: string | null;
}

// ─── Use case input ──────────────────────────────────────────────

/**
 * Input to `resolvePublishedContent`.
 *
 * Field-by-field:
 *   - `slug`        — URL parameter from `/api/products/:slug/content`.
 *     Public identifier; the route layer forwards verbatim
 *     after URL-decoding. NOT productId — the use case resolves
 *     the product by slug because the slug IS the public surface
 *     (no info leak via internal IDs).
 *   - `locale`      — Optional. The requested locale (BCP-47
 *     short tag, e.g. "en" or full BCP-47 "en-US"). The route
 *     layer is responsible for parsing the source (`?locale=`
 *     query param OR `Accept-Language` header, in that priority
 *     order). The use case reads it verbatim — no
 *     normalization (e.g., "en" vs "en-US") belongs here.
 *
 * Public endpoint — NO actorId, NO session, NO auth. Per ADR-0016
 * §1 the route layer is the trust boundary; here, the trust
 * boundary is "the product must be publicly published".
 */
export interface ResolvePublishedContentInput {
  slug: string;
  locale?: string;
}

// ─── Per-page output shape (used in success branch) ──────────────

/**
 * One page in the success-branch flat array.
 *
 * The shape mirrors `PublishedPageRow` BUT additionally exposes
 * `isFallback` (computed in the use case from `resolvedLocale`
 * and `input.locale`, see header). The flat list preserves
 * page ordering (the adapter's ORDER BY position) so the
 * renderer can build the tree deterministically.
 */
export interface ResolvePublishedContentPageResult {
  id: string;
  parentId: string | null;
  slug: string;
  position: number;
  publishedAt: Date | null;
  title: string | null;
  document: ContentDocumentV1 | null;
  revision: number | null;
  resolvedLocale: string | null;
  /**
   * `true` iff the requested `input.locale` was supplied, no
   * matching translation existed in that locale, but a
   * translation existed in the fallback locale. `false` in
   * all other cases (no requested locale, requested matched,
   * no translation available at all).
   */
  isFallback: boolean;
}

// ─── Discriminated union result ──────────────────────────────────

/**
 * Two exhaustive outcomes:
 *   - `success: true`  — published product found. `product`
 *     echoes the public-facing metadata (id + slug +
 *     defaultLanguage + publishedAt); `pages` is the flat
 *     list of every published page, each with its
 *     translation resolved through the locale chain.
 *   - `success: false` reason: `"not_found"` — collapsed
 *     response for BOTH (a) the slug has no product AND
 *     (b) the slug has a product but `status !== 'published'`.
 *     No info leak; the route layer maps to HTTP 404.
 *
 * The collapsed posture is the central design choice for
 * the public endpoint. Admin-facing use cases
 * (`publishContentProduct`) differentiate `not_found` from
 * `archived_status` because the in-app admin UI needs the
 * distinction; the public endpoint does NOT need it and the
 * information would be wasted + leakable.
 *
 * The success branch does NOT expose:
 *   - `creatorId`            — internal, not for public eyes.
 *   - `defaultLanguage` is exposed — it's the public fallback
 *     cue; clients legitimately need it to know "if the
 *     requested locale is missing, this is what we'll use".
 *   - `publish-only` fields like `reviewedAt`, `accessGrants`,
 *     etc. The published-content read is intentionally
 *     minimal — only what the renderer needs to draw the
 *     content tree.
 */
export type ResolvePublishedContentResult =
  | {
      success: true;
      product: {
        id: string;
        slug: string;
        defaultLanguage: string;
        publishedAt: Date;
      };
      pages: ResolvePublishedContentPageResult[];
    }
  | { success: false; reason: "not_found" };

/**
 * Stable string union of denial reasons. The const+type merged
 * binding pattern (matches `PublishContentProductDenialReason`
 * etc.) unifies the literal at call sites.
 *
 * Only one branch exists today (`NotFound`). The const+type
 * shape is preserved for future additions without breaking
 * the merged-binding import pattern at caller sites.
 */
export const ResolvePublishedContentDenialReason = {
  NotFound: "not_found",
} as const;

export type ResolvePublishedContentDenialReason =
  (typeof ResolvePublishedContentDenialReason)[keyof typeof ResolvePublishedContentDenialReason];

// ─── Port contract ───────────────────────────────────────────────

/**
 * Persistence port for the public-read flow. Two methods mapping
 * to the two-phase orchestration:
 *
 *   1. `findPublishedProductBySlug`               — single read
 *      resolving the product's `id + slug + defaultLanguage +
 *      publishedAt` IF and only IF `status === "published"`.
 *      The adapter is responsible for the no-info-leak
 *      collapse: returning `null` for both "no product" and
 *      "product not published" — the use case does NOT
 *      distinguish (it surfaces a single `not_found`).
 *
 *   2. `listPublishedPagesWithOneTranslation`     — single read
 *      returning every published page (`status = 'published'`)
 *      with at most one translation per page (resolved by the
 *      locale chain). The adapter encapsulates the locale
 *      resolution logic; the use case just forwards the chain
 *      and receives matched translations.
 *
 * The dependency direction (Domain → Port) matches ADR-0016 §1;
 * the Prisma adapter lives in a sibling file in a follow-up
 * commit (this PR is use-case-only, mirrors the established
 * pattern across all content-pages use cases).
 */
export interface ResolvePublishedContentPort {
  /**
   * Look up the published product by slug.
   *
   * Returns `null` for BOTH:
   *   - no product exists with this slug, AND
   *   - a product exists but `status !== "published"`
   *
   * The collapse is essential for the no-info-leak posture
   * (the public endpoint cannot reveal that an unpublished
   * product exists). The adapter implements this with a
   * `WHERE slug = $1 AND status = 'published'` query that
   * naturally returns 0 rows for both reasons.
   *
   * Implementation hint for the Prisma adapter:
   *
   *   ```
   *   prisma.product.findFirst({
   *     where: { slug, status: "published" },
   *     select: { id: true, slug: true, defaultLanguage: true, publishedAt: true },
   *   })
   *   ```
   *
   * `publishedAt` is read for the success-branch echo (the
   * user-facing "since when has this been live?" display).
   * It IS NOT NULL when status='published' (forward
   * invariant from publishContentProduct: any product with
   * status='published' has publishedAt set), but the
   * adapter's SELECT reads it AS Date (Postgres TIMESTAMP is
   * not null at the runtime layer when the row matches).
   */
  findPublishedProductBySlug(input: {
    slug: string;
  }): Promise<
    | {
        productId: string;
        slug: string;
        defaultLanguage: string;
        publishedAt: Date;
      }
    | null
  >;

  /**
   * List every published page in the product, with at most
   * one translation per page resolved against the locale
   * chain.
   *
   * Per-page resolution rule: for each ContentPage whose
   * `status = 'published'`, the FIRST translation whose
   * `locale` is in `locales[]` (in array order) wins. If no
   * translation matches, the page surfaces with
   * `title: null, document: null, revision: null,
   *  resolvedLocale: null` (page metadata is preserved).
   *
   * Implementation hint for the Prisma adapter (single
   * roundtrip with a LATERAL join):
   *
   *   ```
   *   SELECT cp.id, cp."parentId", cp.slug, cp.position, cp."publishedAt",
   *     tr.title, tr.document, tr.revision, tr.locale
   *   FROM "ContentPage" cp
   *   LEFT JOIN LATERAL (
   *     SELECT title, document, revision, locale
   *     FROM "ContentPageTranslation"
   *     WHERE "pageId" = cp.id AND locale = ANY($locales)
   *     ORDER BY array_position($locales, locale) ASC
   *     LIMIT 1
   *   ) tr ON true
   *   WHERE cp."productId" = $productId
   *     AND cp.status = 'published'
   *   ORDER BY cp."parentId" NULLS FIRST, cp.position ASC
   *   ```
   *
   * `document` is JSONB → parsed with `safeParseContentDocumentV1`
   * on the adapter side. Parse failure → `document: null`
   * (the page metadata is still returned). The use case
   * trusts the adapter's parse.
   *
   * Pagination: not in v1. The cap is implicit at 1000
   * pages per product (matches the reorder guard). Future
   * PRs add a `cursor` input when products exceed this.
   */
  listPublishedPagesWithOneTranslation(input: {
    productId: string;
    locales: readonly string[];
  }): Promise<{ items: PublishedPageRow[] }>;
}
