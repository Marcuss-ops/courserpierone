// ─── Middleware — Thin orchestrator ────────────────────────
// Delegates to src/lib/middleware/ for:
//   - protected route checks (protected-routes.ts)
//   - locale redirect logic (locale-redirects.ts)
//   - cookie helpers (locale-cookie.ts)

import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { isKnownPath, checkProtectedAccess } from "@/lib/middleware/protected-routes";
import {
  handleFullLocale,
  handleShortLang,
  handleRootLocale,
  handleLangParam,
  handleNoPrefix,
} from "@/lib/middleware/locale-redirects";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── 1. Refresh Supabase session (cookie only) ──
  const { supabaseResponse, hasSession } = await updateSession(request);

  // ── 2. Protected route checks ──
  const accessDenied = checkProtectedAccess(request, hasSession);
  if (accessDenied) return accessDenied;

  // ── 3. Skip locale handling for known paths & /auth ──
  if (isKnownPath(pathname) || pathname.startsWith("/auth")) {
    return supabaseResponse;
  }

  // ── 4. Locale redirect cascade ──
  // NB: handleLangParam MUST run before handleRootLocale, otherwise the
  // `?lang=...` query string is ignored on "/" (the root handler returns
  // first and short-circuits the cascade).
  return (
    handleFullLocale(request, supabaseResponse) ??
    handleShortLang(request) ??
    handleLangParam(request) ??
    handleRootLocale(request, supabaseResponse) ??
    handleNoPrefix(request) ??
    supabaseResponse
  );
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|images/|courses/|sitemap.xml|robots.txt|sw.js|manifest.json|offline.html|icon-192.png|icon-512.png).*)",
  ],
};
