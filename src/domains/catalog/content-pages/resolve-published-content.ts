/**
 * src/domains/catalog/content-pages/resolve-published-content.ts
 *
 * Pure use case — ONE canonical entry point for the public
 * reader endpoint `GET /api/products/:slug/content`. The
 * "mirror" of `publishContentProduct`: while the publisher
 * writes the go-live transition, this use case reads the
 * published content with locale resolution.
 *
 * ─── MCR Phase 1 — Notion-like pages feature ─────────────────────
 *
 * Orchestrates (in this exact order):
 *   1. GUARD         — defensive empty-string rejection for
 *                      `slug`. Collapsed to `not_found`. No
 *                      port calls.
 *   2. PRODUCT       — single port call to read the published
 *                      product by slug. Null → `not_found`
 *                      (collapsed for both "no product" AND
 *                      "product not published" — no info leak).
 *   3. LOCALE CHAIN  — compute the ordered locale chain
 *                      `[requestedLocale ?? defaultLanguage,
 *                        defaultLanguage]`. Forwarded to the
 *                      port verbatim.
 *   4. LIST PAGES    — single port call returning every
 *                      published page with at most one
 *                      translation per page (the port resolves
 *                      via LATERAL join).
 *   5. TRANSFORM     — map port rows to the public output
 *                      shape, computing `isFallback` per page.
 *   6. RETURN        — translate to the 2-branch discriminated
 *                      union.
 *
 * ─── Why pure (no Prisma import, no next/cache import) ──────────
 *
 * ADR-0016 §1 dep direction:
 *   - This file: Domain layer. NO `@prisma/client` import.
 *     NO `next/cache` import.
 *   - Persistence goes through `ResolvePublishedContentPort`
 *     (declared in `./resolve-published-content-types`).
 *   - The Prisma adapter lives in a sibling file in a follow-up
 *     commit; the route composition root wires the adapter.
 *   - Reads serve from the existing cache (Next.js fetch
 *     cache + edge CDN) — no revalidatePath on read.
 *
 * Test stub: `tests/resolve-published-content.test.ts` builds
 * an in-memory implementation of the port (no Prisma mock).
 *
 * ─── Why precedence is what it is ───────────────────────────────
 *
 * The collapsed `not_found` branch is the central design choice.
 * It bundles "no product" + "product exists but not published"
 * into a single outcome so a public scraper cannot probe
 * slug existence for unpublished products. This applies whether
 * the product is `draft` (creator is still authoring) OR
 * `archived` (product was previously live, now terminated).
 *
 * Both collapse to `not_found` because:
 *   - The product IS not publicly readable in both states.
 *   - The political difference between "draft" (creator
 *     hasn't published yet) vs "archived" (creator un-published)
 *     is not a public concern.
 *   - If we leaked it, a creator's "work in progress" titles
 *     would be enumerable by anyone.
 *
 * ─── Why the locale chain is `[primary, default]` (and not wider)
 *
 * The user spec says "traduzioni per la locale richiesta +
 * fallback" — singular "fallback". Two hops, not three. The
 * chain is:
 *
 *   - Primary: `input.locale ?? product.defaultLanguage`
 *     (when no explicit locale was passed, the primary IS
 *      the default — there is no "fallback" to perform).
 *   - Secondary: `product.defaultLanguage`
 *     (only consulted if the primary misses).
 *
 * The chain has at most TWO entries. We deliberately do NOT
 * widen the chain to include every available translation —
 * that would silently degrade the UX ("showed me in Italian
 * because my locale <Polish> isn't configured"). Bounded
 * fallback is documented behavior.
 *
 * ─── Why `isFallback` only flags the two-hop downgrade ────────
 *
 * The flag is true ONLY when:
 *   - `input.locale` was supplied (a "requested" exists),
 *   - The primary MISSED (no translation in `input.locale`),
 *   - AND the secondary matched (a translation in the default).
 *
 * If `input.locale` was undefined, `isFallback` is always
 * false — there is no "requested" to fall back from; the
 * default IS the canonical resolution.
 *
 * If both miss and `resolvedLocale` is null, `isFallback` is
 * also false — we did not "fall back"; we simply have no
 * translation to give. The renderer surfaces the page with a
 * missing-translation stub (NOT a fallback).
 *
 * ─── Orphan handling (preserves parentId as-is) ───────────────
 *
 * A published page whose parent is unpublished (orphan) is
 * surfaced with `parentId` set EXACTLY as the DB has it. The
 * renderer decides whether to hoist, skip, or place the
 * orphan. The use case preserves the truth and delegates the
 * UX. This keeps the read endpoint generic across rendering
 * strategies.
 */

