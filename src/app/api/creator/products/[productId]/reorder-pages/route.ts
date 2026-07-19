/**
 * src/app/api/creator/products/[productId]/reorder-pages/route.ts
 *
 * Next.js App Router route handler —
 * `POST /api/creator/products/[productId]/reorder-pages`.
 *
 * Wraps the existing `reorderContentPages` use case with:
 *   1. Session authentication (`getServerUser`).
 *   2. Product-scoped access resolver
 *      (`resolveCreatorProductAccess({ requiredAction: "edit" })`)
 *      — gates the actor against admin/owner/approved_creator
 *      sources. Admin does NOT bypass for edit (matches the
 *      established pattern from rename/reorder: strict owner
 *      check inline; admin flows through the `approved_creator`
 *      path, not a flag).
 *   3. STRICT Zod payload validation — accepts
 *      `{ parentId?: string | null; orderedPages: ReorderEntry[] }`
 *      (1..1000 entries, pageId non-empty, newPosition ≥ 0).
 *   4. The discriminated union outcome mapped to status codes:
 *      200 / 400 / 401 / 403 / 404 / 422.
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
 * resolver AND the use case. No URL decoding for `productId`
 * itself (cuids are ASCII-safe).
 *
 * ─── `bypassOwnership` is NOT wired for `edit` ─────────────────
 *
 * The publish use case introduced the `bypassOwnership?: boolean`
 * flag for admin publish (commit a312d84's doc-comment rationale).
 * The reorder use case does NOT have such a flag (mirrors rename
 * and the original reorder design: strict owner-only inline check).
 *
 * Admin reordering other people's pages IS a future concern —
 * either (a) extend `reorderContentPages` with `bypassOwnership`,
 * or (b) route admin reorders through `resolveCreatorProductAccess`
 * source=`"approved_creator"` (which doesn't apply for edit on
 * non-owned products today). For v1: admin cannot reorder other
 * creators' pages through this route.
 *
 * ─── HTTP status code mapping ─────────────────────────────────
 *
 *   - 200  — success; `reordered` echoes the new ordering, `scope`
 *            echoes the `(productId, parentId)` of the reorder.
 *   - 400  — invalid JSON OR Zod shape violation. Body carries
 *            ZodError issues for form-level diagnostics.
 *   - 401  — no session OR resolver `actor_not_found` (defensive
 *            401-style collapse).
 *   - 403  — resolver `forbidden` OR use case `forbidden`.
 *   - 404  — resolver `product_not_found` OR use case `not_found`.
 *   - 422  — semantic invariant failures from the use case
 *            (`duplicate_page_id`, `non_contiguous_positions`,
 *            `scope_mismatch`, `incomplete_set`). Body carries
 *            diagnostic echo (extras, missingFromScope, supplied).
 *
 * All responses include `Cache-Control: no-store` because
 * creator-side mutations must not be cached.
 */

import { NextResponse } from "next/server";

import { reorderContentPages } from "@/domains/catalog/content-pages/reorder-content-pages";
import type {
  ReorderContentPagesPort,
} from "@/domains/catalog/content-pages/reorder-content-pages-types";
import { resolveCreatorProductAccess } from "@/domains/creator-ops/access/resolve-creator-product-access";
import type {
  ResolveCreatorProductAccessPort,
} from "@/domains/creator-ops/access/resolve-creator-product-access-types";
import { getServerUser } from "@/lib/supabase/get-user";
import { z } from "zod";

// ─── Module-level deps (route composition root) ─────────────────

/**
 * Composition root: assigns ports at startup. Mirrors the
 * pattern from `src/app/api/creator/products/route.ts`. The
 * `__setRouteDeps` indirection enables in-memory stub wiring
 * in unit tests without restructuring the route module.
 */
let cachedAccessPort: ResolveCreatorProductAccessPort | undefined;
let cachedReorderPort: ReorderContentPagesPort | undefined;

/**
 * Visible to integration tests so they can swap in in-memory
 * stubs for both the access resolver port AND the reorder port.
 * Production wiring (server startup) assigns the real Prisma
 * adapters.
 */
export function __setRouteDeps(deps: {
  accessPort: ResolveCreatorProductAccessPort;
  reorderPort: ReorderContentPagesPort;
}): void {
  cachedAccessPort = deps.accessPort;
  cachedReorderPort = deps.reorderPort;
}

// ─── Zod schema ──────────────────────────────────────────────────

/**
 * Per-entry schema mirrors `reorderEntrySchema` from the use
 * case's types file — we re-declare it here at the route layer
 * (Defense in depth: the route validates BEFORE the use case's
 * own safeParse, surfacing 400 here rather than double-validation
 * at the use case).
 */
const reorderRouteEntrySchema = z.object({
  pageId: z.string().min(1, "pageId must be non-empty"),
  newPosition: z
    .number()
    .int("newPosition must be an integer")
    .min(0, "newPosition must be a non-negative integer"),
});

/**
 * The route accepts `{ parentId?: string | null; orderedPages: [{ pageId, newPosition }, ...] }`.
 *
 * `.strict()` rejects any extra fields (including those the use
 * case doesn't read). `parentId` is optional: omitted `parentId`
 * defaults to `null` (top-level scope) at the route layer. Array
 * length is bounded 1..1000 (mirrors `REORDER_BATCH_MAX` from
 * the use case's types — defense in depth on the route layer
 * against a tampered client sending a 100k-entry payload).
 */
const reorderRouteBodySchema = z
  .object({
    parentId: z.string().nullable().optional(),
    orderedPages: z
      .array(reorderRouteEntrySchema)
      .min(1, "orderedPages must be non-empty")
      .max(1000, "orderedPages must be at most 1000 entries"),
  })
  .strict();

// ─── POST handler ───────────────────────────────────────────────

export async function POST(
  req: Request,
  ctx: { params: { productId: string } },
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

  // ─── 2. ACCESS (strict — requiredAction: "edit") ─────────────
  const productId = ctx.params.productId;
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

  // ─── 3. PARSE — strict Zod body validation ──────────────────
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

  // ─── 4. CALL USE CASE — strict creator (no bypass for edit) ──
  const result = await reorderContentPages(
    {
      actorId: dbUser.id,
      productId,
      parentId: parsed.data.parentId ?? null,
      orderedPages: parsed.data.orderedPages,
    },
    { port: cachedReorderPort },
  );

  // ─── 5. RETURN — translate 9-branch discriminated union ─────
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

  // Branch-specific mapping. The order DOES NOT matter at
  // runtime (TypeScript narrows per branch); we encode the
  // 9 reasons × (status + body echo payload) explicitly.
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
