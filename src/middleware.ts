import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import {
  resolveLocale,
  isKnownLocale,
  normalizeLocale,
  LANG_TO_DEFAULT_LOCALE,
} from "@/lib/i18n/locale-resolver";

// ─── Known non-landing paths ───────────────────
const KNOWN_PREFIXES = [
  "/_next", "/api", "/admin", "/login", "/favicon.ico",
  "/images/", "/courses/", "/debug-locale", "/sitemap.xml",
  "/robots.txt", "/privacy", "/terms", "/auth", "/dashboard",
];

function isKnownPath(pathname: string): boolean {
  return KNOWN_PREFIXES.some((p) => pathname.startsWith(p));
}

// Known sub-paths for products (without locale prefix)
const PRODUCT_SUB_PATHS = ["/portal", "/download", "/curso", "/ebook"];

function isProductSubPath(pathname: string): boolean {
  return PRODUCT_SUB_PATHS.some((p) => pathname.endsWith(p)) ||
    PRODUCT_SUB_PATHS.some((p) => pathname.includes(p + "?"));
}

// ─── Set locale cookie helper ──────────────────
function setLocaleCookie(response: NextResponse, locale: string) {
  const isProd = process.env.NODE_ENV === "production";
  response.cookies.set("locale", locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    secure: isProd,
    httpOnly: true,
  });
}

// ─── Main middleware ───────────────────────────
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Refresh Supabase session (cookie only, no getUser) ──
  const { supabaseResponse, hasSession } = await updateSession(request);

  // ── Admin routes: redirect to login if no session ──
  // La verifica del ruolo admin avviene nel layout/API route (server-side)
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    if (!hasSession) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Check /:locale/admin/* pattern
  const adminLocaleMatch = pathname.match(/^\/([a-z]{2,5}(-[a-z]{2,5})?)\/admin(\/.*)?$/);
  if (adminLocaleMatch) {
    if (!hasSession) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // ── Protected API routes: require admin role ──
  // La verifica avviene nell'API route stessa via getServerUser()
  if (pathname.startsWith("/api/translate") ||
      pathname.startsWith("/api/config") ||
      pathname.startsWith("/api/upload")) {
    if (!hasSession) {
      return NextResponse.json(
        { error: "Unauthorized — admin access required" },
        { status: 403 }
      );
    }
  }

  // ── Skip locale handling for known paths ──
  if (isKnownPath(pathname)) {
    return supabaseResponse;
  }

  // ── Skip locale handling for /auth paths (Supabase callback) ──
  if (pathname.startsWith("/auth")) {
    return supabaseResponse;
  }

  const firstSegment = pathname.split("/")[1]?.toLowerCase() ?? "";
  const cookieLocale = request.cookies.get("locale")?.value;

  // ─── Case 1: First segment is a full locale (fr-fr, pt-br) ──
  if (firstSegment && isKnownLocale(firstSegment) && firstSegment.includes("-")) {
    if (pathname === `/${firstSegment}` || pathname === `/${firstSegment}/`) {
      const redirect = NextResponse.redirect(new URL("/", request.url));
      setLocaleCookie(redirect, firstSegment);
      return redirect;
    }
    setLocaleCookie(supabaseResponse, firstSegment);
    return supabaseResponse;
  }

  // ─── Case 2: First segment is a 2-letter language code ──
  if (firstSegment && isKnownLocale(firstSegment) && firstSegment.length === 2) {
    const targetLocale = LANG_TO_DEFAULT_LOCALE[firstSegment] ?? `${firstSegment}-${firstSegment}`;
    const restPath = pathname.slice(firstSegment.length + 1) || "";
    const url = request.nextUrl.clone();
    url.pathname = `/${targetLocale}${restPath}`;
    const redirect = NextResponse.redirect(url);
    setLocaleCookie(redirect, targetLocale);
    return redirect;
  }

  // ─── Case 3: Root path "/" ──
  if (pathname === "/") {
    const result = resolveLocale({
      cookieLocale,
      acceptLanguage: request.headers.get("accept-language"),
      ipCountry: request.headers.get("x-vercel-ip-country"),
    });
    setLocaleCookie(supabaseResponse, result.selectedLocale);
    return supabaseResponse;
  }

  // ─── Case 4: ?lang= parameter ──
  const langParam = request.nextUrl.searchParams.get("lang");
  if (langParam) {
    const normalized = normalizeLocale(langParam);
    const url = request.nextUrl.clone();
    const firstSegment = pathname.split("/")[1]?.toLowerCase() ?? "";
    if (firstSegment && isKnownLocale(firstSegment)) {
      url.searchParams.delete("lang");
      const redirect = NextResponse.redirect(url);
      setLocaleCookie(redirect, normalized);
      return redirect;
    } else {
      url.pathname = `/${normalized}${pathname}`;
      url.searchParams.delete("lang");
      const redirect = NextResponse.redirect(url);
      setLocaleCookie(redirect, normalized);
      return redirect;
    }
  }

  // ─── Case 5: Non-prefixed path — detect and redirect ──
  if (!firstSegment || !isKnownLocale(firstSegment)) {
    const result = resolveLocale({
      cookieLocale,
      acceptLanguage: request.headers.get("accept-language"),
      ipCountry: request.headers.get("x-vercel-ip-country"),
    });
    const url = request.nextUrl.clone();
    url.pathname = `/${result.selectedLocale}${pathname}`;
    const redirect = NextResponse.redirect(url);
    setLocaleCookie(redirect, result.selectedLocale);
    return redirect;
  }

  // ─── Case 6: Product sub-path without locale ──
  if (isProductSubPath(pathname)) {
    const result = resolveLocale({
      cookieLocale,
      acceptLanguage: request.headers.get("accept-language"),
      ipCountry: request.headers.get("x-vercel-ip-country"),
    });
    const url = request.nextUrl.clone();
    url.pathname = `/${result.selectedLocale}${pathname}`;
    const redirect = NextResponse.redirect(url);
    setLocaleCookie(redirect, result.selectedLocale);
    return redirect;
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|images/|courses/|sitemap.xml|robots.txt).*)",
  ],
};
