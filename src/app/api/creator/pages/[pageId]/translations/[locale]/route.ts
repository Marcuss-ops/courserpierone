/**
 * src/app/api/creator/pages/[pageId]/translations/[locale]/route.ts
 *
 * Next.js App Router route handler —
 * `PUT /api/creator/pages/[pageId]/translations/[locale]`.
 *
 * Wraps the existing `saveContentDocument` use case with:
 *   1. Session authentication (`getServerUser`).
 *   2. Page-scoped access resolver
 *      (`resolveCreatorPageAccess({ requiredAction: "edit" })`).
 *      The resolver carries `pageProductId` through its allowed
 *      branch so the route can forward it into the use case's
 *      `productId` field WITHOUT a second DB read.
 *   3. Strict Zod body validation — accepts ONLY
 *      `{ expectedRevision: number, document: ContentDocumentV1,
 *        fallbackTitle?: string }`. NO `creatorId`, `productId`,
 *      `pageId`, `locale`, `actorId`, `revision` accepted from the
 *      client — all of those come from server-side sources.
 *   4. The 5-branch discriminated union outcome mapped to:
 *      200 / 400 / 401 / 403 / 404 / 409 / 422.
 *
 * ─── Architecture per ADR-0016 §1 ──────────────────────────────
 *
 * Route = thin composition root. Domain rule lives in
 * `saveContentDocument` AND the access resolver. The route:
 *   - Calls session middleware (auth gate).
 *   - Calls the access resolver (auth policy).
 *   - Validates `{ pageId, locale }` URL params + JSON body
 *     (input gate).
 *   - Delegates to the use case (domain rule).
 *   - Translates the 5-branch DU to HTTP status + envelope.
 *
 * ─── Strict-owner cascade ──────────────────────────────────────
 *
 * `saveContentDocument` is INTENTIONAL strict-owner-only
 * (mirrors rename). The cascading forbidden semantics apply
 * identically (see the file header on
 * `src/app/api/creator/pages/[pageId]/route.ts`). The route
 * does NOT pre-empt the cascade — letting the use case reject
 * via its own inline check is the canonical enforcement.
 *
 * ─── Conflict semantics (revision) ────────────────────────────
 *
 * The `revision` field on `ContentPageTranslation` is the
 * canonical optimistic-concurrency token. The client sends its
 * last-read revision as `expectedRevision`. The adapter performs
 * an atomic conditional UPDATE; on mismatch, the use case
 * surfaces `conflict` with `currentRevision` so the client can
 * refetch + diff. The route maps this to 409.
 *
 * ─── URL params ────────────────────────────────────────────────
 *
 *   - `[pageId]`  — ContentPage.id (cuid format; ASCII-safe).
 *   - `[locale]` — BCP-47 tag like `en` / `it` / `en-US`. Mild
 *     shape validation here (length + character class); the
 *     catalog domain does NOT normalize (no casefolding, no
 *     region stripping) — that's an i18n concern.
 *
 * ─── HTTP status code mapping ─────────────────────────────────
 *
 *   - 200  — success. Body carries `revision` (NEW value:
 *            `expectedRevision + 1` on update; `1` on create)
 *            + `updatedAt` ISO string.
 *   - 400  — invalid JSON OR Zod shape violation (incl. .strict()
 *            rejecting unknown fields like creatorId spoofs).
 *   - 401  — no session OR resolver `actor_not_found`.
 *   - 403  — resolver `forbidden` OR use case `forbidden`
 *            (strict-owner cascade).
 *   - 404  — resolver `page_not_found` OR use case `not_found`.
 *   - 409  — use case `conflict` (revision mismatch). Body
 *            carries `currentRevision` for the client to refetch.
 *   - 422  — use case `invalid_document` (Zod schema violation
 *            on the document tree, or free-HTML heuristic).
 *
 * All responses include `Cache-Control: no-store` because
 * creator-side mutations must not be cached.
 *
 * ─── Why `expectedRevision: number` (not optional) ──────────────
 *
 * The client MUST send its last-read revision as
 * `expectedRevision`. The use case treats `expectedRevision = 0`
 * OR any positive value as "the client's known revision" — on
 * the create branch (no row exists), it's effectively ignored.
 * Always requiring the field (no default) forces the editor to
 * be deliberate about its last-known revision value.
 */

import { NextResponse } from "next/server";

import { z } from "zod";

import { contentDocumentV1Schema } from "@/domains/catalog/blocks";
import {
  saveContentDocument,
  type SaveContentDocumentDeps,
} from "@/domains/catalog/content-pages/save-content-document";
import type {
  ContentPageTranslationRepository,
} from "@/domains/catalog/content-pages/save-content-document-types";
import { resolveCreatorPageAccess } from "@/domains/creator-ops/access/resolve-creator-page-access";
import type {
  ResolveCreatorPageAccessPort,
} from "@/domains/creator-ops/access/resolve-creator-page-access-types";
import { getServerUser } from "@/lib/supabase/get-user";

// ─── Module-level deps (route composition root) ─────────────────