import {
  ResolvePublishedContentDenialReason, // value+type merged binding — used as Reason.X in return branches; the bottom re-export doesn't bring it into local scope
  type ResolvePublishedContentInput,
  type ResolvePublishedContentPageResult,
  type ResolvePublishedContentPort,
  type ResolvePublishedContentResult,
  type PublishedPageRow,
} from "./resolve-published-content-types";

/**
 * Dependency injection contract. The use case NEVER imports
 * the Prisma adapter directly; the route composition root
 * wires it.
 */
export interface ResolvePublishedContentDeps {
  port: ResolvePublishedContentPort;
}

/**
 * Resolve the public-read content for a published product.
 *
 * Returns the discriminated-union outcome. Never throws on
 * soft validation failures: missing slug, missing product,
 * unpublished product → all collapse to `not_found`. The route
 * layer maps `not_found` to HTTP 404.
 *
 * Public endpoint — NO authentication required. The trust
 * gate is "the product must be publicly published" — enforced
 * server-side via the port's `findPublishedProductBySlug`
 * (which silently filters status='published').
 *
 * Error surface (NEVER thrown from soft branches):
 *   - `not_found`   — slug is empty/missing OR product doesn't
 *     exist OR product exists but isn't published. Collapsed
 *     for no info leak (no internal status differentiation).
 *
 * Programmer-error paths (the caller has a bug):
 *   - Port throws on adapter failure (no port error class
 *     defined here — adapter failures bubble up through the
 *     route's error boundary as 5xx; cleaner than encoding
 *     adapter concerns in a soft denial).
 */
