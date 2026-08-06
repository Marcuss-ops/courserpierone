/**
 * src/app/api/admin/creator-applications/[id]/approve/route.ts
 *
 * Phase 6 — Approve a creator application (admin only).
 */

import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/errors";
import { withRateLimit } from "@/lib/utils/rate-limit";
import { requireAdmin } from "@/domains/identity";
import { getServerUser } from "@/lib/supabase/get-user";
import { approveCreatorApplication } from "@/domains/creator-ops/onboarding/usecases/review-creator-application.usecase";
import { prismaCreatorApplicationRepository } from "@/domains/creator-ops/onboarding/adapters/prisma-creator-application-repository";
import { prismaCreatorApplicationAnalytics } from "@/domains/creator-ops/onboarding/adapters/prisma-creator-application-analytics";
import { prismaCreatorApplicationUserService } from "@/domains/creator-ops/onboarding/adapters/prisma-creator-application-user-service";

export const POST = withRateLimit(async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authError = await requireAdmin();
    if (authError) return authError;

    const { dbUser } = await getServerUser();
    if (!dbUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const application = await approveCreatorApplication(
      { applicationId: id, reviewedBy: dbUser.id },
      {
        repo: prismaCreatorApplicationRepository,
        analytics: prismaCreatorApplicationAnalytics,
        userService: prismaCreatorApplicationUserService,
      },
    );

    return NextResponse.json({ success: true, application });
  } catch (error) {
    return apiErrorResponse(error, "Failed to approve creator application");
  }
}, "AUTH");
