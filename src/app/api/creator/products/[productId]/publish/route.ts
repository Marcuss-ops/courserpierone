/**
 * src/app/api/creator/products/[productId]/publish/route.ts
 *
 * Next.js App Router route handler —
 * `POST /api/creator/products/[productId]/publish`.
 *
 * Wraps the existing `publishContentProduct` use case with:
 *   1. Session authentication (`getServerUser`).
 *   2. Product-scoped access resolver
 *      (`resolveCreatorProductAccess({ requiredAction: "publish" })`)
 *      — gates the actor against admin/owner/approved_creator
 *      sources.
 *   3. NO payload validation (the publish endpoint is body-less:
 *      a "go-live" trigger, not a data writer). The route reads
 *      `[productId]` from the URL only.
 *   4. **Admin bypass OR strict-owner enforcement**: when the
 *      resolver returns `source: "admin"`, the route forwards
 *      `bypassOwnership: true` to the use case so the use
 *      case's inline owner check is skipped. Otherwise
 *      (owner, approved_creator) the route forwards `false`
 *      for strict inline enforcement.
 *   5. The 7-branch discriminated union outcome mapped to
 *      status codes: 200 / 403 / 404 / 409 / 422.
 *
 * ─── Architecture per ADR-0016 §1 ──────────────────────────────
 *
 * Route = thin composition root. Domain rule lives in
 * `publishContentProduct`. The route:
 *   - Calls session middleware (auth gate).
 *   - Calls the access resolver (auth policy).
 *   - Routes the `source` field to `bypassOwnership`.
 *   - Delegates to the use case (domain rule).
 *   - Translates the 7-branch outcome to HTTP.
 *
 * ─── The `bypassOwnership` flag-wiring rule ────────────────────
 *
 * The publish use case introduces `bypassOwnership?: boolean`
 * (commit a312d84's rationale: admin publishing any product
 * requires a route-layer escape; the domain rule stays strict
 * by default for defense-in-depth). The use case body checks:
 *
 *   ```
 *   if (!input.bypassOwnership &&
 *       productCtx.creatorId !== input.actorId) return forbidden;
 *   ```
 *
 * The route sets the flag EXCLUSIVELY when the access resolver
 * returned `source: "admin"` — the SSOT signal that this actor
 * is an admin publishing on behalf (the resolver already
 * validated that the actor IS an admin at that level). Owner
 * and approved_creator paths forward `bypassOwnership: false`
 * so the use case's inline check stays strict — defense in
 * depth: even if the route layer incorrectly classifies the
 * actor, the use case still vetoes non-owner non-flag.
 *
 * ─── HTTP status code mapping ─────────────────────────────────
 *
 *   - 200  — success (`success: true`). Idempotent retry also
 *            returns 200 with `reason: "already_published"`
 *            (carrying the EXISTING `publishedAt` — never
 *            re-written — for audit).
 *   - 401  — no session OR resolver `actor_not_found` (defensive).
 *   - 403  — resolver `forbidden` OR use case `forbidden`.
 *   - 404  — resolver `product_not_found` OR use case
 *            `not_found` (defensive — usually caught by the
 *            resolver).
 *   - 409  — `archived_status` (product was archived after
 *            publish; cannot re-publish without unarchive).
 *   - 422  — `gate_failed` (with `issues[]` echoed) OR
 *            `no_pages` (special-cased; surfaces a "add a page
 *            first" message at the editor UI without an empty
 *            issues list).
 *
 * All responses include `Cache-Control: no-store` because
 * creator-side mutations must not be cached.
 */

import { NextResponse } from "next/server";

import { publishContentProduct } from "@/domains/catalog/content-pages/publish-content-product";
import type {
  PublishContentProductPort,
} from "@/domains/catalog/content-pages/publish-content-product-types";
import { resolveCreatorProductAccess } from "@/domains/creator-ops/access/resolve-creator-product-access";
import type {
  ResolveCreatorProductAccessPort,
} from "@/domains/creator-ops/access/resolve-creator-product-access-types";
import { getServerUser } from "@/lib/supabase/get-user";

// ─── Module-level deps (route composition root) ─────────────────

/**
 * Composition root: assigns ports at startup. The
 * `__setRouteDeps` indirection enables in-memory stub wiring
 * in unit tests without restructuring the route module.
 */
let cachedAccessPort: ResolveCreatorProductAccessPort | undefined;
let cachedPublishPort: PublishContentProductPort | undefined;

/**
 * Visible to integration tests. Production wiring (server
 * startup) assigns the real Prisma adapters.
 */
export function __setRouteDeps(deps: {
  accessPort: ResolveCreatorProductAccessPort;
  publishPort: PublishContentProductPort;
}): void {
  cachedAccessPort = deps.accessPort;
  cachedPublishPort = deps.publishPort;
}

// ─── POST handler ───────────────────────────────────────────────

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ productId: string }> },
): Promise<NextResponse> {
  // ─── 0. Misconfig guard ──────────────────────────────────────
  if (!cachedAccessPort || !cachedPublishPort) {
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

  // ─── 2. ACCESS (requiredAction: "publish") ───────────────────
  const { productId } = await ctx.params;
  const access = await resolveCreatorProductAccess(
    { actorId: dbUser.id, productId, requiredAction: "publish" },
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

  // ─── 3. BYPASS OWNERSHIP FLAG ────────────────────────────────
  // The flag is set EXCLUSIVELY when the resolver returned
  // source="admin" — the SSOT signal that the actor's admin
  // role was just validated server-side. Owner and
  // approved_creator paths forward false (strict inline check
  // in the use case).
  const bypassOwnership = access.source === "admin";

  // ─── 4. CALL USE CASE — publish gate + transition + cache ───
  const result = await publishContentProduct(
    { actorId: dbUser.id, productId, bypassOwnership },
    { port: cachedPublishPort },
  );

  // ─── 5. RETURN — translate 7-branch discriminated union ─────
  if (result.success) {
    return NextResponse.json(
      {
        ok: true,
        productId: result.productId,
        slug: result.slug,
        publishedAt: result.publishedAt,
        revalidated: result.revalidated,
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
    case "archived_status":
      return NextResponse.json(
        { ok: false, reason: "archived_status" },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    case "already_published":
      // Idempotent retry — same 200 status code so the client
      // doesn't need to know the difference; the body's
      // `reason` does the discrimination.
      return NextResponse.json(
        {
          ok: true,
          reason: "already_published",
          publishedAt: result.publishedAt,
        },
        { status: 200, headers: { "Cache-Control": "no-store" } },
      );
    case "no_pages":
      return NextResponse.json(
        { ok: false, reason: "no_pages", productId: result.productId },
        { status: 422, headers: { "Cache-Control": "no-store" } },
      );
    case "gate_failed":
      return NextResponse.json(
        {
          ok: false,
          reason: "gate_failed",
          issues: result.issues,
        },
        { status: 422, headers: { "Cache-Control": "no-store" } },
      );
  }
}
