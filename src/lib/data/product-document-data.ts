/**
 * src/lib/data/product-document-data.ts
 *
 * Composition root for the ProductDocument fetch path (MCR Phase 2).
 * Mirrors the convention of `src/lib/data/homepage-data.ts`: pure
 * data-layer fetcher, no business logic, consumed by route handlers
 * (Server Components) and API routes.
 *
 * ─── Wiring ──────────────────────────────────────────────────────
 *
 * The fetcher composes the Domain use case (`resolveProductDocument`)
 * with the Prisma adapter (`prismaResolveProductDocumentRepository`).
 * This is the ONLY place in the codebase that knows both — keeping
 * the Domain layer pure (per ADR-0016 §1).
 *
 * No `next/cache` import here — caching is the route layer's
 * responsibility (Next.js fetch cache + edge CDN). The fetcher
 * performs a fresh read on every call; call sites can wrap it
 * with `unstable_cache` if needed.
 *
 * ─── Why a dedicated fetcher in src/lib/data/ ────────────────────
 *
 * The data layer's `fetchPublishedProducts` shape (homepage grid)
 * is a list — it doesn't compose a focused resolver. The product
 * landing page needs a singular, payload-shaped result for the
 * ContentDocumentV1, so a dedicated fetcher is safer than
 * bloating the homepage data fetcher with single-product shape
 * or adding a new shape to the homepage transform.
 */

import { prisma } from "@/lib/db/prisma";
import { resolveProductDocument } from "@/domains/catalog/product-documents/resolve-product-document";
import { prismaResolveProductDocumentRepository } from "@/domains/catalog/product-documents/prisma-resolve-product-document-repository";
import type {
  ResolveProductDocumentInput,
  ResolveProductDocumentOutcome,
  ResolveProductDocumentResult,
} from "@/domains/catalog/product-documents/resolve-product-document-types";

/**
 * Re-export the discriminated union for callers who want to
 * import shape + fetcher from one canonical module.
 */
export type {
  ResolveProductDocumentInput,
  ResolveProductDocumentOutcome,
  ResolveProductDocumentResult,
} from "@/domains/catalog/product-documents/resolve-product-document-types";

/**
 * Resolve the public-read long-form product description for a
 * given product slug.
 *
 * On success (discriminated union branch), the result exposes:
 *   - `document`        — ContentDocumentV1 (validated at WRITЕ,
 *     trusted at READ). Caller renders via BLOCK_REGISTRY.
 *   - `resolvedLocale`  — The locale that matched the chain.
 *     Useful for SEO metadata + UI badge ("Showing in <X>").
 *   - `isFallback`      — `true` iff the user's requested locale
 *     missed and the default matched. UI badge "Showing in
 *     Italian (your locale <X> not available)".
 *   - `plainText`       — Pre-extracted plain-text for FTS/SEO/AI
 *     (nullable — derived lazily by a future extraction job).
 *   - `revision`        — Optimistic-concurrency revision (nullable
 *     for legacy rows that predate the migration's revision
 *     column default).
 *
 * On failure (the only branch today): `{ success: false, reason:
 * "not_found" }` — collapsed for no info leak.
 *
 * The route layer maps `not_found` to HTTP 404 (or to a graceful
 * "long description not yet available" stub in the funnel UI).
 */
export async function fetchProductDocument(
  input: ResolveProductDocumentInput,
): Promise<ResolveProductDocumentOutcome> {
  return resolveProductDocument(input, {
    port: prismaResolveProductDocumentRepository(prisma),
  });
}
