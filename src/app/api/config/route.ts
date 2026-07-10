import { NextRequest, NextResponse } from "next/server";
import { generateCourseConfig } from "@/lib/config/generate-course-config";
import { apiErrorResponse } from "@/lib/errors";

export async function POST(request: NextRequest) {
  try {
    const { slug } = await request.json();
    if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });

    const config = await generateCourseConfig(slug);
    return NextResponse.json({ success: true, config });
  } catch (error) {
    return apiErrorResponse(error, "Failed to generate config");
  }
}
