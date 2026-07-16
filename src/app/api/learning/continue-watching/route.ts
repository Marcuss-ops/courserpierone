/**
 * src/app/api/learning/continue-watching/route.ts
 *
 * Phase 2 Step 2 — Continue Watching endpoint. Thin GET route
 * that delegates to `buildContinueWatchingHistory` (use case).
 *
 * Architecture (per ADR-0016 §1 — UI/Route → UseCase → Domain → Port → Adapter):
 *   1. Authenticate via `getServerUser()` (returns 401 if no session).
 *   2. Parse optional `locale` + `limit` query params with defensive
 *      clamping (limit must be a finite positive integer).
 *   3. Call `buildContinueWatchingHistory({...}, { repo: prismaContinueWatchingRepository })`.
 *   4. Return JSON `{ items: ContinueWatchingItem[] }` shape.
 *
 * Composition rules:
 *   - NO prisma import in this file (route is thin; all DB work
 *     happens inside the adapter).
 *   - NO business logic (dedupe, ranking, locale fallback) here.
 *   - Errors propagated via `apiErrorResponse` — preserves the
 *     AppError → status code translation and codes for the UI.
 *
 * Response shape (canonical contract for the dashboard widget):
 *   {
 *     items: Array<{
 *       product: { id, slug, coverUrl, title },
 *       lesson:  { id, position, title, videoUrl },
 *       lastWatchedAt: ISO-8601 string,
 *     }>
 *   }
 *
 * Performance (per ADR-0016 §4):
 *   - 1 round-trip aggregate inside the adapter.
 *   - No JSON.parse of arbitrary input.
 *   - Returned Date is serialized to ISO-8601 by NextResponse.json.
 */

import { NextRequest, NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/errors";
import { getServerUser } from "@/lib/supabase/get-user";
import { buildContinueWatchingHistory } from "@/lib/learning/continue-watching";
import { prismaContinueWatchingRepository } from "@/lib/learning/prisma-continue-watching-repository";

/**
 * GET /api/learning/continue-watching
 *
 * Query params:
 *   - locale?: string  (e.g., "it", "en", "fr-fr")
 *   - limit?:  number  (default 5, clamped to MAX 10)
 *   - cursor?: string  (ISO-8601 timestamp; opaque cursor from a previous
 *                       page's `nextCursor`. Invalid input is silently
 *                       treated as null — matches the `limit` fallback
 *                       pattern, keeps the UI moving forward.)
 *
 * Responses:
 *   - 200 → { items: ContinueWatchingItem[], nextCursor: string | null }
 *            (nextCursor non-null iff items.length === limit)
 *   - 401 → { error: "Unauthorized" }     (no session)
 *   - 500 → { error, code }                (via apiErrorResponse)
 */
export async function GET(request: NextRequest) {
  try {
    const { user, dbUser } = await getServerUser();
    if (!user?.email || !dbUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const locale = searchParams.get("locale") ?? undefined;
    const limitStr = searchParams.get("limit");
    const rawLimit = limitStr ? Number.parseInt(limitStr, 10) : undefined;
    const limit =
      typeof rawLimit === "number" && Number.isFinite(rawLimit)
        ? rawLimit
        : undefined;
    const cursor = searchParams.get("cursor") ?? undefined;

    const { items, nextCursor } = await buildContinueWatchingHistory(
      { userId: dbUser.id, locale, limit, cursor },
      { repo: prismaContinueWatchingRepository },
    );

    // Browser-only cache:
    //   - First-page responses (no cursor): 30s private cache avoids
    //     re-hitting Prisma on every dashboard re-render.
    //   - Paginated responses (?cursor=...): 5s only — progress updates
    //     between pages should appear quickly, not after 30s.
    //   - Dev: no-store always (route should be testable without cache).
    // Vercel CDN will not cache per-user responses (uses Authorization/
    // cookies), so the browser cache is the only effective layer.
    const cacheControl =
      process.env.NODE_ENV !== "production"
        ? "no-store"
        : cursor
          ? "private, max-age=5"
          : "private, max-age=30";

    return NextResponse.json(
      {
        items: items.map((item) => ({
          product: item.product,
          lesson: item.lesson,
          lastWatchedAt: item.lastWatchedAt.toISOString(),
        })),
        nextCursor,
      },
      { headers: { "Cache-Control": cacheControl } },
    );
  } catch (error) {
    return apiErrorResponse(error, "Failed to fetch continue watching");
  }
}
