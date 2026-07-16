/**
 * src/app/api/learning/watchlist/route.ts
 *
 * Phase 2 Step 3 — Watchlist endpoint. Thin route that delegates to
 * `addToWatchlist` / `removeFromWatchlist` / `listWatchlist` (use cases).
 *
 * Architecture (per ADR-0016 §1 — UI/Route → UseCase → Domain → Port → Adapter):
 *   1. Authenticate via `getServerUser()` (returns 401 if no session).
 *   2. POST/DELETE: parse JSON body, call use case, translate result.
 *      GET: read query params, call use case, return JSON.
 *   3. Return JSON response.
 *
 * Composition rules:
 *   - NO prisma import in this file (route is thin; all DB work
 *     happens inside the adapter).
 *   - NO business logic (dedupe, upsert, soft-delete) here.
 *   - Errors propagated via `apiErrorResponse` — preserves the
 *     AppError → status code translation and codes for the UI.
 *
 * Endpoints:
 *   - POST   /api/learning/watchlist
 *            body: { productId: string }
 *            → 200 { added: true, grantId, alreadyAdded }
 *            → 404 { error: "PRODUCT_NOT_FOUND" }
 *            → 401 { error: "UNAUTHENTICATED" }
 *
 *   - DELETE /api/learning/watchlist
 *            body: { productId: string }
 *            → 200 { ok: true, revoked: boolean, revokedAt: ISO|null }
 *            → 401 { error: "UNAUTHENTICATED" }
 *            (idempotent: 200 even if no active grant exists)
 *
 *   - GET    /api/learning/watchlist
 *            query: ?locale=it|en|...
 *            → 200 { items: WatchlistItem[], count: number }
 *            → 401 { error: "UNAUTHENTICATED" }
 *
 * Performance (per ADR-0016 §4):
 *   - POST:  3 round-trips (findProduct + findFirst + upsert).
 *            The 3-query cost is acceptable: POST is user-initiated
 *            (low frequency) and the pre-check enables a clean 404
 *            contract (per Q2 design validation).
 *   - DELETE: 1 round-trip (updateMany with status='active' filter).
 *   - GET:    1 round-trip (findMany with include on Product +
 *            ProductTranslation). No N+1.
 *   - No JSON.parse of arbitrary input beyond body validation.
 *
 * Cache:
 *   - All responses use `Cache-Control: no-store`. Watchlist is
 *     mutable user state; caching would surface stale data after
 *     add/remove operations. Per Q5 design validation.
 *
 * Rate limiting:
 *   - All 3 methods wrapped in `withRateLimit(handler, "AUTH")` —
 *     standard authenticated-user tier. Per Q7 design validation.
 *     A dedicated "AUTH_WRITE" tier with stricter limits is YAGNI
 *     until watchlist-spam patterns emerge.
 */

import { NextRequest, NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/errors";
import { getServerUser } from "@/lib/supabase/get-user";
import { withRateLimit } from "@/lib/utils/rate-limit";
import {
  addToWatchlist,
  removeFromWatchlist,
  listWatchlist,
  WatchlistDenialReason,
} from "@/lib/learning/watchlist";
import { prismaWatchlistRepository } from "@/lib/learning/prisma-watchlist-repository";

interface WatchlistBody {
  productId?: string;
}

// ─── POST — add product to watchlist ──────────────────────────────────

const POST_IMPL = async function POST(request: NextRequest) {
  // ── 1. Auth ────────────────────────────────────────────────
  const { dbUser } = await getServerUser();
  if (!dbUser?.id) {
    return NextResponse.json(
      { error: "UNAUTHENTICATED" },
      { status: 401 },
    );
  }

  // ── 2. Body parse + validate ───────────────────────────────
  let body: WatchlistBody;
  try {
    body = (await request.json()) as WatchlistBody;
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }
  const productId = body.productId;
  if (typeof productId !== "string" || productId.length === 0) {
    return NextResponse.json(
      { error: "MISSING_PRODUCT_ID" },
      { status: 400 },
    );
  }

  // ── 3. Delegate ────────────────────────────────────────────
  let result;
  try {
    result = await addToWatchlist(
      { userId: dbUser.id, productId },
      { repo: prismaWatchlistRepository },
    );
  } catch (err) {
    return apiErrorResponse(err, "Watchlist add failed");
  }

  // ── 4. Translate to HTTP status ────────────────────────────
  if (!result.added) {
    if (result.reason === WatchlistDenialReason.ProductNotFound) {
      return NextResponse.json(
        { error: "PRODUCT_NOT_FOUND" },
        { status: 404 },
      );
    }
    console.warn("[watchlist:POST] unexpected denial reason:", result.reason);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }

  return NextResponse.json(
    {
      added: true,
      grantId: result.grantId,
      alreadyAdded: result.alreadyAdded,
    },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
};

export const POST = withRateLimit(POST_IMPL, "AUTH");

// ─── DELETE — remove product from watchlist (soft delete) ────────────

const DELETE_IMPL = async function DELETE(request: NextRequest) {
  // ── 1. Auth ────────────────────────────────────────────────
  const { dbUser } = await getServerUser();
  if (!dbUser?.id) {
    return NextResponse.json(
      { error: "UNAUTHENTICATED" },
      { status: 401 },
    );
  }

  // ── 2. Body parse + validate ───────────────────────────────
  let body: WatchlistBody;
  try {
    body = (await request.json()) as WatchlistBody;
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }
  const productId = body.productId;
  if (typeof productId !== "string" || productId.length === 0) {
    return NextResponse.json(
      { error: "MISSING_PRODUCT_ID" },
      { status: 400 },
    );
  }

  // ── 3. Delegate ────────────────────────────────────────────
  // DELETE is idempotent — returns 200 even if no active grant exists.
  // The `revoked` boolean in the response distinguishes "actually
  // deleted" from "already deleted / never added" so the UI can
  // optionally show a "removed" toast only when a real delete happened.
  let result;
  try {
    result = await removeFromWatchlist(
      { userId: dbUser.id, productId },
      { repo: prismaWatchlistRepository },
    );
  } catch (err) {
    return apiErrorResponse(err, "Watchlist remove failed");
  }

  return NextResponse.json(
    {
      ok: true,
      revoked: result.revoked,
      revokedAt: result.revokedAt ? result.revokedAt.toISOString() : null,
    },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
};

export const DELETE = withRateLimit(DELETE_IMPL, "AUTH");

// ─── GET — list active watchlist entries ──────────────────────────────

const GET_IMPL = async function GET(request: NextRequest) {
  // ── 1. Auth ────────────────────────────────────────────────
  const { dbUser } = await getServerUser();
  if (!dbUser?.id) {
    return NextResponse.json(
      { error: "UNAUTHENTICATED" },
      { status: 401 },
    );
  }

  // ── 2. Query params (optional locale) ──────────────────────
  const { searchParams } = request.nextUrl;
  const locale = searchParams.get("locale") ?? undefined;

  // ── 3. Delegate ────────────────────────────────────────────
  let result;
  try {
    result = await listWatchlist(
      { userId: dbUser.id, locale },
      { repo: prismaWatchlistRepository },
    );
  } catch (err) {
    return apiErrorResponse(err, "Watchlist list failed");
  }

  return NextResponse.json(
    {
      items: result.items,
      count: result.count,
    },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
};

export const GET = withRateLimit(GET_IMPL, "AUTH");