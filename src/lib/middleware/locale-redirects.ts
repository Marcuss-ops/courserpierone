// ─── Locale Redirects — Pure functions for each case ──────

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  resolveLocale,
  isKnownLocale,
  normalizeLocale,
  LANG_TO_DEFAULT_LOCALE,
} from "@/lib/i18n/locale-resolver";
import { setLocaleCookie } from "./locale-cookie";

// ─── Helpers ───────────────────────────────────────────────

function getCookieLocale(request: NextRequest): string | undefined {
  return request.cookies.get("locale")?.value;
}

function getAcceptLanguage(request: NextRequest): string | null {
  return request.headers.get("accept-language");
}

function getIpCountry(request: NextRequest): string | null {
  return request.headers.get("x-vercel-ip-country");
}

function withoutLeadingSlash(path: string): string {
  return path.startsWith("/") ? path.slice(1) : path;
}

// ─── Case 1: Full locale prefix (fr-fr, pt-br, en-us) ──────

export function handleFullLocale(
  request: NextRequest,
  response: NextResponse,
): NextResponse | null {
  const { pathname } = request.nextUrl;
  const firstSegment = pathname.split("/")[1]?.toLowerCase() ?? "";

  if (
    !firstSegment ||
    !isKnownLocale(firstSegment) ||
    !firstSegment.includes("-")
  ) {
    return null;
  }

  if (pathname === `/${firstSegment}` || pathname === `/${firstSegment}/`) {
    const redirect = NextResponse.redirect(new URL("/", request.url));
    setLocaleCookie(redirect, firstSegment);
    return redirect;
  }

  setLocaleCookie(response, firstSegment);
  return response;
}

// ─── Case 2: 2-letter language code → full locale ──────────

export function handleShortLang(
  request: NextRequest,
): NextResponse | null {
  const { pathname } = request.nextUrl;
  const firstSegment = pathname.split("/")[1]?.toLowerCase() ?? "";

  if (
    !firstSegment ||
    !isKnownLocale(firstSegment) ||
    firstSegment.length !== 2
  ) {
    return null;
  }

  const targetLocale =
    LANG_TO_DEFAULT_LOCALE[firstSegment] ?? `${firstSegment}-${firstSegment}`;
  const restPath = pathname.slice(firstSegment.length + 1) || "";
  const url = request.nextUrl.clone();
  url.pathname = `/${targetLocale}/${withoutLeadingSlash(restPath)}`;
  const redirect = NextResponse.redirect(url);
  setLocaleCookie(redirect, targetLocale);
  return redirect;
}

// ─── Case 3: Root "/" — detect locale, set cookie ──────────

export function handleRootLocale(
  request: NextRequest,
  response: NextResponse,
): NextResponse | null {
  if (request.nextUrl.pathname !== "/") return null;

  const result = resolveLocale({
    cookieLocale: getCookieLocale(request),
    acceptLanguage: getAcceptLanguage(request),
    ipCountry: getIpCountry(request),
  });
  setLocaleCookie(response, result.selectedLocale);
  return response;
}

// ─── Case 4: ?lang= parameter ──────────────────────────────

export function handleLangParam(
  request: NextRequest,
): NextResponse | null {
  const langParam = request.nextUrl.searchParams.get("lang");
  if (!langParam) return null;

  const normalized = normalizeLocale(langParam);
  const url = request.nextUrl.clone();
  const { pathname } = url;
  const firstSegment = pathname.split("/")[1]?.toLowerCase() ?? "";

  if (firstSegment && isKnownLocale(firstSegment)) {
    url.searchParams.delete("lang");
    const redirect = NextResponse.redirect(url);
    setLocaleCookie(redirect, normalized);
    return redirect;
  }

  url.pathname = `/${normalized}/${withoutLeadingSlash(pathname)}`;
  url.searchParams.delete("lang");
  const redirect = NextResponse.redirect(url);
  setLocaleCookie(redirect, normalized);
  return redirect;
}

// ─── Case 5: Non-prefixed path — detect and redirect ───────

export function handleNoPrefix(
  request: NextRequest,
): NextResponse | null {
  const { pathname } = request.nextUrl;
  const firstSegment = pathname.split("/")[1]?.toLowerCase() ?? "";

  if (firstSegment && isKnownLocale(firstSegment)) return null;

  const result = resolveLocale({
    cookieLocale: getCookieLocale(request),
    acceptLanguage: getAcceptLanguage(request),
    ipCountry: getIpCountry(request),
  });
  const url = request.nextUrl.clone();
  url.pathname = `/${result.selectedLocale}/${withoutLeadingSlash(pathname)}`;
  const redirect = NextResponse.redirect(url);
  setLocaleCookie(redirect, result.selectedLocale);
  return redirect;
}

