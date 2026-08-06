/**
 * src/app/api/admin/creator-applications/pending/route.ts
 *
 * Phase 6 — List pending creator applications (admin only).
 */

import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/errors";
import { withRateLimit } from "@/lib/utils/rate-limit";
import { requireAdmin } from "@/domains/identity";
import { prismaCreatorApplicationRepository } from "@/domains/creator-ops/onboarding/adapters/prisma-creator-application-repository";

export const GET = withRateLimit(async function GET(request: Request) {
  try {
    const authError = await requireAdmin();
    if (authError) return authError;

    const url = new URL(request.url);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? "20"), 100);
    const offset = Math.max(Number(url.searchParams.get("offset") ?? "0"), 0);

    const applications = await prismaCreatorApplicationRepository.findPending({ limit, offset });

    return NextResponse.json({ applications });
  } catch (error) {
    return apiErrorResponse(error, "Failed to fetch pending creator applications");
  }
}, "AUTH");
