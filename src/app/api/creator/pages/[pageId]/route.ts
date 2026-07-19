/**
 * src/app/api/creator/pages/[pageId]/route.ts
 *
 * Next.js App Router route handler —
 * `PATCH /api/creator/pages/[pageId]`.
 *
 * Wraps the existing `renameContentPage` use case with:
 *   1. Session authentication (`getServerUser`).
 *   2. Page-scoped access resolver
 *      (`resolveCreatorPageAccess({ requiredAction: "edit" })`).
 *      The resolver carries the resolved `pageProductId` through
 *      its success branch so the route can forward it into the
 *      use case's `productId` field WITHOUT a second DB read.
 *   3. Strict Zod body validation — accepts ONLY
 *      `{ newTitle: string }` and `{ locale?: string | null }`
 *      (no other fields allowed by `.strict()`).
 *   4. The 5-branch discriminated union outcome mapped to:
 *      200 / 400 / 401 / 403 / 404 / 422.
 *
 * ─── Architecture per ADR-0016 §1 ──────────────────────────────
 *
 * Route = thin composition root. Domain rule lives in
 * `renameContentPage` AND the access resolver. The route:
 *   - Calls session middleware (auth gate).
 *   - Calls the access resolver (auth policy).
 *   - Validates the JSON body (input gate).
 *   - Delegates to the use case (domain rule).
 *   - Translates the 5-branch discriminated union to HTTP.
 *
 * ─── Strict-owner cascade ─────────────────────────────────────────
 *
 * `renameContentPage` is INTENTIONAL strict-owner-only (the use
 * case file header documents this as a defense-in-depth choice;
 * admin-edit is out of scope for v1). This means:
 *
 *   - Admin resolving → `source: "admin"` here → forwarded to
 *     use case → use case's inline check `productCtx.creatorId
 *     !== input.actorId` → `forbidden` → 403.
 *   - Approved-creator resolving → `source: "approved_creator"`
 *     here → forwarded to use case → same cascade → 403.
 *
 * The cascade is intentional and matches the file-header spec.
 * The route does NOT skip the use case when the resolver returns
 * non-owner `source: ...` — the use case's stake in strict
 * ownership cannot be bypassed without refactoring the use case
 * (which is a deliberate choice for v1).
 *
 * ─── URL params ────────────────────────────────────────────────
 *
 * `[pageId]` is the dynamic segment from the route directory.
 * The Next.js App Router hands us `ctx.params.pageId` as a
 * plain string. We forward verbatim — no URL decoding for
 * the pageId itself (cuids are ASCII-safe).
 *
 * ─── HTTP status code mapping ─────────────────────────────────
 *
 *   - 200  — success. Body carries the new title, the
 *            (resolved) locale, the new revision (= old + 1,
 *            mirrors SaveContentDocument's revision contract),
 *            and the updatedAt timestamp.
 *   - 400  — invalid JSON OR Zod shape violation. Body
 *            carries `error: "invalid_request"` + ZodError
 *            issues for form-level diagnostics.
 *   - 401  — no session OR resolver `actor_not_found`.
 *   - 403  — resolver `forbidden` OR use case `forbidden`
 *            (the latter covers the strict-owner cascade
 *            described above).
 *   - 404  — resolver `page_not_found` OR use case
 *            `not_found` (defensive — usually caught by
 *            the resolver).
 *   - 422  — `invalid_title` (Zod schema violation OR
 *            use case invalid_title denial) OR
 *            `translation_not_found` (semantic: editor must
 *            call SaveContentDocument first).
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

/**
 * Composition root: assigns ports at startup. Mirrors the
 * established pattern from `reorder-pages/route.ts` and
 * `publish/route.ts`. The `__setRouteDeps` indirection enables
 * in-memory stub wiring in unit tests without restructuring
 * the route module.
 */
let cachedAccessPort: ResolveCreatorPageAccessPort | undefined;
let cachedRenamePort: RenameContentPagePort | undefined;

/**
 * Visible to integration tests so they can swap in in-memory
 * stubs for both the access resolver port AND the rename port.
 * Production wiring (server startup) assigns the real Prisma
 * adapters.
 */
export function __setRouteDeps(deps: {
  accessPort: ResolveCreatorPageAccessPort;
  renamePort: RenameContentPagePort;
}): void {
  cachedAccessPort = deps.accessPort;
  cachedRenamePort = deps.renamePort;
}

// ─── Zod schema ──────────────────────────────────────────────────

/**
 * Route-layer body schema (defense in depth — the use case's
 * `contentPageTitleSchema.safeParse` already validates newTitle,
 * but we also validate at the route layer so the consumer gets
 * a single 400 with the ZodError rather than two layers of
 * redundant parsing on the happy path).
 *
 * `.strict()` prevents the caller from sneaking in fields the
 * use case doesn't know about (`creatorId`, `revision`,
 * `locale` overrides, etc.). Only `newTitle` and the optional
 * `locale` are accepted.
 *
 * `locale?: string | null` mirrors the use case input shape
 * (the use case handles the `?? product.defaultLanguage` fallback).
 */
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

// ─── URL param schema ────────────────────────────────────────────

/**
 * Defensive validation on the URL param. Cuid format is
 * `c{timestamp}{random}` — non-empty ASCII alphanumeric.
 * Anything else → 400 (we don't reveal the error class to avoid
 * leaking format details to attackers scanning the route).
 */
const pageIdParamSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/);

// ─── PATCH handler ───────────────────────────────────────────────

export async function PATCH(
  req: Request,
  ctx: { params: { pageId: string } },
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
  if (!serverUser || !serverUser.dbUser) {
    return NextResponse.json(
      { ok: false, error: "unauthenticated" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  const actorId = serverUser.dbUser.id;

  // ─── 2. URL param validation ───────────────────────────────────
  const pageIdParse = pageIdParamSchema.safeParse(ctx.params.pageId);
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

  // accessResult.allowed === true; we have pageProductId
  const productId = accessResult.pageProductId;

  // ─── 4. Body parse ────────────────────────────────────────────
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

  // ─── 5. Use case — renameContentPage ─────────────────────────
  //
  // Note on the strict-owner cascade described in the file
  // header: when `accessResult.source !== "owner"` (i.e., the
  // resolver returned admin or approved_creator), the use case's
  // inline owner check will reject with `forbidden`. We let
  // that rejection happen via the use case's typed `forbidden`
  // return rather than pre-empting at the route layer (defense
  // in depth: the use case is the canonical enforcer of strict
  // ownership for the edit path).
  const useCaseResult = await renameContentPage(
    { actorId, productId, pageId, locale, newTitle },
    { port: cachedRenamePort },
  );

  // ─── 6. Map DU outcome → HTTP ─────────────────────────────────
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

  // Use case returned a typed denial. Map to HTTP per the
  // docstring matrix.
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
  // Semantic 404: the page exists but has no translation row for
  // the resolved locale yet. Editor flow must call
  // SaveContentDocument first.
  return NextResponse.json(
    {
      ok: false,
      error: "translation_not_found",
      locale: useCaseResult.locale,
    },
    { status: 404, headers: { "Cache-Control": "no-store" } },
  );
}
