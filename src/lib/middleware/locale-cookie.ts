// ─── Locale Cookie Helper ──────────────────────────────────

import type { NextResponse } from "next/server";

/**
 * Sets the `locale` cookie on the response.
 * Used across all locale redirect cases.
 */
export function setLocaleCookie(
  response: NextResponse,
  locale: string,
): void {
  const isProd = process.env.NODE_ENV === "production";
  response.cookies.set("locale", locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    secure: isProd,
    httpOnly: true,
  });
}
