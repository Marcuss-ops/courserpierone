import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

// ─── Supported languages ───────────────────────
const SUPPORTED_LANGUAGES = ["it", "en", "fr", "es", "de", "pt", "nl", "pl", "sv", "da", "no", "fi", "ro", "cs", "hu", "el", "ja", "ko", "zh", "ar", "hi", "tr", "th", "vi", "id", "ms", "ru"];

const DEFAULT_LANGUAGE = "en";

// ─── Country → Language mapping ────────────────
const COUNTRY_LANG: Record<string, string> = {
  IT: "it", FR: "fr", DE: "de", ES: "es", PT: "pt", BR: "pt",
  US: "en", GB: "en", CA: "en", AU: "en", NZ: "en", IE: "en",
  NL: "nl", PL: "pl", SE: "sv", DK: "da", NO: "no", FI: "fi",
  RO: "ro", CZ: "cs", HU: "hu", GR: "el",
  JP: "ja", KR: "ko", CN: "zh", TW: "zh", HK: "zh",
  AR: "ar", SA: "ar", AE: "ar", EG: "ar",
  IN: "hi", TR: "tr", TH: "th", VN: "vi", ID: "id", MY: "ms",
  RU: "ru", UA: "ru",
  CH: "de", BE: "fr", AT: "de", MX: "es", ARG: "es", CL: "es",
};

// ─── Detect language from Accept-Language ──────
function detectFromAcceptLanguage(header: string | null): string | null {
  if (!header) return null;
  for (const part of header.split(",")) {
    const lang = part.split(";")[0].trim().split("-")[0].toLowerCase();
    if (SUPPORTED_LANGUAGES.includes(lang)) return lang;
  }
  return null;
}

// ─── Detect language from country code ─────────
function detectFromCountry(country: string | null): string | null {
  if (!country) return null;
  return COUNTRY_LANG[country] ?? null;
}

// ─── Check if a path starts with known routes ──
const KNOWN_PREFIXES = [
  "/_next", "/api", "/admin", "/login", "/favicon.ico", "/images/", "/courses/", "/debug-locale", "/sitemap.xml",
];

function isKnownPath(pathname: string): boolean {
  return KNOWN_PREFIXES.some((p) => pathname.startsWith(p));
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
    if (pathname.startsWith("/api/translate") || pathname.startsWith("/api/config") || pathname.startsWith("/api/upload")) {
      if (token?.role !== "admin") {
        return NextResponse.json({ error: "Unauthorized — admin access required" }, { status: 403 });
      }
    }

    const response = NextResponse.next();

    // ── Language detection + redirect ──────
    // Only redirect root-level paths and paths NOT already starting with a language
    if (!isKnownPath(pathname)) {
      const firstSegment = pathname.split("/")[1]?.toLowerCase();

      // If the first segment is already a supported language, just set cookie
      if (firstSegment && SUPPORTED_LANGUAGES.includes(firstSegment)) {
        response.cookies.set("locale", firstSegment, {
          path: "/",
          maxAge: 60 * 60 * 24 * 365,
          sameSite: "lax",
        });
        return response;
      }

      // If there's a ?lang= param, use that
      const langParam = req.nextUrl.searchParams.get("lang");
      if (langParam && SUPPORTED_LANGUAGES.includes(langParam)) {
        // Redirect to /{lang}/{path} and set cookie
        const url = req.nextUrl.clone();
        url.pathname = `/${langParam}${pathname === "/" ? "" : pathname}`;
        url.searchParams.delete("lang");
        const redirect = NextResponse.redirect(url);
        redirect.cookies.set("locale", langParam, {
          path: "/",
          maxAge: 60 * 60 * 24 * 365,
          sameSite: "lax",
        });
        return redirect;
      }

      // Detect language: cookie > browser > IP country > default
      const cookieLang = req.cookies.get("locale")?.value;
      if (cookieLang && SUPPORTED_LANGUAGES.includes(cookieLang) && pathname !== "/") {
        const url = req.nextUrl.clone();
        url.pathname = `/${cookieLang}${pathname}`;
        return NextResponse.redirect(url);
      }

      // Detect: browser Accept-Language > IP country > default
      const browserLang = detectFromAcceptLanguage(req.headers.get("accept-language"));
      const ipCountryLang = detectFromCountry(req.headers.get("x-vercel-ip-country"));

      // ── Root path /: set cookie but DON'T redirect (homepage exists) ──
      if (pathname === "/") {
        const targetLang = cookieLang ?? browserLang ?? ipCountryLang ?? DEFAULT_LANGUAGE;
        const safeLang = SUPPORTED_LANGUAGES.includes(targetLang) ? targetLang : DEFAULT_LANGUAGE;
        response.cookies.set("locale", safeLang, {
          path: "/",
          maxAge: 60 * 60 * 24 * 365,
          sameSite: "lax",
        });
        return response;
      }

      // ── Non-language-prefixed paths (e.g. /amish-secrets): redirect to /{lang}/{path} ──
      if (!firstSegment || !SUPPORTED_LANGUAGES.includes(firstSegment)) {
        const targetLang = cookieLang ?? browserLang ?? ipCountryLang ?? DEFAULT_LANGUAGE;
        const safeLang = SUPPORTED_LANGUAGES.includes(targetLang) ? targetLang : DEFAULT_LANGUAGE;

        const url = req.nextUrl.clone();
        url.pathname = `/${safeLang}${pathname}`;
        const redirect = NextResponse.redirect(url);
        redirect.cookies.set("locale", safeLang, {
          path: "/",
          maxAge: 60 * 60 * 24 * 365,
          sameSite: "lax",
        });
        return redirect;
      }
    }

    // ── Set locale cookie from ?lang= param (fallback for non-redirected paths) ──
    const lang = req.nextUrl.searchParams.get("lang");
    if (lang && /^[a-z]{2,5}$/.test(lang)) {
      response.cookies.set("locale", lang, {
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
        sameSite: "lax",
      });
    }

    return response;
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const { pathname } = req.nextUrl;

        // Known non-landing paths: skip auth
        if (isKnownPath(pathname)) return true;

        // Paths ALREADY with language prefix: /en, /fr/amish-secrets, etc.
        if (/^\/[a-z]{2,5}(\/.*)?$/.test(pathname)) {
          // Admin routes in any language — must have admin role
          if (pathname.startsWith("/admin")) {
            return !!token && token.role === "admin";
          }
          // Language-prefixed landing pages are public
          return true;
        }

        // Non-language-prefixed paths (e.g. /amish-secrets):
        // The middleware will detect language and redirect to /{lang}/{path}
        // Allow them through so the language detection logic runs
        return true;
      },
    },
    secret: process.env.NEXTAUTH_SECRET,
  }
);

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|images/|courses/|sitemap.xml).*)",
  ],
};
