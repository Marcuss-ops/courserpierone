/**
 * src/app/api/creator/products/[productId]/pages/[pageId]/rename/route.ts
 *
 * Next.js App Router route handler —
 * `PATCH /api/creator/products/[productId]/pages/[pageId]/rename`.
 *
 * Wraps the existing `renameContentPage` use case with:
 *   1. Session authentication (`getServerUser`).
 *   2. URL param parsing — both `[productId]` and `[pageId]`.
 *   3. Page-scoped access resolver
 *      (`resolveCreatorPageAccess({ requiredAction: "edit" })`).
 *      The resolver carries the resolved `pageProductId` through
 *      its success branch.
 *   4. **Defense-in-depth URL `productId` check** — the URL's
 *      `[productId]` MUST match the page's actual productId
 *      (resolved from the page access context). Mismatch → 404
 *      (collapsed, no info leak about cross-product pages).
 *      This is what gives the new URL `productId` segment
 *      meaning beyond decoration.
 *   5. Strict Zod body validation — accepts ONLY
 *      `{ newTitle: string }` and `{ locale?: string | null }`.
 *   6. The 5-branch discriminated union outcome mapped to:
 *      200 / 400 / 401 / 403 / 404 / 422.
 *
 * ─── Migration note (MCR Phase 4) ─────────────────────────────────
 *
 * This route REPLACES the legacy
 * `src/app/api/creator/pages/[pageId]/route.ts` which was
 * removed in commit `<TBD>`. The new URL is structurally
 * consistent with the sibling `/pages` (create), `/pages/reorder`
 * (POST), and `/pages/[pageId]/translations/[locale]` (PUT)
 * endpoints. Every page-tree mutation is now under the same
 * `/pages` subtree of `/api/creator/products/[productId]`.
 *
 * Note: the PUT translations endpoint lives at the OLD
 * `/api/creator/pages/[pageId]/translations/[locale]` path —
 * it's NOT in scope for this migration (different verb, different
 * sibling endpoint that doesn't carry `[productId]` semantically
 * since the locale+pageId pair is already uniquely identifying).
 *
 * ─── Architecture per ADR-0016 §1 ──────────────────────────────
 *
 * Route = thin composition root. Domain rule lives in
 * `renameContentPage` AND the access resolver. The route:
 *   - Calls session middleware (auth gate).
 *   - Calls the access resolver (auth policy).
 *   - Validates URL params (input gate) — including the
 *     defense-in-depth productId match.
 *   - Validates the JSON body (input gate).
 *   - Delegates to the use case (domain rule).
 *   - Translates the 5-branch discriminated union to HTTP.
 *
 * ─── Strict-owner cascade ─────────────────────────────────────────
 *
 * `renameContentPage` is INTENTIONAL strict-owner-only. The
 * resolver returns `source: "admin"` or `source: "approved_creator"`
 * for non-owners with elevated rights, and the use case's inline
 * check `productCtx.creatorId !== input.actorId` → `forbidden`
 * → 403. The route does NOT pre-empt the use case.
 *
 * ─── URL params ────────────────────────────────────────────────
 *
 *   - `[productId]` is parsed for the defense-in-depth check.
 *     If the URL productId doesn't match the page's actual
 *     productId, the response is collapsed to 404.
 *   - `[pageId]` is forwarded verbatim into the resolver and
 *     the use case.
 *
 * ─── HTTP status code mapping ─────────────────────────────────
 *
 *   - 200  — success. Body carries the new title, the
 *            (resolved) locale, the new revision, and the
 *            updatedAt timestamp.
 *   - 400  — invalid JSON OR Zod shape violation.
 *   - 401  — no session OR resolver `actor_not_found`.
 *   - 403  — resolver `forbidden` OR use case `forbidden`
 *            (the latter covers the strict-owner cascade).
 *   - 404  — resolver `page_not_found`, defense-in-depth
 *            productId mismatch, OR use case `not_found` OR
 *            use case `translation_not_found` (collapsed).
 *   - 422  — `invalid_title` (Zod schema violation).
 *
 * All responses include `Cache-Control: no-store` because
 * creator-side mutations must not be cached.
 */

import { NextResponse } from "next/server";

import { z } from "zod";

import { renameContentPage } from "@/domains/catalog/content-pages/rename-content-page";
import type {
  RenameContentPagePort,
} from "@/domains/catalog/content-pages/rename-content-page-types";
import { resolveCreatorPageAccess } from "@/domains/creator-ops/access/resolve-creator-page-access";
import type {
  ResolveCreatorPageAccessPort,
} from "@/domains/creator-ops/access/resolve-creator-page-access-types";
import { getServerUser } from "@/lib/supabase/get-user";

