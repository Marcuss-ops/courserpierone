/**
 * src/app/api/admin/creator-applications/[id]/reject/route.ts
 *
 * Phase 6 — Reject a creator application (admin only).
 */

import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/errors";
import { withRateLimit } from "@/lib/utils/rate-limit";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getServerUser } from "@/lib/supabase/get-user";
import { rejectCreatorApplication } from "@/domains/creator-ops/onboarding/usecases/review-creator-application.usecase";
import { prismaCreatorApplicationRepository } from "@/domains/creator-ops/onboarding/adapters/prisma-creator-application-repository";
import { prismaCreatorApplicationAnalytics } from "@/domains/creator-ops/onboarding/adapters/prisma-creator-application-analytics";
import { prismaCreatorApplicationUserService } from "@/domains/creator-ops/onboarding/adapters/prisma-creator-application-user-service";

export const POST = withRateLimit(async function POST(
  request: Request,
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
    const body = await request.json();
    const reason = typeof body.reason === "string" ? body.reason : "Application rejected";

    const application = await rejectCreatorApplication(
      { applicationId: id, reviewedBy: dbUser.id, rejectionReason: reason },
      {
        repo: prismaCreatorApplicationRepository,
        analytics: prismaCreatorApplicationAnalytics,
        userService: prismaCreatorApplicationUserService,
      },
    );

    return NextResponse.json({ success: true, application });
  } catch (error) {
    return apiErrorResponse(error, "Failed to reject creator application");
  }
}, "AUTH");
