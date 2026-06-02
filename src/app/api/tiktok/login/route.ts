import { NextResponse } from "next/server";

const NEXTAUTH_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3000";

const TIKTOK_AUTH_URL = "https://www.tiktok.com/v2/auth/authorize/";
const CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY!;
const REDIRECT_URI = `${NEXTAUTH_URL}/api/tiktok/callback`;
const SCOPE = "user.info.basic,user.info.profile";

export async function GET() {
  if (!process.env.NEXTAUTH_URL) {
    return new NextResponse("NEXTAUTH_URL not configured", { status: 500 });
  }
  const params = new URLSearchParams({
    client_key: CLIENT_KEY,
    redirect_uri: REDIRECT_URI,
    scope: SCOPE,
    response_type: "code",
    state: crypto.randomUUID(),
  });

  return NextResponse.redirect(`${TIKTOK_AUTH_URL}?${params.toString()}`);
}