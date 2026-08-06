/**
 * src/app/api/creator/products/[productId]/pages/reorder/route.ts
 *
 * Next.js App Router route handler —
 * `POST /api/creator/products/[productId]/pages/reorder`.
 *
 * Wraps the existing `reorderContentPages` use case with:
 *   1. Session authentication (`getServerUser`).
 *   2. Product-scoped access resolver
 *      (`resolveCreatorProductAccess({ requiredAction: "edit" })`).
 *   3. STRICT Zod payload validation — accepts
 *      `{ parentId?: string | null; orderedPages: ReorderEntry[] }`
 *      (1..1000 entries, pageId non-empty, newPosition ≥ 0).
 *   4. The discriminated union outcome mapped to status codes:
 *      200 / 400 / 401 / 403 / 404 / 422.
 *
 * ─── Migration note (MCR Phase 4) ─────────────────────────────────
 *
 * This route REPLACES the legacy
 * `src/app/api/creator/products/[productId]/reorder-pages/route.ts`
 * which was removed in commit `<TBD>`. The new path
 * `/pages/reorder` is structurally consistent with the
 * sibling `/pages` (create), `/pages/[pageId]/rename`, and
 * `/pages/[pageId]/translations/[locale]` (PUT) endpoints —
 * every page-tree mutation is now under the same `/pages`
 * subtree of `/api/creator/products/[productId]`.
 *
 * The semantics, use case composition, and status code mapping
 * are unchanged from the legacy handler — only the URL moved.
 *
 * ─── Architecture per ADR-0016 §1 ──────────────────────────────
 *
 * Route = thin composition root. Domain rule lives in
 * `reorderContentPages` AND the access resolver. The route:
 *   - Calls session middleware (auth gate).
 *   - Calls the access resolver (auth policy).
 *   - Validates URL params + JSON body (input gate).
 *   - Delegates to the use case (domain rule).
 *   - Translates the 9-branch discriminated union to HTTP status
 *     codes + envelope.
 *
 * ─── URL params ────────────────────────────────────────────────
 *
 * `[productId]` is the dynamic segment from the route directory.
 * The Next.js App Router hands us `ctx.params.productId` as a
 * plain string. The route forwards it as-is to both the
 * resolver AND the use case.
 *
 * ─── HTTP status code mapping ─────────────────────────────────
 *
 *   - 200  — success; `reordered` echoes the new ordering, `scope`
 *            echoes the `(productId, parentId)` of the reorder.
 *   - 400  — invalid JSON OR Zod shape violation.
 *   - 401  — no session OR resolver `actor_not_found`.
 *   - 403  — resolver `forbidden` OR use case `forbidden`.
 *   - 404  — resolver `product_not_found` OR use case `not_found`.
 *   - 422  — semantic invariant failures from the use case
 *            (`duplicate_page_id`, `non_contiguous_positions`,
 *            `scope_mismatch`, `incomplete_set`).
 *
 * All responses include `Cache-Control: no-store` because
 * creator-side mutations must not be cached.
 */

import { NextResponse } from "next/server";

import { reorderContentPages } from "@/domains/catalog/content-pages/reorder-content-pages";
import type {
  ReorderContentPagesPort,
} from "@/domains/catalog/content-pages/reorder-content-pages-types";
import { prismaReorderContentPagesRepository } from "@/domains/catalog/content-pages/prisma-reorder-content-pages-repository";
import { resolveCreatorProductAccess } from "@/domains/creator-ops/access/resolve-creator-product-access";
import { prismaResolveCreatorProductAccessPort } from "@/domains/creator-ops/access/prisma-resolve-creator-product-access";
import type {
  ResolveCreatorProductAccessPort,
} from "@/domains/creator-ops/access/resolve-creator-product-access-types";
import { getServerUser } from "@/lib/supabase/get-user";
import { z } from "zod";

// ─── Module-level deps (route composition root) ─────────────────

let cachedAccessPort: ResolveCreatorProductAccessPort = prismaResolveCreatorProductAccessPort;
let cachedReorderPort: ReorderContentPagesPort = prismaReorderContentPagesRepository;

export function __setRouteDeps(deps: {
  accessPort: ResolveCreatorProductAccessPort;
  reorderPort: ReorderContentPagesPort;
}): void {
  cachedAccessPort = deps.accessPort;
  cachedReorderPort = deps.reorderPort;
}

