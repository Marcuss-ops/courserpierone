/**
 * src/app/api/creator/products/[productId]/pages/route.ts
 *
 * Next.js App Router route handler —
 * `POST /api/creator/products/[productId]/pages`.
 *
 * Wraps the existing `createContentPage` use case with:
 *   1. Session authentication (`getServerUser`).
 *   2. Product-scoped access resolver
 *      (`resolveCreatorProductAccess({ requiredAction: "create" })`).
 *   3. Strict Zod body validation — accepts ONLY
 *      `{ slug: string, parentId?: string | null, status?: PageStatus }`.
 *      `.strict()` rejects spoofing attempts (creatorId, actorId,
 *      productId, id, pageId, position — none of these are
 *      client-settable).
 *   4. The 7-branch discriminated union outcome mapped to:
 *      200 / 400 / 401 / 403 / 404 / 409.
 *
 * ─── Architecture per ADR-0016 §1 ──────────────────────────────
 *
 * Route = thin composition root. Domain rule lives in
 * `createContentPage` AND the access resolver. The route:
 *   - Calls session middleware (auth gate).
 *   - Calls the access resolver (auth policy).
 *   - Validates the JSON body (input gate).
 *   - Delegates to the use case (domain rule).
 *   - Translates the 7-branch DU to HTTP status + envelope.
 *
 * ─── Strict-owner cascade ─────────────────────────────────────────
 *
 * `createContentPage` is INTENTIONAL strict-owner-only — the use
 * case inline-checks `actorId !== product.creatorId`. Walking
 * through the resolver's 3-source allow-rule:
 *
 *   - admin (source:"admin") from resolver → forwarded to use case →
 *     use case's inline check rejects → forbidden → 403.
 *   - approved_creator (source:"approved_creator") from resolver →
 *     same cascade → 403.
 *   - owner (source:"owner") from resolver → use case accepts →
 *     continues to the create branch.
 *
 * The cascade is correct and intentional. The route does not
 * pre-empt the use case's check.
 *
 * ─── URL params ────────────────────────────────────────────────
 *
 * `[productId]` is the dynamic segment from the route directory.
 * cuid format — non-empty ASCII alphanumeric + underscore/hyphen.
 *
 * ─── HTTP status code mapping ─────────────────────────────────
 *
 *   - 201  — success. Body carries the full ContentPageRecord
 *     (id, productId, parentId, slug, position, status, publishedAt,
 *     createdAt, updatedAt). position is AUTO-assigned by the
 *     adapter (max+1 within scope); the use case forwards it
 *     verbatim from the port so the client doesn't refetch.
 *   - 400  — invalid JSON OR Zod shape violation. Includes:
 *            `invalid_slug` (slug regex failure) and
 *            `invalid_status` (status not in the literal set).
 *            Each carries the ZodError issues for form-level
 *            diagnostics.
 *   - 401  — no session.
 *   - 403  — resolver `forbidden` OR use case `forbidden` (the
 *            latter covers the strict-owner cascade).
 *   - 404  — resolver `product_not_found` OR use case
 *            `not_found` OR use case `parent_not_found` (collapsed
 *            to avoid leaking cross-product page-id existence).
 *   - 409  — use case `slug_taken` (DB @@unique([productId, slug])
 *            violation surfaced as P2002 from the adapter).
 *
 * All responses include `Cache-Control: no-store` because
 * creator-side mutations must not be cached.
 */

import { NextResponse } from "next/server";

import { z } from "zod";

import {
  createContentPage,
  type CreateContentPageDeps,
} from "@/domains/catalog/content-pages/create-content-page";
import {
  contentPageStatusSchema,
  type ContentPageRepository,
} from "@/domains/catalog/content-pages/create-content-page-types";
import { resolveCreatorProductAccess } from "@/domains/creator-ops/access/resolve-creator-product-access";
import type {
  ResolveCreatorProductAccessPort,
} from "@/domains/creator-ops/access/resolve-creator-product-access-types";
import { getServerUser } from "@/lib/supabase/get-user";

// ─── Module-level deps (route composition root) ─────────────────

