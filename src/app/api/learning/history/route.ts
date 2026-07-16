/**
 * src/app/api/learning/history/route.ts
 *
 * Phase 2 — History (My Courses) endpoint. Thin GET route that
 * delegates to `buildHistory` (use case).
 *
 * Architecture (per ADR-0016 §1 — UI/Route → UseCase → Domain → Port → Adapter):
 *   1. Authenticate via `getServerUser()` (returns 401 if no session).
 *   2. Parse optional `locale` + `limit` query params.
 *   3. Call `buildHistory({...}, { repo: prismaHistoryRepository })`.
 *   4. Return JSON `{ items: HistoryItem[], count: number }`.
 *
 * Response shape:
 *   {
 *     items: Array<{ productId, slug, title, coverUrl, sourceType, grantedAt }>,
 *     count: number,
 *   }
 *
 * Cache:
 *   - All responses use `Cache-Control: no-store`. History is mutable
 *     user state (grants can be revoked). Per Q5 design validation.
 */

import { NextRequest, NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/errors";
import { getServerUser } from "@/lib/supabase/get-user";
import { buildHistory } from "@/lib/learning/history";
import { prismaHistoryRepository } from "@/lib/learning/prisma-history-repository";

/**
 * GET /api/learning/history
 *
 * Query params:
 *   - locale?: string  (e.g., "it", "en")
 *   - limit?:  number  (default 50, max 100)
 *
 * Responses:
 *   - 200 → { items: HistoryItem[], count: number }
 *   - 401 → { error: "Unauthorized" }
 *   - 500 → { error, code }
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

    const result = await buildHistory(
      { userId: dbUser.id, locale, limit },
      { repo: prismaHistoryRepository },
    );

    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiErrorResponse(error, "Failed to fetch history");
  }
}
