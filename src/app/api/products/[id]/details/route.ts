/**
 * src/app/api/products/[slug]/details/route.ts
 *
 * MCR Phase 2 — Public-read API route for the
 * `ProductDocument` use case (the canonical "Product.details
 * resolver" referenced in the MCR plan §3.4).
 *
 *   GET /api/products/:id/details?locale=<locale> (the value is a public product slug)
 *
 * On success: returns the resolved ContentDocumentV1 + locale
 * metadata as a JSON payload (the success-branch of the
 * discriminated union).
 *
 * On failure: returns `{ error: "not_found" }` with HTTP 404
 * (the only soft branch today; no info leak between
 * "no product" and "product exists but not published").
 *
 * ─── Why this route shape ────────────────────────────────────────
 *
 *   - `id` is the physical URL parameter carrying the public product slug (canonical public identifier;
 *     no internal product.id leaks).
 *   - `locale` is read from the optional `?locale=` query param
 *     (BCP-47 short tag, e.g. "en"). Not the Accept-Language
 *     header here — the route layer keeps the API surface
 *     explicit; the consumer (Server Component) feeds the
 *     Accept-Language-derived locale in.
 *
 * Per ADR-0016 §1 dep direction: this route layer wires the
 * Domain use case + Domain port + Prisma adapter. The Domain
 * stays pure (no `@/lib/db/prisma` import in Domain files).
 *
 * The handler is THIN: it URL-decodes `slug`, parses the
 * `?locale=`, delegates to `fetchProductDocument`, and maps the
 * discriminated union to HTTP. No business logic lives here.
 */

import { NextResponse, type NextRequest } from "next/server";

import { fetchProductDocument } from "@/lib/data/product-document-data";

// ─── Route handler ───────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: slug } = await context.params;

  // `?locale=` query param (optional). The defensive trim at
  // the route boundary normalises a `?locale=%20%20` (whitespace
  // only) down to an empty string; the use case's falsy-coercion
  // handles empty / undefined uniformly. This keeps the route
  // thin — no business logic, just URL parsing + delegation.
  const localeParam = req.nextUrl.searchParams.get("locale")?.trim();
  const locale = localeParam === "" ? undefined : localeParam;

  const result = await fetchProductDocument({ slug, locale });

  // Map the discriminated-union outcome to HTTP.
  if (!result.success) {
    return NextResponse.json(
      { error: result.reason },
      { status: 404 },
    );
  }

  // Success branch — surface the resolved payload.
  return NextResponse.json(result.data, { status: 200 });
}