// ─── Zod schema ──────────────────────────────────────────────────

const reorderRouteEntrySchema = z.object({
  pageId: z.string().min(1, "pageId must be non-empty"),
  newPosition: z
    .number()
    .int("newPosition must be an integer")
    .min(0, "newPosition must be a non-negative integer"),
});

const reorderRouteBodySchema = z
  .object({
    parentId: z.string().nullable().optional(),
    orderedPages: z
      .array(reorderRouteEntrySchema)
      .min(1, "orderedPages must be non-empty")
      .max(1000, "orderedPages must be at most 1000 entries"),
  })
  .strict();

// ─── URL param schema ────────────────────────────────────────────

const productIdParamSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/);

// ─── POST handler ───────────────────────────────────────────────

export async function POST(
  req: Request,
  ctx: { params: Promise<{ productId: string }> },
): Promise<NextResponse> {
  // ─── 0. Misconfig guard ──────────────────────────────────────
  if (!cachedAccessPort || !cachedReorderPort) {
    return NextResponse.json(
      { ok: false, reason: "route_misconfigured" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  // ─── 1. SESSION ──────────────────────────────────────────────
  const sessionContext = await getServerUser();
  const dbUser = sessionContext?.dbUser ?? null;
  if (!dbUser) {
    return NextResponse.json(
      { ok: false, reason: "unauthenticated" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  // ─── 2. URL param validation ─────────────────────────────────
  const { productId: rawProductId } = await ctx.params;
  const productIdParse = productIdParamSchema.safeParse(rawProductId);
  if (!productIdParse.success) {
    return NextResponse.json(
      { ok: false, reason: "invalid_request", error: "productId is not a valid identifier" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  const productId = productIdParse.data;

  // ─── 3. ACCESS (strict — requiredAction: "edit") ─────────────
  const access = await resolveCreatorProductAccess(
    { actorId: dbUser.id, productId, requiredAction: "edit" },
    { port: cachedAccessPort },
  );
  if (!access.allowed) {
    const status =
      access.reason === "actor_not_found"
        ? 401
        : access.reason === "product_not_found"
        ? 404
        : 403;
    return NextResponse.json(
      { ok: false, reason: access.reason },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }

  // ─── 4. PARSE — strict Zod body validation ──────────────────
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, reason: "invalid_json" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const parsed = reorderRouteBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        reason: "invalid_payload",
        error: parsed.error.format(),
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  // ─── 5. CALL USE CASE — strict creator (no bypass for edit) ──
  const result = await reorderContentPages(
    {
      actorId: dbUser.id,
      productId,
      parentId: parsed.data.parentId ?? null,
      orderedPages: parsed.data.orderedPages,
    },
    { port: cachedReorderPort },
  );

  // ─── 6. RETURN — translate 9-branch discriminated union ─────
  if (result.success) {
    return NextResponse.json(
      {
        ok: true,
        reordered: result.reordered,
        scope: result.scope,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }

  switch (result.reason) {
    case "not_found":
      return NextResponse.json(
        { ok: false, reason: "not_found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    case "forbidden":
      return NextResponse.json(
        { ok: false, reason: "forbidden" },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    case "invalid_ordered_pages":
      return NextResponse.json(
        {
          ok: false,
          reason: "invalid_ordered_pages",
          error: result.error.format(),
        },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    case "duplicate_page_id":
      return NextResponse.json(
        { ok: false, reason: "duplicate_page_id" },
        { status: 422, headers: { "Cache-Control": "no-store" } },
      );
    case "non_contiguous_positions":
      return NextResponse.json(
        {
          ok: false,
          reason: "non_contiguous_positions",
          expectedSize: result.expectedSize,
          supplied: result.supplied,
        },
        { status: 422, headers: { "Cache-Control": "no-store" } },
      );
    case "scope_mismatch":
      return NextResponse.json(
        {
          ok: false,
          reason: "scope_mismatch",
          extras: result.extras,
        },
        { status: 422, headers: { "Cache-Control": "no-store" } },
      );
    case "incomplete_set":
      return NextResponse.json(
        {
          ok: false,
          reason: "incomplete_set",
          missingFromScope: result.missingFromScope,
        },
        { status: 422, headers: { "Cache-Control": "no-store" } },
      );
  }
}