// ─── Module-level deps (route composition root) ─────────────────

let cachedAccessPort: ResolveCreatorPageAccessPort | undefined;
let cachedRenamePort: RenameContentPagePort | undefined;

export function __setRouteDeps(deps: {
  accessPort: ResolveCreatorPageAccessPort;
  renamePort: RenameContentPagePort;
}): void {
  cachedAccessPort = deps.accessPort;
  cachedRenamePort = deps.renamePort;
}

// ─── Zod schema ──────────────────────────────────────────────────

const renamePageBodySchema = z
  .object({
    newTitle: z.string().trim().min(1).max(200),
    locale: z
      .string()
      .min(2)
      .max(10)
      .regex(/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})?$/)
      .optional()
      .nullable(),
  })
  .strict();

// ─── URL param schemas ────────────────────────────────────────────

const productIdParamSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/);

const pageIdParamSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/);

// ─── PATCH handler ───────────────────────────────────────────────

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ productId: string; pageId: string }> },
): Promise<NextResponse> {
  // ─── 0. Misconfig guard ──────────────────────────────────────
  if (!cachedAccessPort || !cachedRenamePort) {
    return NextResponse.json(
      {
        ok: false,
        error: "misconfigured",
        message: "route composition root not initialized",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  // ─── 1. Auth — session ─────────────────────────────────────────
  const serverUser = await getServerUser();
  if (!serverUser?.dbUser) {
    return NextResponse.json(
      { ok: false, error: "unauthenticated" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  const actorId = serverUser.dbUser.id;

  // ─── 2. URL param validation ───────────────────────────────────
  const { productId: rawProductId, pageId: rawPageId } = await ctx.params;
  const productIdParse = productIdParamSchema.safeParse(rawProductId);
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

  const pageIdParse = pageIdParamSchema.safeParse(rawPageId);
  if (!pageIdParse.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_request",
        message: "pageId is not a valid identifier",
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  const pageId = pageIdParse.data;

  // ─── 3. Authz — resolver with requiredAction: "edit" ────────
  const accessResult = await resolveCreatorPageAccess(
    { actorId, pageId, requiredAction: "edit" },
    { port: cachedAccessPort },
  );

  if (!accessResult.allowed) {
    if (accessResult.reason === "actor_not_found") {
      return NextResponse.json(
        { ok: false, error: "unauthenticated" },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (accessResult.reason === "page_not_found") {
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

  // ─── 4. Defense-in-depth: URL productId must match page's productId
  //
  // The new URL has `[productId]` in the path. Verify it matches
  // the page's actual productId (resolved via the page access
  // context). Mismatch → 404 (collapsed, no info leak about
  // cross-product pages).
  if (accessResult.pageProductId !== productId) {
    return NextResponse.json(
      { ok: false, error: "not_found" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  // ─── 5. Body parse ────────────────────────────────────────────
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

  const bodyParse = renamePageBodySchema.safeParse(rawBody);
  if (!bodyParse.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_request",
        issues: bodyParse.error.issues,
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  const { newTitle, locale } = bodyParse.data;

  // ─── 6. Use case — renameContentPage ─────────────────────────
  //
  // Strict-owner cascade: when accessResult.source !== "owner",
  // the use case's inline check rejects with `forbidden`. We let
  // the use case's typed return propagate rather than pre-empting
  // at the route layer (defense in depth).
  const useCaseResult = await renameContentPage(
    { actorId, productId, pageId, locale, newTitle },
    { port: cachedRenamePort },
  );

  // ─── 7. Map DU outcome → HTTP ─────────────────────────────────
  if (useCaseResult.success) {
    return NextResponse.json(
      {
        ok: true,
        title: useCaseResult.title,
        locale: useCaseResult.locale,
        revision: useCaseResult.revision,
        updatedAt: useCaseResult.updatedAt.toISOString(),
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (useCaseResult.reason === "not_found") {
    return NextResponse.json(
      { ok: false, error: "not_found" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (useCaseResult.reason === "forbidden") {
    return NextResponse.json(
      { ok: false, error: "forbidden" },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (useCaseResult.reason === "invalid_title") {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_title",
        issues: useCaseResult.error.issues,
      },
      { status: 422, headers: { "Cache-Control": "no-store" } },
    );
  }
  // useCaseResult.reason === "translation_not_found"
  return NextResponse.json(
    {
      ok: false,
      error: "translation_not_found",
      locale: useCaseResult.locale,
    },
    { status: 404, headers: { "Cache-Control": "no-store" } },
  );
}
