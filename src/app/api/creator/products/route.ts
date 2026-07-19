/**
 * src/app/api/creator/products/route.ts
 *
 * Next.js App Router route handler —
 * `POST /api/creator/products`.
 *
 * Wraps the existing `CreateProductDraft` use case
 * (src/domains/catalog/products/create-product-draft.ts) with:
 *   1. Session authentication (`getServerUser`).
 *   2. Create-time access resolver
 *      (`resolveCreateProductAccess`) — gates by actor role +
 *      CreatorApplication status (NOT by product ownership,
 *      since no productId exists yet).
 *   3. STRICT Zod payload validation — the schema is
 *      `{ slug }` only; `creatorId` and ANY other field
 *      (including hardcoded fields like `contentKind`,
 *      `status`, `price`) are rejected at parse time.
 *   4. Authorization-aware 1xx/2xx/4xx/5xx HTTP response
 *      with `Cache-Control: no-store` (creator-side mutation).
 *
 * ─── Architecture per ADR-0016 §1 ──────────────────────────────
 *
 * Route layer = thin composition root. Domain rule lives in
 * `CreateProductDraft` + `resolveCreateProductAccess`. The
 * route does:
 *   - Call session middleware (auth gate).
 *   - Call the create-time access resolver (auth policy).
 *   - Parse + validate the JSON body (input gate).
 *   - Delegate to the use case (domain rule).
 *   - Translate the discriminated-union outcome to an HTTP
 *     status code + envelope response.
 *
 * ─── Why `creatorId` is NOT in the Zod schema (the spec's hard requirement)
 *
 * The user spec is explicit: `creatorId` MUST come from the
 * session, NEVER from the payload. Three layers of enforcement:
 *
 *   1. **Schema shape**: `z.object({ slug }).strict()`. The
 *      `creatorId` field is not declared; the Zod type is
 *      `{ slug: string }` and the runtime parser drops any
 *      extra keys.
 *
 *   2. **`.strict()` mode**: even `creatorId: "..."` provided
 *      by a tampered client is rejected with a ZodError
 *      ("Unrecognized key 'creatorId'"). This is the
 *      concrete technical form of "no creatorId accettato dal
 *      client".
 *
 *   3. **Use-case contract**: `CreateProductDraftInput` does
 *      NOT include `creatorId` — the type system rejects any
 *      caller trying to construct one. The use case forwards
 *      `actorId` to the port, which populates
 *      `Product.creatorId` in the SQL INSERT.
 *
 * The route's mapping from `actor_not_found` is intentionally
 * surfaced as the explicit envelope shape
 * `{ ok: false, reason: "creator_id_forbidden_in_payload" }`
 * for the case where the .strict() rejection triggered
 * specifically because of `creatorId` (vs. any other
 * unrecognised key). This makes the response crystal-clear for
 * the editor UI's debugging UX.
 *
 * ─── HTTP status code mapping ──────────────────────────────────
 *
 *   - `201`        — product bootstrapped successfully. Body:
 *                    `{ ok: true, product: ProductDraftRecord }`.
 *   - `400`        — JSON parse error OR strict-Zod failure.
 *                    Body: `{ ok: false, reason:
 *                    "invalid_payload" | "creator_id_forbidden_in_payload", error }`.
 *   - `401`        — no session (`getCurrentUser` returned null).
 *                    Body: `{ ok: false, reason: "unauthenticated" }`.
 *   - `403`        — resolver denied. Body: `{ ok: false, reason:
 *                    access.reason }` (`actor_not_found` | `forbidden`).
 *   - `409`        — slug_taken (DB unique constraint).
 *   - `500`        — use case threw (programmer error / DB
 *                    disconnected).
 *
 * All responses include `Cache-Control: no-store` because
 * creator-side mutations must not be cached.
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { createProductDraft } from "@/domains/catalog/products/create-product-draft";
import type { CreateProductDraftRepository } from "@/domains/catalog/products/create-product-draft";
import { resolveCreateProductAccess } from "@/domains/creator-ops/access/resolve-create-product-access";
import type { ResolveCreateProductAccessPort } from "@/domains/creator-ops/access/resolve-create-product-access-types";
import { getServerUser } from "@/lib/supabase/get-user";

// ─── Module-level deps (route composition root) ──────────────────

/**
 * Composition root hooks for the route.
 *
 * Production wiring (server startup): `composeCreatorProductsRoute`
 * call assigns the real Prisma adapters to these slots.
 *
 * Unit test wiring: the route test calls `__setRouteDeps(...)`
 * with an in-memory stub for each port.
 *
 * Module-level singletons are intentional — Next.js App Router
 * instances the route module ONCE per worker (the Module
 * Augmentation pattern); lazy assignment at startup is
 * consistent with the rest of the codebase.
 */
let cachedAccessPort: ResolveCreateProductAccessPort | undefined;
let cachedCreateDraftRepo: CreateProductDraftRepository | undefined;

/**
 * Composition root wiring: assigns ports/repos at startup
 * (called by `src/app/api/_composition.ts` or similar). Visible
 * to integration tests so they can swap in in-memory stubs.
 */
export function __setRouteDeps(deps: {
  accessPort: ResolveCreateProductAccessPort;
  createDraftRepo: CreateProductDraftRepository;
}): void {
  cachedAccessPort = deps.accessPort;
  cachedCreateDraftRepo = deps.createDraftRepo;
}

// ─── Zod schema ──────────────────────────────────────────────────

