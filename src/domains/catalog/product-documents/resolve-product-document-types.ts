/**
 * src/domains/catalog/product-documents/resolve-product-document-types.ts
 *
 * Domain types + port contract for `resolveProductDocument`
 * (MCR Phase 2 — Notion-like long-form product description).
 *
 * Differentiates from `resolvePublishedContent`:
 *   - `resolvePublishedContent` returns the per-product **page tree**
 *     (`ContentPage` + `ContentPageTranslation`) for the student-side
 *     reader. One row per page.
 *   - `resolveProductDocument` returns the **marketing long description**
 *     (`ProductDocument`, NOTION-like blocks) for the public landing
 *     page. One row per (product, locale).
 *
 * Both feed off the canonical `ContentDocumentV1` block-document shape
 * (`src/domains/catalog/blocks/document.ts`) and both render via the
 * canonical `BLOCK_REGISTRY` (`src/lib/blocks/CONTENT_BLOCK_REGISTRY`).
 *
 * ─── Architecture (per ADR-0016 §1 dep direction) ──────────────
 *
 *   1. `ResolveProductDocumentInput`            — use case input.
 *   2. `ResolveProductDocumentResult`           — success-branch payload.
 *   3. `ResolveProductDocumentOutcome`          — discriminated union
 *      (`not_found` collapses both "no product" and "no published
 *      document for the requested locale chain", no info leak).
 *   4. `ResolveProductDocumentPort`             — persistence port:
 *      ONE method that returns the published product metadata + the
 *      resolved document row (NULL when nothing matched) + the
 *      `matchedLocale` (or NULL when nothing matched).
 *
 * ─── Locale chain (mirrors content-pages posture) ───────────────
 *
 * Two-hop chain, computed INSIDE the port adapter (the chain depends
 * on `product.defaultLanguage` which the use case doesn't know until
 * after the first port call — see `ResolveProductDocumentPort`).
 *
 *   chain[0] = input.locale  (may be undefined → skip the primary hop)
 *   chain[1] = product.defaultLanguage
 *
 * The adapter tries each locale in order, returning the first match.
 * `matchedLocale` reflects which hop won (or NULL when neither did).
 * `isFallback` is computed at the use case: `true` iff a primary hop
 * was requested, missed, and the default hop matched.
 *
 * ─── Public-read endpoint posture (collapsed not_found) ─────────
 *
 * Mirrors `resolvePublishedContent`: BOTH "no product" AND "no
 * matching document row" collapse to a single `not_found` branch.
 * No info leak about whether the product is `draft`/`archived` vs
 * whether a document row exists for a different locale.
 */

import type { ContentDocumentV1 } from "@/domains/catalog/blocks/document";

// ─── Per-row projection ──────────────────────────────────────────

/**
 * One `ProductDocument` row from the port.
 *
 * `document` is `JSONB` in PG → Prisma hydrates as a `Prisma.JsonValue`
 * which we materialise as `ContentDocumentV1` once narrowed by
 * `isContentDocumentV1`. The adapter performs the narrowing
 * defensively (read may serve rows written by a future validator).
 *
 * `null` when nothing matched the locale chain.
 */
export interface ProductDocumentRow {
  id: string;
  productId: string;
  locale: string;
  document: ContentDocumentV1 | null;
  plainText: string | null;
  revision: number | null;
}

// ─── Use case input ──────────────────────────────────────────────

/**
 * Input to `resolveProductDocument`.
 *
 *   - `slug`   — URL parameter; ports bind by slug (the public
 *     identifier; no info leak via internal IDs).
 *   - `locale` — Optional. The requested locale (BCP-47 short tag,
 *     "it" or "en"). The route layer parses the source (`?locale=`
 *     query param OR `Accept-Language` header) and forwards.
 */
export interface ResolveProductDocumentInput {
  slug: string;
  locale?: string;
}

// ─── Use case result (success branch) ────────────────────────────

/**
 * Successful resolution payload. Always carries the resolved
 * ContentDocumentV1 + the locale that produced it + the fallback
 * flag. `null` fields surface only on read-side corruption (empty
 * document, failed JSON narrowing) — handled by the adapter.
 */
export interface ResolveProductDocumentResult {
  /** Resolved ContentDocumentV1 (validated at WRITЕ; trusted at READ). */
  document: ContentDocumentV1;
  /** Pre-extracted plain text (denormalized for FTS/SEO/AI; nullable). */
  plainText: string | null;
  /** Optimistic-concurrency revision; null when DB row's revision was NULL. */
  revision: number | null;
  /** Locale that actually matched the chain (NULL never reaches here — we collapsed). */
  resolvedLocale: string;
  /**
   * `true` iff the user REQUESTED a specific locale, the primary
   * missed, and the default hop matched. `false` otherwise
   * (no request, request matched, neither matched).
   */
  isFallback: boolean;
}

// ─── Discriminated union ─────────────────────────────────────────

export type ResolveProductDocumentOutcome =
  | { success: true; data: ResolveProductDocumentResult }
  | { success: false; reason: "not_found" };

export const ResolveProductDocumentDenialReason = {
  NotFound: "not_found",
} as const;

export type ResolveProductDocumentDenialReason =
  (typeof ResolveProductDocumentDenialReason)[keyof typeof ResolveProductDocumentDenialReason];

// ─── Port contract ───────────────────────────────────────────────

/**
 * Persistence port for the public-read flow. ONE method that
 * resolves a published ProductDocument following the locale chain.
 *
 * The port accepts BOTH `slug` (the public identifier) AND
 * `requestedLocale` (the optional primary hop), and returns:
 *
 *   - `null` when no published product exists for the slug (no
 *     info leak between "no product" and "product exists but
 *     status != published" — both collapse here).
 *
 *   - Otherwise: `{ productId, defaultLanguage, row, matchedLocale }`.
 *     `row` is `null` when NEITHER locale hop matched (then
 *     `matchedLocale` is also `null`); the use case collapses this
 *     to `not_found`.
 *
 * Adapter implementation strategy (Prisma):
 *   1. `prisma.product.findFirst({ where: { slug, status: "published" },
 *      select: { id, defaultLanguage } })` → if `null`, return `null`.
 *   2. Build chain `[requestedLocale ?? default, default]`,
 *      de-duped.
 *   3. For each locale in chain order, `prisma.productDocument
 *      .findFirst({ where: { productId, locale }, select: {...} })`
 *      → first match wins. Sequential 2-Q lookup is acceptable:
 *      most products have ONE document row (the default), and the
 *      primary hop rarely matches without severe locale mismatch.
 *      A future SQL-based adapter could express this in a single
 *      CTE with `array_position` ORDER BY — out of scope for MVP.
 */
export interface ResolveProductDocumentPort {
  findPublishedProductDocumentBySlug(input: {
    slug: string;
    requestedLocale?: string;
  }): Promise<
    | {
        productId: string;
        defaultLanguage: string;
        row: ProductDocumentRow | null;
        matchedLocale: string | null;
      }
    | null
  >;
}