/**
 * Composition root: assigns ports at startup. Mirrors the
 * established pattern from publish + reorder + create-product-draft
 * routes. `__setRouteDeps` enables in-memory stub wiring in unit
 * tests without restructuring the route module.
 */
let cachedAccessPort: ResolveCreatorProductAccessPort | undefined;
let cachedPageRepoPort: ContentPageRepository | undefined;

/**
 * Visible to integration tests so they can swap in in-memory
 * stubs for both the access resolver port AND the page-repository
 * port. Production wiring (server startup) assigns the real
 * Prisma adapters.
 */
export function __setRouteDeps(deps: {
  accessPort: ResolveCreatorProductAccessPort;
  pageRepoPort: ContentPageRepository;
}): void {
  cachedAccessPort = deps.accessPort;
  cachedPageRepoPort = deps.pageRepoPort;
}

// ─── Zod body schema ─────────────────────────────────────────────

/**
 * Route-layer body validation. Mirrors `CreateContentPageInput`
 * MINUS the server-derived fields (actorId, productId) — those come
 * from session + URL params, never from the body.
 *
 * `.strict()` rejects `creatorId`, `actorId`, `productId`, `id`,
 * `pageId`, `position`, `createdAt`, `updatedAt`, `publishedAt`,
 * anything else not in this list. The architecture-guard test
 * enumerates the forbidden field list at runtime.
 *
 * `slug` validation uses a non-anchored regex that mirrors the
 * `contentSlugSchema` regex from the use case's domain layer
 * (lowercase, alphanumeric + dashes, 3–64 chars). The use case
 * re-validates against `contentSlugSchema` (defense in depth) —
 * duplication here is intentional: the route layer needs the same
 * shape for early 400 bypass, before the use case runs.
 *
 * `parentId?: string | null` mirrors the use case input (the use
 * case handles the `?? null` fallback). Providing `null` is the
 * explicit way to set a top-level page; omitting the field
 * produces the same outcome.
 *
 * `status?: "draft" | "published" | "archived"` — explicit literal
 * union (the catalog's `PageStatus` type is structural, but TS
 * can't see across the @/* path alias without a type-only import).
 * Default of "draft" if not provided is handled inside the use case.
 */
const createPageBodySchema = z
  .object({
    slug: z
      .string()
      .min(3)
      .max(64)
      .regex(/^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])?$/),
    parentId: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[A-Za-z0-9_-]+$/)
      .nullable()
      .optional(),
    // Use the shared domain schema (not a hardcoded literal
    // tuple) so any future status added to PAGE_STATUSES propagates
    // here automatically. The use case re-validates against the
    // same schema — defense in depth.
    status: contentPageStatusSchema.optional(),
  })
  .strict();

// ─── URL param schema ────────────────────────────────────────────

/**
 * cuid format. Cuid `c{timestamp}{random}` — non-empty ASCII
 * alphanumeric. Anything else → 400.
 */
const productIdParamSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/);

// ─── POST handler ───────────────────────────────────────────────