/**
 * The ONLY fields the route accepts from the client:
 *   - `slug` — validated as a content slug (3-64 chars, kebab-case).
 *
 * `.strict()` rejects ANY additional field including
 * `creatorId`, `status`, `contentKind`, `price`, etc. The
 * route and the use case's input shape (`{ actorId, slug }`)
 * are aligned: the server-side `actorId` is sourced from
 * `getCurrentUser()` and NEVER crosses the wire boundary.
 */
const createProductPayloadSchema = z
  .object({
    slug: z
      .string()
      .min(3, "slug must be at least 3 characters")
      .max(64, "slug must be at most 64 characters")
      .regex(
        /^[a-z0-9-]+$/,
        "slug must be lowercase alphanumeric with dashes only",
      ),
  })
  .strict();

// ─── POST handler ────────────────────────────────────────────────

export async function POST(req: Request): Promise<NextResponse> {
  // ─── 0. Composition root guard ─────────────────────────────
  //
  // If the composition root hasn't wired the deps at startup,
  // the route is misconfigured — fail loudly so the operator
  // notices immediately. (In production this would be a setup
  // bug; in tests `__setRouteDeps` assigns before any POST.)
  if (!cachedAccessPort || !cachedCreateDraftRepo) {
    return NextResponse.json(
      { ok: false, reason: "route_misconfigured" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  // ─── 1. SESSION — require authenticated user ───────────────
  //
  // `getServerUser` returns the full session context: Supabase
  // auth-level `user`, the active Supabase client, and the
  // Postgres `dbUser` row (which carries our `role` and `id`
  // for the domain layer). `dbUser` is null when the request is
  // unauthenticated OR when the Postgres user row hasn't been
  // provisioned yet (auth ≠ app identity — race scenario). The
  // route never proceeds without `dbUser.id` — this is the
  // primary auth gate.
  const sessionContext = await getServerUser();
  const dbUser = sessionContext?.dbUser ?? null;
  if (!dbUser) {
    return NextResponse.json(
      { ok: false, reason: "unauthenticated" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  // ─── 2. ACCESS — resolve create-time access for this actor ─
  //
  // Distinct from `resolveCreatorProductAccess` (which gates
  // actions on EXISTING products; this one gates actions on
  // non-existent products — the create flow). Returns
  // allowed/source OR denied/reason. Map to HTTP:
  //   - allowed: continue.
  //   - actor_not_found: also 401 (defensive — should not happen
  //     after the session check above, but defense in depth).
  //   - forbidden: 403.
  const access = await resolveCreateProductAccess(
    { actorId: dbUser.id },
    { port: cachedAccessPort },
  );
  if (!access.allowed) {
    const status = access.reason === "actor_not_found" ? 401 : 403;
    return NextResponse.json(
      { ok: false, reason: access.reason },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }

  // ─── 3. PARSE — strict Zod payload validation ─────────────
  //
  // Defensive JSON parse first (a malformed JSON body crashes
  // `req.json()`). Then strict Zod with `.strict()` to reject
  // ANY extra field. The "extra field includes creatorId" case
  // surfaces as the explicit `creator_id_forbidden_in_payload`
  // reason — distinct from generic invalid_payload.
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, reason: "invalid_json" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const parsed = createProductPayloadSchema.safeParse(rawBody);
  if (!parsed.success) {
    // Distinguish "client supplied creatorId" from "any other
    // invalid_key". The TanStack/React UI uses this to surface
    // a specific error toast for the `creatorId` case (which
    // would otherwise look identical to "you typo'd a field").
    const hasCreatorId =
      typeof rawBody === "object" &&
      rawBody !== null &&
      "creatorId" in rawBody;
    return NextResponse.json(
      {
        ok: false,
        reason: hasCreatorId
          ? "creator_id_forbidden_in_payload"
          : "invalid_payload",
        error: parsed.error.format(),
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  // ─── 4. CALL USE CASE — forward actorId from session ───────
  //
  // `actorId` is the SESSION-derived actor identity — NOT
  // `parsed.data.creatorId`. The Zod schema doesn't even have a
  // `creatorId` field; the use case's input shape doesn't have
  // one either. Triple defense:
  //
  //   - Zod `.strict()` rejects `creatorId` at parse time.
  //   - Use case input type has no `creatorId` field (TS2339
  //     if anyone tries to set one).
  //   - Port adapter writes `creatorId: actorId` (literal
  //     column name sourced from the renamed `actorId` param).
  const result = await createProductDraft(
    { actorId: dbUser.id, slug: parsed.data.slug },
    { repo: cachedCreateDraftRepo },
  );

  // ─── 5. RETURN — translate discriminated union to HTTP ────
  //
  // 4 use-case outcomes × direct HTTP mapping:
  //   - `success`           → 201
  //   - `forbidden`         → 403 (defensive — primary gate
  //                           is route-level)
  //   - `invalid_slug`      → 400 with the ZodError issues for
  //                           the form (should not happen since
  //                           the route already Zod-validated
  //                           the slug, but defense in depth)
  //   - `slug_taken`        → 409 with explicit reason
  if (result.success) {
    return NextResponse.json(
      { ok: true, product: result.product },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  }

  const routeMap: Record<typeof result.reason, number> = {
    forbidden: 403,
    invalid_slug: 400,
    slug_taken: 409,
  } as const;
  const responseBody: Record<string, unknown> = { ok: false, reason: result.reason };
  if ("error" in result) {
    responseBody.error = result.error.format();
  }
  return NextResponse.json(responseBody, {
    status: routeMap[result.reason] ?? 500,
    headers: { "Cache-Control": "no-store" },
  });
}
