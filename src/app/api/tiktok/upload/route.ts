import { NextRequest, NextResponse } from "next/server";

const TIKTOK_UPLOAD_INIT_URL = "https://open.tiktokapis.com/v2/post/publish/video/init/";
const TIKTOK_UPLOAD_URL = "https://open.tiktokapis.com/v2/post/publish/video/upload/";

export async function POST(req: NextRequest) {
  const token = req.cookies.get("tiktok_access_token")?.value;
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const videoFile = formData.get("video") as File | null;
    const title = (formData.get("title") as string) ?? "My awesome video";
    const privacyLevel = (formData.get("privacy_level") as string) ?? "SELF_ONLY";
    const allowComment = (formData.get("allow_comment") as string) ?? "false";
    const allowDuet = (formData.get("allow_duet") as string) ?? "false";
    const allowShare = (formData.get("allow_share") as string) ?? "false";

    if (!videoFile) {
      return NextResponse.json({ error: "No video file provided" }, { status: 400 });
    }

    // Step 1: Initialize upload
    const initRes = await fetch(TIKTOK_UPLOAD_INIT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title,
        privacy_level: privacyLevel,
        allow_comment: allowComment === "true",
        allow_duet: allowDuet === "true",
        allow_share: allowShare === "true",
        disable_comments: false,
      }),
    });

    const initData = await initRes.json();

    if (!initRes.ok) {
      return NextResponse.json(
        { error: initData.error?.message ?? "Upload init failed" },
        { status: initRes.status }
      );
    }

    const uploadUrl = initData.data?.upload_url;
    if (!uploadUrl) {
      // Direct post — TikTok processes immediately
      return NextResponse.json({
        success: true,
        post_id: initData.data?.post_id,
        share_url: initData.data?.share_url,
        status: "published",
      });
    }

    // Step 2: Upload video bytes to TikTok's presigned URL
    const videoBuffer = Buffer.from(await videoFile.arrayBuffer());
    const uploadRes = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(videoBuffer.byteLength),
      },
      body: videoBuffer,
    });

    if (!uploadRes.ok) {
      const errBody = await uploadRes.text();
      return NextResponse.json(
        { error: `Upload failed: ${errBody}` },
        { status: uploadRes.status }
      );
    }

    return NextResponse.json({
      success: true,
      post_id: initData.data?.post_id,
      share_url: initData.data?.share_url,
      status: "processing",
    });
  } catch (err) {
    console.error("[TikTok upload]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}