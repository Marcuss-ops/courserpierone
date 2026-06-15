import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
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
  "/robots.txt", "/privacy", "/terms",
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
export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl;
    const token = req.nextauth.token;

    // ── Admin routes: require admin role ──
    if (pathname.startsWith("/admin")) {
      if (token?.role !== "admin") {
        const loginUrl = new URL("/login", req.url);
        loginUrl.searchParams.set("callbackUrl", pathname);
        return NextResponse.redirect(loginUrl);
      }
    }

    // ── Protected API routes: require admin ──
    if (pathname.startsWith("/api/translate") ||
        pathname.startsWith("/api/config") ||
        pathname.startsWith("/api/upload")) {
      if (token?.role !== "admin") {
        return NextResponse.json(
          { error: "Unauthorized — admin access required" },
          { status: 403 }
        );
      }
    }

    const response = NextResponse.next();

    // ── Skip locale handling for known paths ──
    if (isKnownPath(pathname)) {
      return response;
    }

    const firstSegment = pathname.split("/")[1]?.toLowerCase() ?? "";
    const cookieLocale = req.cookies.get("locale")?.value;

    // ─── Case 1: First segment is a full locale (fr-fr, pt-br) ──
    if (firstSegment && isKnownLocale(firstSegment) && firstSegment.includes("-")) {
      // Bare locale path (e.g., /fr-fr without product) — redirect to /
      if (pathname === `/${firstSegment}` || pathname === `/${firstSegment}/`) {
        const redirect = NextResponse.redirect(new URL("/", req.url));
        setLocaleCookie(redirect, firstSegment);
        return redirect;
      }
      // Valid locale with product slug — just ensure cookie is set
      setLocaleCookie(response, firstSegment);
      return response;
    }

    // ─── Case 2: First segment is a 2-letter language code (fr, de) ──
    // Redirect to the full locale (fr → fr-fr)
    if (firstSegment && isKnownLocale(firstSegment) && firstSegment.length === 2) {
      const targetLocale = LANG_TO_DEFAULT_LOCALE[firstSegment] ?? `${firstSegment}-${firstSegment}`;
      const restPath = pathname.slice(firstSegment.length + 1) || "";
      const url = req.nextUrl.clone();
      url.pathname = `/${targetLocale}${restPath}`;

      const redirect = NextResponse.redirect(url);
      setLocaleCookie(redirect, targetLocale);
      return redirect;
    }

    // ─── Case 3: Root path "/" — detect and set cookie, no redirect ──
    if (pathname === "/") {
      const result = resolveLocale({
        cookieLocale,
        acceptLanguage: req.headers.get("accept-language"),
        ipCountry: req.headers.get("x-vercel-ip-country"),
      });
      setLocaleCookie(response, result.selectedLocale);
      return response;
    }

    // ─── Case 4: ?lang= parameter ──
    const langParam = req.nextUrl.searchParams.get("lang");
    if (langParam) {
      const normalized = normalizeLocale(langParam);
      const url = req.nextUrl.clone();
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

    // ─── Case 5: Non-prefixed path (e.g. /amish-secrets) — detect and redirect ──
    if (!firstSegment || !isKnownLocale(firstSegment)) {
      const result = resolveLocale({
        cookieLocale,
        acceptLanguage: req.headers.get("accept-language"),
        ipCountry: req.headers.get("x-vercel-ip-country"),
      });

      const url = req.nextUrl.clone();
      url.pathname = `/${result.selectedLocale}${pathname}`;
      const redirect = NextResponse.redirect(url);
      setLocaleCookie(redirect, result.selectedLocale);
      return redirect;
    }

    // ─── Case 6: Product sub-path without locale (e.g. /amish-secrets/portal) ──
    // This handles cases where the first segment looks like a product slug
    // but the path contains a known sub-path like /portal, /download, etc.
    if (isProductSubPath(pathname)) {
      const result = resolveLocale({
        cookieLocale,
        acceptLanguage: req.headers.get("accept-language"),
        ipCountry: req.headers.get("x-vercel-ip-country"),
      });

      const url = req.nextUrl.clone();
      url.pathname = `/${result.selectedLocale}${pathname}`;
      const redirect = NextResponse.redirect(url);
      setLocaleCookie(redirect, result.selectedLocale);
      return redirect;
    }

    return response;
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const { pathname } = req.nextUrl;

        // Known paths: skip auth
        if (isKnownPath(pathname)) return true;

        // Paths with locale/language prefix
        if (/^\/[a-z]{2,5}(-[a-z]{2,5})?(\/.*)?$/.test(pathname)) {
          if (pathname.startsWith("/admin")) {
            return !!token && token.role === "admin";
          }
          return true;
        }

        // Non-prefixed paths — middleware will redirect
        return true;
      },
    },
    secret: process.env.NEXTAUTH_SECRET,
  }
);

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|images/|courses/|sitemap.xml|robots.txt).*)",
  ],
};
