/**
 * src/app/api/discovery/feed/route.ts
 *
 * GET /api/discovery/feed
 *
 * Thin route handler for the rule-based educational feed. Follows
 * ADR-0016: route authenticates, parses input, builds the FeedContext
 * via the repository port, calls the buildFeed UseCase, and returns
 * the JSON payload. No business logic or Prisma queries inline.
 *
 * Query params:
 *   - locale?: string  (e.g. "it", "en-us"; falls back to dbUser.preferredLocale)
 *   - country?: string (ISO 3166-1 alpha-2; falls back to x-vercel-ip-country header)
 *   - pageSize?: number (default 20, max 50)
 *   - cursor?: string  (ISO-8601 timestamp opaque cursor from previous page)
 *
 * Response:
 *   200 → { items: FeedItem[], nextCursor: string | null }
 *   401 → { error: "Unauthorized" }
 *   500 → { error, code } (via apiErrorResponse)
 */

import { NextRequest, NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/errors";
import { getServerUser } from "@/lib/supabase/get-user";
import { buildFeed } from "@/domains/discovery/feed/build-feed";
import { prismaFeedRepository } from "@/domains/discovery/feed/prisma-feed-repository";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

export async function GET(request: NextRequest) {
  try {
    const { user, dbUser } = await getServerUser();
    if (!user?.email || !dbUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const locale = searchParams.get("locale") ?? dbUser.preferredLocale ?? "en";
    const country =
      searchParams.get("country") ??
      request.headers.get("x-vercel-ip-country") ??
      null;

    const pageSizeRaw = searchParams.get("pageSize");
    const pageSizeParsed = pageSizeRaw ? Number.parseInt(pageSizeRaw, 10) : NaN;
    const pageSize =
      Number.isFinite(pageSizeParsed) && pageSizeParsed > 0
        ? Math.min(pageSizeParsed, MAX_PAGE_SIZE)
        : DEFAULT_PAGE_SIZE;

    const cursor = searchParams.get("cursor");

    const repo = prismaFeedRepository();
    const context = await repo.buildContext(dbUser.id, locale, country);

    const result = await buildFeed(repo, {
      context,
      pageSize,
      cursor,
    });

    return NextResponse.json(result);
  } catch (error) {
    return apiErrorResponse(error, "Failed to build feed");
  }
}
