import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const token = req.cookies.get("tiktok_access_token")?.value;
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const res = await fetch("https://open.tiktokapis.com/v2/user/info/", {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(
        { error: data.error_description ?? "Failed to fetch user" },
        { status: res.status }
      );
    }

    const user = data.data?.user ?? {};
    return NextResponse.json({
      open_id: user.open_id,
      display_name: user.display_name ?? user.username ?? "TikTok User",
      username: user.username,
      avatar_url: user.avatar_url,
      bio: user.bio,
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}