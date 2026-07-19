/**
 * src/domains/catalog/product-documents/resolve-product-document.ts
 *
 * Pure use case — ONE canonical entry point for the public
 * long-description endpoint `GET /api/products/:slug/details`
 * (and any future inline consumer like the funnel orchestrator).
 *
 * ─── MCR Phase 2 — Notion-like product description ───────────────
 *
 * Orchestrates (in this exact order):
 *   1. GUARD    — defensive empty-input rejection for `slug`.
 *                 Collapsed to `not_found`. No port calls.
 *   2. PORT     — single port call resolving the published product
 *                 + the locale-chain-matched document row. Returns
 *                 `null` for BOTH "no product" AND "product exists
 *                 but status != published" (no info leak).
 *   3. COLLAPSE — `not_found` when no row matched the chain.
 *   4. NARROW   — defensive `null` check on `row.document` (the
 *                 adapter may surface `null` if JSON narrowing
 *                 failed — same posture as resolvePublishedContent).
 *   5. TRANSFORM — compute `isFallback` from `matchedLocale` and
 *                 the input.
 *   6. RETURN   — 2-branch discriminated union.
 *
 * ─── Why pure (no Prisma import, no next/cache import) ──────────
 *
 * ADR-0016 §1 dep direction: Domain → Port. NO `@prisma/client`
 * import. NO `next/cache` import. The Prisma adapter lives in a
 * sibling file; the route composition root wires it.
 *
 * Test stub: `resolve-product-document.test.ts` builds an in-memory
 * implementation of the port (no Prisma mock) — mirrors the
 * established pattern across all content-pages use cases.
 */

import {
  ResolveProductDocumentDenialReason,
  type ResolveProductDocumentInput,
  type ResolveProductDocumentOutcome,
  type ResolveProductDocumentPort,
  type ResolveProductDocumentResult,
} from "./resolve-product-document-types";

/**
 * Dependency injection contract. The use case NEVER imports
 * the Prisma adapter directly; the route composition root wires it.
 */
export interface ResolveProductDocumentDeps {
  port: ResolveProductDocumentPort;
}

/**
 * Resolve the public-read long-form product description.
 *
 * Returns the discriminated-union outcome. Never throws on
 * soft validation failures: missing slug / missing product /
 * unpublished product / no locale-matched document row → all
 * collapse to `not_found`. The route layer maps `not_found`
 * to HTTP 404.
 *
 * Public endpoint — NO authentication required. The trust gate
 * is "the product must be publicly published" — enforced
 * server-side via the port's `findPublishedProductDocumentBySlug`
 * (which silently filters `status='published'`).
 *
 * Error surface (NEVER thrown from soft branches):
 *   - `not_found` — slug is empty/missing OR no published product
 *     exists OR no document row matches the locale chain.
 *     Collapsed for no-info-leak posture.
 *
 * Programmer-error paths (caller has a bug):
 *   - Port throws on adapter failure (no port error class
 *     defined here — adapter failures bubble up through the
 *     route's error boundary as 5xx).
 */
