// ─── Protected Routes — Path matching & access checks ─────

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// ─── Known non-landing paths (skip locale handling) ────────
const KNOWN_PREFIXES = [
  "/_next",
  "/api",
  "/admin",
  "/login",
  "/favicon.ico",
  "/images/",
  "/courses/",
  "/debug-locale",
  "/sitemap.xml",
  "/robots.txt",
  "/privacy",
  "/terms",
  "/auth",
  "/dashboard",
];

export function isKnownPath(pathname: string): boolean {
  return KNOWN_PREFIXES.some((p) => pathname.startsWith(p));
}

// ─── Product sub-paths (without locale prefix) ─────────────
const PRODUCT_SUB_PATHS = ["/portal", "/download", "/curso"];

function isProductSubPath(pathname: string): boolean {
  return PRODUCT_SUB_PATHS.some((p) => pathname.endsWith(p));
}

// ─── Protected route checks ────────────────────────────────

/**
 * Checks if the request targets a protected route and the user
 * has no session. Returns a redirect/403 response if access is
 * denied, or null if access is allowed.
 */
export function checkProtectedAccess(
  request: NextRequest,
  hasSession: boolean,
): NextResponse | null {
  const { pathname } = request.nextUrl;

  // ── Dashboard ──
  if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) {
    if (!hasSession) return redirectToLogin(request);
  }

  // ── Admin routes (bare) ──
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    if (!hasSession) return redirectToLogin(request);
  }

  // ── Admin routes (with locale prefix) ──
  const adminLocaleMatch = /^\/([a-z]{2,5}(-[a-z]{2,5})?)\/admin(\/.*)?$/.exec(pathname);
  if (adminLocaleMatch && !hasSession) {
    return redirectToLogin(request);
  }

  // ── Product sub-paths (require auth) ──
  if (isProductSubPath(pathname) && !hasSession) {
    return redirectToLogin(request);
  }

  // ── Protected API routes (require admin) ──
  if (
    pathname.startsWith("/api/translate") ||
    pathname.startsWith("/api/config") ||
    pathname.startsWith("/api/upload")
  ) {
    if (!hasSession) {
      return NextResponse.json(
        { error: "Unauthorized — admin access required" },
        { status: 403 },
      );
    }
  }

  return null;
}

// ─── Helpers ───────────────────────────────────────────────

function redirectToLogin(request: NextRequest): NextResponse {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("callbackUrl", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}
