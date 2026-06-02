import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const token = req.cookies.get("tiktok_access_token")?.value;
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const videoFile = formData.get("video") as File | null;
    const title = (formData.get("title") as string) ?? "My video";
    const privacyLevel = (formData.get("privacy_level") as string) ?? "";
    const allowComment = formData.get("allow_comment") === "true";
    const allowDuet = formData.get("allow_duet") === "true";
    const allowShare = formData.get("allow_share") === "true";

    if (!videoFile) {
      return NextResponse.json({ error: "No video file provided" }, { status: 400 });
    }
    if (!privacyLevel) {
      return NextResponse.json({ error: "Privacy level required" }, { status: 400 });
    }

    // Step 1: Initialize upload
    const initRes = await fetch("https://open.tiktokapis.com/v2/post/publish/video/init/", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title,
        privacy_level: privacyLevel,
        allow_comment: allowComment,
        allow_duet: allowDuet,
        allow_share: allowShare,
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

    // Step 2: Upload video to TikTok's presigned URL
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
      return NextResponse.json(
        { error: `Upload failed: ${await uploadRes.text()}` },
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