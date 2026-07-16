/**
 * src/app/api/creator/onboarding/verify/route.ts
 *
 * Phase 6 — Record creator identity verification.
 */

import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/get-user";
import { apiErrorResponse } from "@/lib/errors";
import { withRateLimit } from "@/lib/utils/rate-limit";
import { verifyCreatorIdentity } from "@/domains/creator-ops/onboarding/usecases/verify-creator-identity.usecase";
import { prismaCreatorApplicationRepository } from "@/domains/creator-ops/onboarding/adapters/prisma-creator-application-repository";
import { prismaCreatorApplicationAnalytics } from "@/domains/creator-ops/onboarding/adapters/prisma-creator-application-analytics";

export const POST = withRateLimit(async function POST() {
  try {
    const { user } = await getServerUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const application = await prismaCreatorApplicationRepository.findByUserId(user.id);
    if (!application) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    const updated = await verifyCreatorIdentity(
      { applicationId: application.id },
      {
        repo: prismaCreatorApplicationRepository,
        analytics: prismaCreatorApplicationAnalytics,
      },
    );

    return NextResponse.json({ success: true, application: updated });
  } catch (error) {
    return apiErrorResponse(error, "Failed to verify creator identity");
  }
}, "AUTH");
