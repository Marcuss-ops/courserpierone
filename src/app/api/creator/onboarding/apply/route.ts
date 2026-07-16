/**
 * src/app/api/creator/onboarding/apply/route.ts
 *
 * Phase 6 — Submit external creator application.
 */

import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/get-user";
import { apiErrorResponse } from "@/lib/errors";
import { withRateLimit } from "@/lib/utils/rate-limit";
import { submitCreatorApplication } from "@/domains/creator-ops/onboarding/usecases/submit-creator-application.usecase";
import { prismaCreatorApplicationRepository } from "@/domains/creator-ops/onboarding/adapters/prisma-creator-application-repository";
import { prismaCreatorApplicationAnalytics } from "@/domains/creator-ops/onboarding/adapters/prisma-creator-application-analytics";

export const POST = withRateLimit(async function POST() {
  try {
    const { user } = await getServerUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await submitCreatorApplication(
      { userId: user.id },
      {
        repo: prismaCreatorApplicationRepository,
        analytics: prismaCreatorApplicationAnalytics,
      },
    );

    return NextResponse.json({ success: true, application: result.application, created: result.created });
  } catch (error) {
    return apiErrorResponse(error, "Failed to submit creator application");
  }
}, "AUTH");
