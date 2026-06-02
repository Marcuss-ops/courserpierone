import { NextResponse } from "next/server";

export async function GET() {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  if (!clientKey) {
    return new NextResponse("TIKTOK_CLIENT_KEY not configured", { status: 500 });
  }

  const nextAuthUrl = process.env.NEXTAUTH_URL;
  if (!nextAuthUrl) {
    return new NextResponse("NEXTAUTH_URL not configured", { status: 500 });
  }

  const redirectUri = `${nextAuthUrl}/api/tiktok/callback`;
  const scope = "user.info.basic,user.info.profile";
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