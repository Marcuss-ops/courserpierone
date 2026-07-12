import { NextRequest, NextResponse } from "next/server";
import { generateCourseConfig } from "@/lib/config/generate-course-config";
import { apiErrorResponse } from "@/lib/errors";
import { requireAdmin } from "@/lib/auth/require-admin";
import { withRateLimit } from "@/lib/utils/rate-limit";

export const POST = withRateLimit(async function POST(request: NextRequest) {
  try {
    const authError = await requireAdmin();
    if (authError) return authError;

    const { slug } = await request.json();
    if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });

    const config = await generateCourseConfig(slug);
    return NextResponse.json({ success: true, config });
  } catch (error) {
    return apiErrorResponse(error, "Failed to generate config");
  }
}, "AUTH");
