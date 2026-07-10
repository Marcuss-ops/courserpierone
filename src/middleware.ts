// ─── Middleware — Thin orchestrator ────────────────────────
// Delegates to src/lib/middleware/ for:
//   - protected route checks (protected-routes.ts)
//   - locale redirect logic (locale-redirects.ts)
//   - cookie helpers (locale-cookie.ts)

import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { isKnownPath, isProductSubPath, checkProtectedAccess } from "@/lib/middleware/protected-routes";
import {
  handleFullLocale,
  handleShortLang,
  handleRootLocale,
  handleLangParam,
  handleNoPrefix,
  handleProductSubPathLocale,
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
  return (
    handleFullLocale(request, supabaseResponse) ??
    handleShortLang(request) ??
    handleRootLocale(request, supabaseResponse) ??
    handleLangParam(request) ??
    handleNoPrefix(request) ??
    handleProductSubPathLocale(request) ??
    supabaseResponse
  );
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|images/|courses/|sitemap.xml|robots.txt).*)",
  ],
};
