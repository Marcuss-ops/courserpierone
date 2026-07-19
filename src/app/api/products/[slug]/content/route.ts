/**
 * src/app/api/products/[slug]/content/route.ts
 *
 * Next.js App Router route handler —
 * `GET /api/products/:slug/content?locale=<locale>`.
 *
 * Public read endpoint (MCR Phase 1 — content-pages feature,
 * student-facing mirror of the creator's `POST .../publish`).
 *
 * Wraps the existing `resolvePublishedContent` use case with:
 *   1. URL path validation (`[slug]`).
 *   2. Query-string validation (`?locale=` is optional;
 *      when absent the use case falls back to the product's
 *      defaultLanguage).
 *   3. The 2-branch discriminated union outcome mapped to:
 *      200 / 400 / 404.
 *
 * ─── Architecture per ADR-0016 §1 ──────────────────────────────
 *
 * Route = thin composition root. Domain rule lives in
 * `resolvePublishedContent`. The route:
 *   - Validates URL params + query string (input gate).
 *   - Delegates to the use case (domain rule).
 *   - Translates the 2-branch DU to HTTP status + envelope.
 *   - Sets Cache-Control on each response (see below).
 *
 * No session — this is a PUBLIC endpoint. The use case's
 * collapsed `not_found` branch is the trust gate:
 *   "the product MUST be publicly published" (the port's
 * `findPublishedProductBySlug` filters status='published').
 *
 * ─── HTTP status code mapping ─────────────────────────────────
 *
 *   - 200  — success. Body carries:
 *               { ok: true, product: {id, slug, defaultLanguage,
 *                                     publishedAt},
 *                 pages: [{id, parentId, slug, position,
 *                          title, document, revision,
 *                          resolvedLocale, isFallback, publishedAt}] }
 *            `pages` is empty when the product has no published
 *            pages (defensive — the publish gate should prevent
 *            this but the read endpoint does not assume).
 *   - 400  — invalid slug (empty) OR invalid `?locale=` (not a
 *            string when present). Distinguish via the
 *            `reason` enum: `invalid_slug`, `invalid_locale`.
 *   - 404  — collapsed: BOTH "no product with this slug" AND
 *            "product exists but status !== 'published'" map to
 *            404 (no info leak; matches the established pattern
 *            from `purchaseIntent` + the policy decision in
 *            `resolve-published-content-types.ts` §Public-read
 *            posture).
 *
 * ─── Cache-Control ─────────────────────────────────────────────
 *
 * The published-content read is a public surface (no auth).
 * Three distinct cache postures (matches ADR-0016 §3):
 *
 *   - 200  → `public, s-maxage=60, stale-while-revalidate=300`
 *            Edge CDN caches for 60s with 5min SWR — the publish
 *            use case owns the revalidation lifecycle (no
 *            revalidatePath on read).
 *
 *   - 400  → `no-store` (rare, only when input is malformed).
 *
 *   - 404  → `public, max-age=30` — short cache so a creator's
 *            freshly-published product doesn't take 30s+ to
 *            appear, BUT we still cache anonymous 404s to
 *            absorb scraper load.
 *
 * ─── URL params ────────────────────────────────────────────────
 *
 * `[slug]` is the dynamic segment from the route directory.
 * The Next.js App Router hands us `ctx.params.slug` as a
 * plain URL-decoded string. We validate non-empty + slug-shaped
 * (defensive pattern from `[a-z0-9][a-z0-9-]{1,62}[a-z0-9]`).
 *
 * `?locale=<tag>` is a single optional query string parameter.
 * The route forwards the locale verbatim — no normalization
 * (e.g., "en" vs "en-US") belongs in the route layer.
 *
 * ─── What this route does NOT do ──────────────────────────────
 *
 *   - No revalidatePath on read (the publish use case owns
 *     the cache invalidation lifecycle).
 *   - No 5xx-mapping of adapter errors to a soft denial —
 *     adapter failures bubble up through the route's error
 *     boundary (cleaner than encoding adapter concerns here).
 *   - No session auth (this endpoint is intentionally public).
 */

import { NextResponse } from "next/server";

