import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  if (!clientKey || !clientSecret) {
    return NextResponse.json({ error: "TikTok credentials not configured" }, { status: 500 });
  }

  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(
      new URL(`/?error=tiktok_auth_failed&reason=${error ?? "no_code"}`, req.url)
    );
  }

  const host = req.headers.get("host") || "uploader.courssy.com";
  const protocol = host.includes("localhost") ? "http" : "https";
  const redirectUri = `${protocol}://${host}/api/tiktok/callback`;

  try {
    const tokenRes = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || !tokenData.access_token) {
      throw new Error(tokenData.error_description ?? "Token exchange failed");
    }

    const response = NextResponse.redirect(new URL("/?success=logged_in", req.url));
    response.cookies.set("tiktok_access_token", tokenData.access_token, {
      httpOnly: true,
      secure: true,
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
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    return NextResponse.redirect(
      new URL(`/?error=tiktok_token_failed&reason=${encodeURIComponent(msg)}`, req.url)
    );
  }
}