export async function resolveProductDocument(
  input: ResolveProductDocumentInput,
  deps: ResolveProductDocumentDeps,
): Promise<ResolveProductDocumentOutcome> {
  // ─── 1. GUARD — empty slug → not_found ─────────────────────────
  //
  // The route layer is the primary gate (it URL-decodes the
  // `:slug` path segment). An empty slug can only reach here if
  // a future caller constructs the input by hand and passes `""`.
  // Collapsed to `not_found` — no info leak.
  //
  // `input.locale` is OPTIONAL and is FALSY-COERCED to `undefined`
  // here. Empty string `""` is treated as "no locale requested"
  // (the route layer may emit `""` when Accept-Language can't
  // be matched). Normalising once at the trust boundary means
  // downstream code (port + `isFallback` formula) sees a stable
  // semantic — never the empty-string edge case.
  if (!input.slug) {
    return {
      success: false,
      reason: ResolveProductDocumentDenialReason.NotFound,
    };
  }

  // Locale normalisation: empty string → undefined. Documented
  // contract for callers. The single canonical form is
  // `requestedLocale: string | undefined`.
  const requestedLocale = input.locale || undefined;

  // ─── 2. PORT — published product + locale-chain resolution ────
  //
  // Single port call. Encapsulates:
  //   (a) product lookup with status='published' filter (no leak),
  //   (b) locale chain construction (primary hop = requestedLocale
  //       when defined, else default; secondary hop = default),
  //   (c) sequential findFirst on the chain until the first match.
  //
  // Returns `null` for "no published product"; returns a shape
  // with `row: null, matchedLocale: null` when the product is
  // published but has no document row in either locale hop.
  const lookup = await deps.port.findPublishedProductDocumentBySlug({
    slug: input.slug,
    requestedLocale,
  });

  if (!lookup) {
    return {
      success: false,
      reason: ResolveProductDocumentDenialReason.NotFound,
    };
  }

  // ─── 3. COLLAPSE — no row matched the chain ───────────────────
  //
  // The port may surface `row: null, matchedLocale: null` when
  // neither the requested locale nor the default matched. We
  // collapse this to `not_found` for the public endpoint —
  // matches the no-info-leak posture (we don't want a scraper
  // probing `?locale=zh` to learn that a document exists in
  // `en` for this slug).
  if (!lookup.row || !lookup.matchedLocale) {
    return {
      success: false,
      reason: ResolveProductDocumentDenialReason.NotFound,
    };
  }

  // ─── 4. NARROW — defensive null guard on `row.document` ────────
  //
  // Mirrors `resolvePublishedContent`: the port's adapter may
  // surface `document: null` when `safeParseContentDocumentV1`
  // fails (corruption, legacy import, manual DB mutation).
  // The use case collapses this branch to `not_found` (rather
  // than risk rendering a malformed document).
  //
  // The narrowing is the FINAL guard — if the adapter's parse
  // succeeded but the row's `document` is still NULL (shouldn't
  // happen — JSONB NOT NULL), surface `not_found`.
  if (!lookup.row.document) {
    return {
      success: false,
      reason: ResolveProductDocumentDenialReason.NotFound,
    };
  }

  // ─── 5. TRANSFORM — compute `isFallback` ──────────────────────
  //
  // The flag is `true` ONLY when:
  //   - `requestedLocale` was supplied (a "requested" exists —
  //     after the normalisation at step 1, this means a
  //     non-empty string was passed),
  //   - `matchedLocale !== requestedLocale` (the primary missed),
  //
  // (Equivalent human-readable: did the user ask for a specific
  //  locale that wasn't satisfied, but we DID find a translation
  //  in a different one?)
  //
  // Sidebar: when `requestedLocale === undefined` (the user did
  // NOT specify OR the caller forwarded `""`), `isFallback` is
  // always `false` — no "requested" to fall back from; the
  // default IS the canonical resolution. Falsy-coercion at
  // step 1 guarantees this stays consistent.
  const isFallback =
    requestedLocale !== undefined &&
    lookup.matchedLocale !== requestedLocale;

  // ─── 6. RETURN — success branch ───────────────────────────────
  const data: ResolveProductDocumentResult = {
    document: lookup.row.document,
    plainText: lookup.row.plainText,
    revision: lookup.row.revision,
    resolvedLocale: lookup.matchedLocale,
    isFallback,
  };

  return { success: true, data };
}

/**
 * Re-export the discriminated union + reason enum + port types
 * so callers can import everything they need from
 * `./resolve-product-document` (single canonical entry point,
 * mirrors the content-pages export pattern).
 *
 * The merged-binding form is used for
 * `ResolveProductDocumentDenialReason` (it's BOTH a const and
 * a type alias under the same identifier — same TS2300
 * workaround documented in the prior content-pages PRs).
 */
export {
  ResolveProductDocumentDenialReason, // value+type merged binding
} from "./resolve-product-document-types";
export type {
  // type-only names
  ResolveProductDocumentPort,
  ResolveProductDocumentOutcome,
  ResolveProductDocumentInput,
  ResolveProductDocumentResult,
  ProductDocumentRow,
} from "./resolve-product-document-types";
