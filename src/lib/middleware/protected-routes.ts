// ─── Protected Routes — Path matching & access checks ─────

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getFreeCourseSlugs } from "@/lib/env";
import {
  evaluateAccess,
  type AccessPolicy,
  type AccessContext,
} from "@/lib/access/policies";

// IMPORTANT: This middleware runs in Vercel Edge runtime. Free-course
// slug lookups use `getFreeCourseSlugs()` from src/lib/env.ts — the single
// source of truth for parsed `NEXT_PUBLIC_FREE_COURSE_SLUGS` (replaces
// the historical edge/node duplication, see commit history: 4 prior
// patches on this var alone). Because the underlying env var has the
// `NEXT_PUBLIC_` prefix, Webpack statically replaces it at build time
// even in Edge, so this works without runtime env lookups.
// See https://nextjs.org/docs/app/building-your-application/optimizing/package-bundling#middleware

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
  // Must catch both exact matches (`/download`) AND nested paths
  // (`/curso/lesson-1`). Using only `endsWith` would let lesson pages
  // (`/curso/...`) bypass the middleware entirely, which is a security
  // hole: unauthenticated users could view lessons without going
  // through the free course bypass or the AccessGate.
  return PRODUCT_SUB_PATHS.some(
    (p) => pathname === p || pathname.endsWith(p) || pathname.includes(`${p}/`)
  );
}

// ─── Free course bypass (slug-only, no DB call) ────────────
// The middleware runs on every request — a DB call here would be
// expensive. We use a slug-only check (no price verification) and
// rely on the AccessGate + API handlers for the full defense-in-depth
// (both use the isFreeCourse helper which checks price === 0).
// A product with a matching slug but non-zero price would pass the
// middleware check but still be denied at the page/API level.
// Edge-bound consumer of `getFreeCourseSlugs()` (the typed accessor
// from src/lib/env.ts). Webpack statically replaces the NEXT_PUBLIC_
// env literal in env.ts at build time, so this function works in Edge
// without runtime env lookups.
function isFreeCourseSlug(slug: string): boolean {
  return getFreeCourseSlugs().includes(slug);
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
 *
 * Step 8 — replaced the inline if-cascade with the typed
 * AccessPolicy discriminated-union evaluator. The Edge context
 * (no DB) is built from the already-known `hasSession` flag +
 * `isFreeCourseSlug` boolean (slug extracted from the URL).
 *
 * Edge-portable policies only: `free_course` + `session_required`.
 * `requiresDb: true` policies (admin_role / owned_grant /
 * pending_order) live in Node runtime — the RSC AccessGate
 * (`src/components/course/access-gate.tsx`) and the API
 * require-admin (`src/lib/auth/require-admin.ts`) cover those.
 *
 * Status-code semantics preserved bit-for-bit:
 *   - /api/{translate,config,upload} → 403 with the original
 *     "Unauthorized — admin access required" message (matches the
 *     pre-Step-8 implementation; intentionally conflates 401 vs 403
 *     for missing session on admin-only routes — the route scan is
 *     session-presence-only, not role-aware).
 *   - Page routes → /login redirect with callbackUrl
 */
export function checkProtectedAccess(
  request: NextRequest,
  hasSession: boolean,
): NextResponse | null {
  const { pathname } = request.nextUrl;

  // Build the Edge-portable AccessContext (no DB lookup).
  const slug = extractSlugFromPath(pathname);
  const ctx: AccessContext = {
    pathname,
    hasSession,
    isFreeCourseSlug: !!slug && isFreeCourseSlug(slug),
  };

  // Build the Edge-portable policy chain. The order matters:
  //   - For product sub-paths: free_course FIRST (no session needed
  //     for free courses), then session_required as fallback.
  //   - For admin/dashboard/api/admin-only: only session_required.
  // Routes that don't match any classification: no policy → return
  // null = allow.
  const policies: AccessPolicy[] = [];

  if (
    pathname === "/dashboard" ||
    pathname.startsWith("/dashboard/")
  ) {
    policies.push({ kind: "session_required" });
  } else if (
    pathname === "/admin" ||
    pathname.startsWith("/admin/")
  ) {
    policies.push({ kind: "session_required" });
  } else if (/^\/[^/]+\/admin(\/.*)?$/.test(pathname)) {
    // Locale-prefixed admin route (e.g. /it-it/admin, /en-us/admin/teams)
    policies.push({ kind: "session_required" });
  } else if (isProductSubPath(pathname)) {
    // /portal, /download, /curso + locale-prefixed variants. Free
    // course bypass runs FIRST so the session check is skipped when
    // the slug is in NEXT_PUBLIC_FREE_COURSE_SLUGS. The slug's price
    // check happens server-side in isFreeCourse() via the RSC
    // AccessGate for defense-in-depth.
    policies.push({ kind: "free_course" });
    policies.push({ kind: "session_required" });
  } else if (
    pathname.startsWith("/api/translate") ||
    pathname.startsWith("/api/config") ||
    pathname.startsWith("/api/upload")
  ) {
    policies.push({ kind: "session_required" });
  }

  if (policies.length === 0) return null;

  const decision = evaluateAccess(policies, ctx);
  if (decision.action === "allow") return null;

  // Map deny → NextResponse (status codes preserved per route class).
  // Admin-only API routes: 403 (preserve the in-tree conflation of
  // missing-session vs forbidden; future improvement — V2 could
  // route this through `requireAdmin` and split 401 vs 403).
  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "Unauthorized — admin access required" },
      { status: 403 },
    );
  }

  // Page routes → /login redirect with callbackUrl.
  return redirectToLogin(request);
}

// ─── Helpers ───────────────────────────────────────────────

function redirectToLogin(request: NextRequest): NextResponse {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("callbackUrl", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}
