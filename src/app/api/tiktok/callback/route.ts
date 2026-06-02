import { NextRequest, NextResponse } from "next/server";

const TIKTOK_TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY!;
const CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET!;
const NEXTAUTH_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
const REDIRECT_URI = `${NEXTAUTH_URL}/api/tiktok/callback`;

export async function GET(req: NextRequest) {
  if (!process.env.NEXTAUTH_URL) {
    return NextResponse.json({ error: "NEXTAUTH_URL not configured" }, { status: 500 });
  }

  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(
      new URL(`/login?error=tiktok_auth_failed&reason=${error ?? "no_code"}`, req.url)
    );
  }

  try {
    const tokenRes = await fetch(TIKTOK_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_key: CLIENT_KEY,
        client_secret: CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: REDIRECT_URI,
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || tokenData.access_token) {
      // Store in cookies (httpOnly, secure)
      const response = NextResponse.redirect(new URL("/dashboard", req.url));
      response.cookies.set("tiktok_access_token", tokenData.access_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: tokenData.expires_in ?? 3600,
        path: "/",
      });
      response.cookies.set("tiktok_open_id", tokenData.open_id ?? "", {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        maxAge: tokenData.expires_in ?? 3600,
        path: "/",
      });
      return response;
    }

    throw new Error(tokenData.error_description ?? "Token exchange failed");
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    return NextResponse.redirect(
      new URL(`/login?error=tiktok_token_failed&reason=${encodeURIComponent(msg)}`, req.url)
    );
  }
}