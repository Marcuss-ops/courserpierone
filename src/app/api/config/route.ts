import { NextRequest, NextResponse } from "next/server";
import { generateCourseConfig } from "@/lib/generate-course-config";

export async function POST(request: NextRequest) {
  try {
    const { slug } = await request.json();
    if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });

    const config = await generateCourseConfig(slug);
    return NextResponse.json({ success: true, config });
  } catch (error) {
    console.error("POST /api/config error:", error);
    return NextResponse.json({ error: "Failed to generate config" }, { status: 500 });
  }
}