import { resolvePublishedContent } from "@/domains/catalog/content-pages/resolve-published-content";
import type {
  ResolvePublishedContentPort,
} from "@/domains/catalog/content-pages/resolve-published-content-types";

// ─── Module-level deps (route composition root) ─────────────────

/**
 * Composition root: assigns the persistence port at startup.
 * Mirrors the pattern from `src/app/api/creator/products/route.ts`.
 * The `__setRouteDeps` indirection enables in-memory stub wiring
 * in unit tests without restructuring the route module.
 *
 * Production wiring (server startup) assigns the Prisma adapter
 * (commit a312d84's pattern); tests assign in-memory stubs.
 */
let cachedPort: ResolvePublishedContentPort | undefined;

/**
 * Visible to integration tests so they can swap in an in-memory
 * stub for the persistence port without touching module scope.
 */
export function __setRouteDeps(deps: {
  port: ResolvePublishedContentPort;
}): void {
  cachedPort = deps.port;
}

// ─── Validation helpers ─────────────────────────────────────────

/**
 * The slug field is path-segment-safe; reject anything that is
 * empty, contains whitespace, or is longer than 64 chars. The
 * shape matches the canonical product-slug regex used across
 * the codebase (parity with `createContentPage` route).
 */
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

function isValidSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug);
}

/**
 * Locale tag shape check — loose BCP-47 short tag.
 *
 * Acceptance rules:
 *   - When `?locale=` is absent → valid (use case treats as
 *     "no requested locale, use default").
 *   - When present and matches `^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$`
 *     → valid (forwarded verbatim to the use case).
 *   - Anything else → 400 invalid_locale.
 *
 * Mirrors `Accept-Language` header syntax loosely. A stricter
 * check would defeat the route's "accept what the client sends,
 * forward unchanged" contract (the use case owns canonicalization).
 */
const LOCALE_PATTERN = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

function isValidLocale(locale: string): boolean {
  return LOCALE_PATTERN.test(locale);
}

// ─── GET handler ────────────────────────────────────────────────

export async function GET(
  req: Request,
  ctx: { params: { slug: string } },
): Promise<NextResponse> {
  // ─── 0. Misconfig guard ──────────────────────────────────────
  if (!cachedPort) {
    return NextResponse.json(
      { ok: false, reason: "route_misconfigured" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  // ─── 1. URL + QUERY validation ──────────────────────────────
  const slug = ctx.params.slug;
  if (!isValidSlug(slug)) {
    return NextResponse.json(
      { ok: false, reason: "invalid_slug" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const url = new URL(req.url);
  const requestedLocaleRaw = url.searchParams.get("locale");
  const requestedLocale =
    requestedLocaleRaw !== null ? requestedLocaleRaw : undefined;

  if (requestedLocale !== undefined && !isValidLocale(requestedLocale)) {
    return NextResponse.json(
      { ok: false, reason: "invalid_locale" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  // ─── 2. CALL USE CASE ────────────────────────────────────────
  const result = await resolvePublishedContent(
    { slug, locale: requestedLocale },
    { port: cachedPort },
  );

  // ─── 3. RETURN — 2-branch DU mapping ────────────────────────
  if (result.success) {
    return NextResponse.json(
      {
        ok: true,
        product: {
          id: result.product.id,
          slug: result.product.slug,
          defaultLanguage: result.product.defaultLanguage,
          publishedAt: result.product.publishedAt,
        },
        pages: result.pages.map((p) => ({
          id: p.id,
          parentId: p.parentId,
          slug: p.slug,
          position: p.position,
          title: p.title,
          document: p.document,
          revision: p.revision,
          resolvedLocale: p.resolvedLocale,
          isFallback: p.isFallback,
          publishedAt: p.publishedAt,
        })),
      },
      {
        status: 200,
        headers: {
          // Public read: edge caches for 60s, SWR for 5 min.
          "Cache-Control":
            "public, s-maxage=60, stale-while-revalidate=300",
        },
      },
    );
  }

  // Collapsed not_found — applies to BOTH "no product" AND
  // "product not published". Short public cache to absorb
  // scraper load while remaining responsive to publishes.
  return NextResponse.json(
    { ok: false, reason: "not_found" },
    {
      status: 404,
      headers: { "Cache-Control": "public, max-age=30" },
    },
  );
}