export async function POST(
  req: Request,
  ctx: { params: { productId: string } },
): Promise<NextResponse> {
  // ─── 0. Misconfig guard ──────────────────────────────────────
  if (!cachedAccessPort || !cachedPageRepoPort) {
    return NextResponse.json(
      {
        ok: false,
        error: "misconfigured",
        message: "route composition root not initialized",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  // ─── 1. Auth — session ───────────────────────────────────────
  const serverUser = await getServerUser();
  if (!serverUser || !serverUser.dbUser) {
    return NextResponse.json(
      { ok: false, error: "unauthenticated" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  const actorId = serverUser.dbUser.id;

  // ─── 2. URL param validation ─────────────────────────────────
  const productIdParse = productIdParamSchema.safeParse(ctx.params.productId);
  if (!productIdParse.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_request",
        message: "productId is not a valid identifier",
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  const productId = productIdParse.data;

  // ─── 3. Authz — resolver with requiredAction: "create" ─────
  //
  // requiredAction: "create" is the canonical SSO action for
  // the SSOT resolver; the action t is captured in the input
  // and echoed on success for audit logging. v1 logic: any of
  // the 3 allow sources passes — admin (cascade), owner,
  // approved_creator (cascade). Strict-owner enforcement lives
  // in the use case body.
  const accessResult = await resolveCreatorProductAccess(
    { actorId, productId, requiredAction: "create" },
    { port: cachedAccessPort },
  );

  if (!accessResult.allowed) {
    if (accessResult.reason === "actor_not_found") {
      return NextResponse.json(
        { ok: false, error: "unauthenticated" },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (accessResult.reason === "product_not_found") {
      return NextResponse.json(
        { ok: false, error: "not_found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
    // reason === "forbidden"
    return NextResponse.json(
      { ok: false, error: "forbidden" },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  // accessResult.allowed === true; the resolver already verified
  // the actor is allowed to act on this product.
  //
  // ─── 4. Body parse ───────────────────────────────────────────
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_request",
        message: "request body is not valid JSON",
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const bodyParse = createPageBodySchema.safeParse(rawBody);
  if (!bodyParse.success) {
    // Covers BOTH the schema-level validation (regex / .strict()
    // rejection) AND the malformed-body case (caught above).
    // The use case will re-validate against its own Zod schemas
    // but we surface the 400 here so the route layer doesn't
    // double-emit a 500 from a thrown ZodError downstream.
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_request",
        issues: bodyParse.error.issues,
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  const { slug, parentId, status } = bodyParse.data;

  // ─── 5. Use case — createContentPage ────────────────────────
  //
  // The route is the composition root; we wire the use case's
  // deps here. The use case body performs:
  //   - slug + status Zod safe-parse (defense in depth)
  //   - product existence + ownership check (inline owner check
  //     drives the strict-owner cascade documented above)
  //   - parent-in-same-product verification (collapses to
  //     parent_not_found on cross-product parents)
  //   - atomic INSERT with auto-position + slug uniqueness
  const deps: CreateContentPageDeps = { repo: cachedPageRepoPort };
  const useCaseResult = await createContentPage(
    {
      actorId,
      productId,
      parentId: parentId ?? null,
      slug,
      status: status ?? undefined,
    },
    deps,
  );

  // ─── 6. Map DU outcome → HTTP ────────────────────────────────
  if (useCaseResult.success) {
    // Serialize createdAt/updatedAt/publishedAt to ISO strings
    // (Date → string is the default JSON envelope transformation
    // but we make it explicit here to mirror the publishContent-
    // Product route's response shape).
    const p = useCaseResult.page;
    return NextResponse.json(
      {
        ok: true,
        page: {
          id: p.id,
          productId: p.productId,
          parentId: p.parentId,
          slug: p.slug,
          position: p.position,
          status: p.status,
          publishedAt: p.publishedAt ? p.publishedAt.toISOString() : null,
          createdAt: p.createdAt.toISOString(),
          updatedAt: p.updatedAt.toISOString(),
        },
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  }

  // Use case returned a typed denial. Map each reason to HTTP
  // per the docstring matrix.
  if (useCaseResult.reason === "not_found") {
    return NextResponse.json(
      { ok: false, error: "not_found" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (useCaseResult.reason === "forbidden") {
    // Strict-owner cascade: resolver said admin/approved_creator
    // but the use case rejected because the actor does not own
    // the product. Same 403 surface as a direct resolver denial.
    return NextResponse.json(
      { ok: false, error: "forbidden" },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (useCaseResult.reason === "invalid_slug") {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_slug",
        issues: useCaseResult.error.issues,
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (useCaseResult.reason === "invalid_status") {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_status",
        issues: useCaseResult.error.issues,
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (useCaseResult.reason === "parent_not_found") {
    // Collapsed 404 to avoid leaking cross-product page-id
    // existence (matches the renameContentPage + saveContentDocument
    // patterns).
    return NextResponse.json(
      { ok: false, error: "not_found" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }
  // useCaseResult.reason === "slug_taken"
  return NextResponse.json(
    { ok: false, error: "slug_taken" },
    { status: 409, headers: { "Cache-Control": "no-store" } },
  );
}
