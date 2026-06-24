import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  if (!clientKey) {
    return new NextResponse("TIKTOK_CLIENT_KEY not configured", { status: 500 });
  }

  const host = request.headers.get("host") || "uploader.courssy.com";
  const protocol = host.includes("localhost") ? "http" : "https";
  const redirectUri = `${protocol}://${host}/api/tiktok/callback`;
  const scope = "user.info.basic,user.info.profile,user.info.stats,video.list,video.upload";
  const state = crypto.randomUUID();

  const params = new URLSearchParams({
    client_key: clientKey,
    redirect_uri: redirectUri,
    scope,
    response_type: "code",
    state,
  });

  return NextResponse.redirect(
    `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`
  );
}