/**
 * src/app/api/creator/onboarding/status/route.ts
 *
 * Phase 6 — Get current user's creator application status.
 */

import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/get-user";
import { apiErrorResponse } from "@/lib/errors";
import { withRateLimit } from "@/lib/utils/rate-limit";
import { prismaCreatorApplicationRepository } from "@/domains/creator-ops/onboarding/adapters/prisma-creator-application-repository";

export const GET = withRateLimit(async function GET() {
  try {
    const { user } = await getServerUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const application = await prismaCreatorApplicationRepository.findByUserId(user.id);

    return NextResponse.json({ application });
  } catch (error) {
    return apiErrorResponse(error, "Failed to fetch creator application status");
  }
}, "AUTH");
