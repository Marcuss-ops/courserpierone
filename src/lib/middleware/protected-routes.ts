// ─── Protected Routes — Path matching & access checks ─────

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";

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

// ─── Free course bypass (slug-only, no DB call) ────────────
// The middleware runs on every request — a DB call here would be
// expensive. We use a slug-only check (no price verification) and
// rely on the AccessGate + API handlers for the full defense-in-depth
// (both use the isFreeCourse helper which checks price === 0).
// A product with a matching slug but non-zero price would pass the
// middleware check but still be denied at the page/API level.
function isFreeCourseSlug(slug: string): boolean {
  const freeSlugs = (env.FREE_COURSE_SLUGS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return freeSlugs.includes(slug);
}

// Extract the course slug from product sub-paths.
// Matches: /<locale>/<slug>/portal, /<slug>/download, /<slug>/curso
// And:     /api/ebook/<slug>/download
// Returns null if the path doesn't match a known product sub-path pattern.
function extractSlugFromPath(pathname: string): string | null {
  // Page sub-paths: /<locale>/<slug>/(portal|download|curso)...
  // Locale can be 2-5 chars (e.g., "en", "en-us", "pt-br").
  const pageMatch = /^\/[^/]+\/([^/]+)\/(?:portal|download|curso)(\/|$)/.exec(pathname);
  if (pageMatch) return pageMatch[1];
  // API route: /api/ebook/<slug>/download
  const apiMatch = /^\/api\/ebook\/([^/]+)\/download$/.exec(pathname);
  if (apiMatch) return apiMatch[1];
  return null;
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

  // ── Product sub-paths (require auth, EXCEPT free courses) ──
  if (isProductSubPath(pathname) && !hasSession) {
    // Free course bypass: extract the slug from the path and check if
    // it's in FREE_COURSE_SLUGS. The full defense-in-depth check (slug
    // + price === 0) happens in the AccessGate + API handlers via the
    // isFreeCourse helper — see src/lib/courses/is-free-course.ts.
    const slug = extractSlugFromPath(pathname);
    if (!slug || !isFreeCourseSlug(slug)) {
      return redirectToLogin(request);
    }
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
