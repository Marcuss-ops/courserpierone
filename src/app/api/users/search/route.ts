import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getServerUser } from "@/lib/supabase/get-user";
import { withRateLimit } from "@/lib/utils/rate-limit";
import { apiErrorResponse } from "@/lib/errors";

/**
 * GET /api/users/search?q=<query>&limit=10
 *
 * Searches users by name, username, or email prefix.
 * Only returns public fields. Excludes the authenticated user from results.
 * Minimum query length: 2 characters.
 */
export const GET = withRateLimit(async function GET(request: NextRequest) {
  try {
    const { user, dbUser } = await getServerUser();
    if (!user?.email || !dbUser) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") ?? "").trim();
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "10", 10) || 10, 20);

    if (q.length < 2) {
      return NextResponse.json({ users: [] });
    }

    // Search by name, username, or email prefix (case-insensitive via Prisma `mode: 'insensitive'`)
    const users = await prisma.user.findMany({
      where: {
        id: { not: dbUser.id }, // exclude self
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { username: { contains: q, mode: "insensitive" } },
          { email: { startsWith: q, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        name: true,
        username: true,
        image: true,
        role: true,
        bio: true,
      },
      orderBy: { name: "asc" },
      take: limit,
    });

    return NextResponse.json({ users });
  } catch (error) {
    return apiErrorResponse(error, "Errore interno");
  }
}, "AUTH");