/**
 * Composition root: assigns ports at startup. Mirrors the
 * established pattern in pages/[pageId]/route.ts,
 * reorder-pages/route.ts, publish/route.ts. The
 * `__setRouteDeps` indirection enables in-memory stub wiring
 * in unit tests without restructuring the route module.
 */
let cachedAccessPort: ResolveCreatorPageAccessPort | undefined;
let cachedDocRepoPort: ContentPageTranslationRepository | undefined;

/**
 * Visible to integration tests so they can swap in in-memory
 * stubs for both the access resolver port AND the document
 * repository port. Production wiring (server startup) assigns
 * the real Prisma adapters.
 */
export function __setRouteDeps(deps: {
  accessPort: ResolveCreatorPageAccessPort;
  docRepoPort: ContentPageTranslationRepository;
}): void {
  cachedAccessPort = deps.accessPort;
  cachedDocRepoPort = deps.docRepoPort;
}

// ─── Zod schemas ────────────────────────────────────────────────

/**
 * Route-layer body validation. Mirrors
 * `SaveContentDocumentInput` but with `expectedRevision` and
 * `document` + optional `fallbackTitle` ONLY — every other
 * field is server-derived (actorId from session, productId from
 * the resolver, pageId from the URL, locale from the URL).
 *
 * `.strict()` prevents the caller from sneaking in fields they
 * cannot legitimately set (`creatorId`, `actorId`, `productId`,
 * `pageId`, `locale`, `revision`, `plainText`, `updatedAt`, …).
 *
 * `expectedRevision` is a non-negative integer. The use case's
 * adapter treats `0` as "first save" semantically (no row
 * existed yet → create branch), but we don't paper over that
 * here — the client must send the value it knows about.
 */
const saveDocBodySchema = z
  .object({
    expectedRevision: z.number().int().min(0).max(2_147_483_647),
    document: contentDocumentV1Schema,
    fallbackTitle: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

// ─── URL param schemas ──────────────────────────────────────────

const pageIdParamSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/);

/**
 * BCP-47-ish: 2-3 letter language, optional 2-8 char region.
 * Mirrors the locale shape validation in the rename route.
 */
const localeParamSchema = z
  .string()
  .min(2)
  .max(10)
  .regex(/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})?$/);

// ─── PUT handler ───────────────────────────────────────────────

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ pageId: string; locale: string }> },
): Promise<NextResponse> {
  // ─── 0. Misconfig guard ─────────────────────────────────────
  if (!cachedAccessPort || !cachedDocRepoPort) {
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
  if (!serverUser?.dbUser) {
    return NextResponse.json(
      { ok: false, error: "unauthenticated" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  const actorId = serverUser.dbUser.id;

  // ─── 2. URL param validation ─────────────────────────────────
  const { pageId: rawPageId, locale: rawLocale } = await ctx.params;
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
  const localeParse = localeParamSchema.safeParse(rawLocale);
  if (!localeParse.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_request",
        message: "locale is not a valid BCP-47 tag",
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  const pageId = pageIdParse.data;
  const locale = localeParse.data;

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

  const bodyParse = saveDocBodySchema.safeParse(rawBody);
  if (!bodyParse.success) {
    // 400 covers BOTH document-tree Zod violations (the schema
    // is included in the body schema) AND .strict() rejection of
    // unknown fields. We log the issues so the editor can
    // highlight blocks / fields.
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_request",
        issues: bodyParse.error.issues,
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  const { expectedRevision, document, fallbackTitle } = bodyParse.data;

  // ─── 5. Use case — saveContentDocument ───────────────────────
  //
  // Deps are wired inline (the route is the composition root).
  // The use case body validates the document AGAIN (defense
  // in depth) via safeParseContentDocumentV1.
  const deps: SaveContentDocumentDeps = { repo: cachedDocRepoPort };
  const useCaseResult = await saveContentDocument(
    {
      actorId,
      productId,
      pageId,
      locale,
      expectedRevision,
      document,
      fallbackTitle,
    },
    deps,
  );

  // ─── 6. Map DU outcome → HTTP ────────────────────────────────
  if (useCaseResult.success) {
    return NextResponse.json(
      {
        ok: true,
        revision: useCaseResult.revision,
        updatedAt: useCaseResult.updatedAt.toISOString(),
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (useCaseResult.reason === "invalid_document") {
    // Use case re-parsed the document with safeParseContentDocumentV1
    // and found a Zod violation OR a free-HTML heuristic trigger.
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_document",
        issues: useCaseResult.error.issues,
      },
      { status: 422, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (useCaseResult.reason === "conflict") {
    // Revision mismatch — surface the DB's current revision so
    // the client can refetch + diff before re-saving.
    return NextResponse.json(
      {
        ok: false,
        error: "conflict",
        currentRevision: useCaseResult.currentRevision,
      },
      { status: 409, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (useCaseResult.reason === "not_found") {
    return NextResponse.json(
      { ok: false, error: "not_found" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }
  // useCaseResult.reason === "forbidden" — strict-owner cascade.
  return NextResponse.json(
    { ok: false, error: "forbidden" },
    { status: 403, headers: { "Cache-Control": "no-store" } },
  );
}
