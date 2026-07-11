// ─── Tests for handleLangParam ──────────────────────────────
// Pins two regression-risk behaviors of the middleware cascade:
//   1. handleLangParam runs BEFORE handleRootLocale, so an explicit
//      `?lang=...` override wins over IP / Accept-Language fallback.
//   2. langToLocale(normalized) collapses a 2-letter code into the full
//      locale in a single 307, instead of bouncing through
//      handleShortLang downstream.

import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { DEFAULT_LOCALE } from "@/lib/i18n/locale-resolver";
import { handleLangParam } from "./locale-redirects";

/**
 * NextResponse.redirect() may emit `location` as a relative path or as
 * an absolute URL — depending on the Next.js version. Normalize both to
 * a pathname so the assertions stay stable across versions. We also
 * accept an optional trailing slash, since `Location` normalization
 * can drop it on empty trailing path segments.
 */
function pathOf(location: string | null): string | null {
  if (!location) return null;
  return new URL(location, "https://x.com").pathname;
}

function makeReq(url: string): NextRequest {
  return new NextRequest(url);
}

/**
 * Matches a pathname with an optional trailing slash, e.g. both
 * "/en-us" and "/en-us/". Keeps the test stable across Next.js
 * versions that differ on location serialization.
 */
const localePath = (locale: string) =>
  new RegExp(`^\\/${locale.replace(/-/g, "\\-")}\\/?$`);

describe("handleLangParam", () => {
  it("returns null when there is no ?lang= query param", () => {
    const res = handleLangParam(makeReq("https://x.com/"));
    expect(res).toBeNull();
  });

  it("resolves ?lang=es to /es-es/ in a single step with locale=es-es cookie (status 307)", () => {
    const res = handleLangParam(makeReq("https://x.com/?lang=es"));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(307);
    expect(pathOf(res!.headers.get("location"))).toMatch(localePath("es-es"));
    expect(res!.cookies.get("locale")?.value).toBe("es-es");
  });

  it("resolves ?lang=en to /en-us/ with locale=en-us cookie", () => {
    const res = handleLangParam(makeReq("https://x.com/?lang=en"));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(307);
    expect(pathOf(res!.headers.get("location"))).toMatch(localePath("en-us"));
    expect(res!.cookies.get("locale")?.value).toBe("en-us");
  });

  it("normalizes uppercase + underscore: ?lang=EN_US -> /en-us/ with locale=en-us cookie", () => {
    const res = handleLangParam(makeReq("https://x.com/?lang=EN_US"));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(307);
    expect(pathOf(res!.headers.get("location"))).toMatch(localePath("en-us"));
    expect(res!.cookies.get("locale")?.value).toBe("en-us");
  });

  it("resolves ?lang=fr to /fr-fr/ with locale=fr-fr cookie", () => {
    const res = handleLangParam(makeReq("https://x.com/?lang=fr"));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(307);
    expect(pathOf(res!.headers.get("location"))).toMatch(localePath("fr-fr"));
    expect(res!.cookies.get("locale")?.value).toBe("fr-fr");
  });

  it("falls back to DEFAULT_LOCALE for unknown language (?lang=xy)", () => {
    const res = handleLangParam(makeReq("https://x.com/?lang=xy"));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(307);
    expect(pathOf(res!.headers.get("location"))).toMatch(localePath(DEFAULT_LOCALE));
    expect(res!.cookies.get("locale")?.value).toBe(DEFAULT_LOCALE);
  });

  it("on already locale-prefixed path, drops ?lang= and updates cookie to the resolved full locale", () => {
    const res = handleLangParam(makeReq("https://x.com/it-it/page?lang=fr"));
    expect(res).not.toBeNull();
    expect(pathOf(res!.headers.get("location"))).toBe("/it-it/page");
    const locUrl = new URL(res!.headers.get("location")!, "https://x.com");
    expect(locUrl.searchParams.has("lang")).toBe(false);
    expect(res!.cookies.get("locale")?.value).toBe("fr-fr");
  });
});