export async function resolvePublishedContent(
  input: ResolvePublishedContentInput,
  deps: ResolvePublishedContentDeps,
): Promise<ResolvePublishedContentResult> {
  // ─── 1. GUARD — defensive empty-input rejection ───────────────
  //
  // The route layer is the primary gate (it URL-decodes the
  // `:slug` path segment). An empty slug can only reach here
  // if a future caller constructs the input by hand and
  // passes `""`. Collapsed to `not_found` — no info leak
  // about the empty-input case.
  //
  // `input.locale` is OPTIONAL and is NOT guarded here; an
  // empty string `""` is treated as "no locale requested"
  // meaning the chain is `[product.defaultLanguage]`.
  if (!input.slug) {
    return {
      success: false,
      reason: ResolvePublishedContentDenialReason.NotFound,
    };
  }

  // ─── 2. PRODUCT — find the published product by slug ──────────
  //
  // Single port call. Returns null for BOTH "no product" AND
  // "product not published" — collapsed for the no-info-leak
  // posture. The port's adapter is responsible for this
  // collapse (the SQL query filters `status='published'` so
  // the 0-row outcome is identical for both cases).
  const product = await deps.port.findPublishedProductBySlug({
    slug: input.slug,
  });
  if (!product) {
    return {
      success: false,
      reason: ResolvePublishedContentDenialReason.NotFound,
    };
  }

  // ─── 3. LOCALE CHAIN — compute the ordered chain ────────────
  //
  // Two hops max:
  //
  //   chain[0] = input.locale ?? product.defaultLanguage
  //   chain[1] = product.defaultLanguage
  //
  // When `input.locale === product.defaultLanguage`, the
  // chain has only ONE unique entry — de-duplicated below.
  //
  // The chain is `readonly string[]` (the port signature
  // accepts a readonly array). Order matters: `chain[0]` is
  // tried first per page; `chain[1]` is the fallback.
  const primary = input.locale ?? product.defaultLanguage;
  const fallback = product.defaultLanguage;
  const locales: readonly string[] = primary === fallback
    ? [primary]
    : [primary, fallback];

  // ─── 4. LIST PAGES — single port call with the chain ─────────
  //
  // Single DB roundtrip. The port's adapter materializes the
  // locale resolution with a LATERAL join (each page gets its
  // first matching translation in chain order). The use
  // case receives the resolved shape verbatim.
  const pagesResult = await deps.port.listPublishedPagesWithOneTranslation({
    productId: product.productId,
    locales,
  });

  // ─── 5. TRANSFORM — map port rows to public output shape ────
  //
  // Per-page `isFallback` computation. The flag is `true` ONLY
  // when:
  //   - `input.locale` was supplied (a "requested" exists),
  //   - `resolvedLocale !== input.locale` (the primary missed),
  //   - `resolvedLocale !== null` (the fallback matched; we did
  //     not just fail outright).
  //
  // The use case hands the renderer the unfiltered list. The
  // adapter's ORDER BY (parentId NULLS FIRST, position ASC)
  // preserves the canonical tree-traversal ordering. Renderer
  // builds the navigation sidebar.
  const pages: ResolvePublishedContentPageResult[] =
    pagesResult.items.map((row) => mapRowToPageResult(row, input.locale));

  // ─── 6. RETURN — success branch with the flat page list ─────
  //
  // `pages` is empty when the product has no published pages
  // (technically not allowed by the publish gate, but
  // defensive — listPages is the source of truth here).
  return {
    success: true,
    product: {
      id: product.productId,
      slug: product.slug,
      defaultLanguage: product.defaultLanguage,
      publishedAt: product.publishedAt,
    },
    pages,
  };
}

/**
 * Map one port-level `PublishedPageRow` to the public output
 * shape, computing `isFallback` from `resolvedLocale` and
 * `requestedLocale`.
 *
 * Exposed as a free function for testability (a future
 * monorepo consumer can reuse the mapping logic if they
 * construct a different port layer).
 */
function mapRowToPageResult(
  row: PublishedPageRow,
  requestedLocale: string | undefined,
): ResolvePublishedContentPageResult {
  // isFallback Formula:
  //   resolvedLocale !== null
  //     && requestedLocale !== undefined
  //     && resolvedLocale !== requestedLocale
  //
  // Equivalent human-readable:
  //   Did the user ask for a specific locale that wasn't
  //   satisfied, but we DID find a translation in a different
  //   one?
  const isFallback =
    row.resolvedLocale !== null &&
    requestedLocale !== undefined &&
    row.resolvedLocale !== requestedLocale;

  return {
    id: row.pageId,
    parentId: row.parentId,
    slug: row.slug,
    position: row.position,
    publishedAt: row.publishedAt,
    title: row.title,
    document: row.document,
    revision: row.revision,
    resolvedLocale: row.resolvedLocale,
    isFallback,
  };
}

/**
 * Re-export the discriminated union + reason enum + port types
 * so callers can import everything they need from
 * `./resolve-published-content` (single canonical entry point,
 * mirrors the publish + rename + reorder + create +
 * save re-export pattern).
 *
 * The merged-binding form is used for
 * `ResolvePublishedContentDenialReason` (it's BOTH a const and
 * a type alias under the same identifier — same TS2300
 * workaround documented in the prior PRs).
 */
export {
  ResolvePublishedContentDenialReason, // value+type merged binding
} from "./resolve-published-content-types";
export type {
  // type-only names
  ResolvePublishedContentPort,
  ResolvePublishedContentResult,
  ResolvePublishedContentInput,
  ResolvePublishedContentPageResult,
  PublishedPageRow,
} from "./resolve-published-content-types";
