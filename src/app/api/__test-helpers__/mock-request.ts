import type { NextRequest } from "next/server";

/**
 * src/app/api/__test-helpers__/mock-request.ts
 *
 * V3.3.3 — Single typed factory for mocking `NextRequest` in API Route
 * unit tests. Shared between the 9 Pattern-A files that define an inline
 * `createMockRequest` returning a manual object cast, AND the 6
 * Pattern-B files that define `createRequest` / `makeRequest` returning
 * `new Request(...) as unknown as NextRequest`. Replaces ~30 LOC of
 * per-file factory + `as unknown as NextRequest` cast duplication with a
 * single import.
 *
 * Scope: use this helper ONLY in API Route unit tests where a `NextRequest`
 * object is required. DO NOT use for e2e tests, React component tests, or
 * anything that needs a real network `Request` (e.g., Service Worker tests).
 *
 * Why a HYBRID `Object.assign(new Request(...), { nextUrl, json, text })`?
 *
 *   - `new Request(url, init)` produces a real `Request` instance, so
 *     every property the Web Fetch spec defines (`url`, `method`,
 *     `headers`, `body`, etc.) behaves identically to production. Tests
 *     that call `req.url` or `req.method` "just work" without extra
 *     mocking gymnastics (the previous Pattern-A manual-object approach
 *     had to model each property by hand and was easy to drift out of
 *     sync with `Request`).
 *
 *   - `Object.assign` layers three extensions on top of the real
 *     `Request`:
 *
 *       (1) `nextUrl: URL` — Next.js's NextRequest extends Request with
 *           `nextUrl: { searchParams: URLSearchParams }`. Routes in this
 *           codebase rely on `request.nextUrl.searchParams.get("foo")`
 *           extensively (access, progress, videos, ebook, coupons,
 *           analytics, conversations). Pre-computing `nextUrl = new
 *           URL(urlString)` exposes the parsed `searchParams` directly.
 *
 *       (2) `json: () => Promise.resolve(body)` — overrides
 *           Request.prototype.json so `await req.json()` returns the
 *           original `body` object UNCHANGED (instead of having to
 *           parse a JSON-stringified body that the test manually
 *           serialized). The production `Request.json()` consumes the
 *           body stream and errors on a second call. The override is
 *           idempotent across multiple reads in the same test.
 *
 *       (3) `text: () => Promise.resolve(bodyString ?? "")` — same
 *           override pattern as `json` but returns the JSON-stringified
 *           body. `coupons` and `progress` routes call `req.text()`
 *           instead of `req.json()` in branch paths; this covers
 *           both. The `Promise.resolve()` wrap (vs. `async () => body`)
 *           keeps the helper clean of the
 *           `@typescript-eslint/require-await` rule while remaining
 *           semantically equivalent under `await`. The `?? ""` covers
 *           GET requests where no body was set (no fallback was given,
 *           so an empty string is the convention).
 *
 *   - The `as unknown as NextRequest` final cast is the standard
 *     `Request → NextRequest` widening (the test layer doesn't need the
 *     cookies/next-url NextRequest-specific typing — `nextUrl` is the
 *     only one we model, and it's set above). Mirrors the V3.3.2
 *     `as unknown as FakeOrder` pattern.
 *
 * Argument surface (single options object, path as first positional arg):
 *
 *   `createMockRequest(path, options?)` mirrors the Web Fetch
 *   `new Request(input, init?)` signature — first positional arg is the
 *   URL/path, second is options. Two key design choices:
 *
 *   - `path: string` accepts BOTH:
 *       (a) full HTTP URL: `"http://localhost:3000/api/access"`
 *           — backward-compat with Pattern-A's `new URL(...)` style.
 *       (b) path-only: `"/api/access"` — auto-prefixed with
 *           `http://localhost:3000`. This is the recommended form for
 *           new tests; path-only is shorter at the call site and the
 *           prefix lives in one place (this file) for easy adjustment.
 *
 *   - `options: CreateMockRequestOptions` — single-object API. All
 *     fields optional with sensible defaults:
 *
 *       `method: "GET" | "POST" | ... | "DELETE"`     — default `"GET"`.
 *         Fetch API errors if you pass a `body` to GET/HEAD, so the
 *         body is silently dropped for those methods.
 *
 *       `query?: Record<string, string>`              — merged into
 *         URL.searchParams via `.set()`. Accepts the Pattern-A
 *         `(query: Record<string,string>)` shape directly. Inline
 *         `?foo=bar` in the path argument is also parsed (NextRequest
 *         readers don't care how the searchParams got there).
 *
 *       `body?: unknown`                              — auto-serialized
 *         to JSON for `.text()` and returned UNCHANGED for `.json()`.
 *         String bodies are passed through verbatim (Pattern-B uses
 *         `JSON.stringify({...})` literally at call sites).
 *
 *       `headers?: Record<string, string>`            — built into a
 *         real `Headers` instance (case-insensitive `.get()` natively,
 *         matches NextRequest semantics).
 *
 * Why a separate helper file (vs. inline `function createMockRequest`
 * in each test)?
 *
 *   - DRY across 15 files (~30 LOC of factory + ~15 inline `as unknown`
 *     type-only cast lines gone).
 *
 *   - Single source of truth for the URL prefix (`http://localhost:3000`)
 *     — if the test environment ever changes port, edit one place.
 *
 *   - Future-extensible: new request-shape needs (e.g., cookies,
 *     `request.cookies.get(...)`) can be added to the helper without
 *     touching 15 files.
 *
 *   - Type-safe (no `as any` casts in any test file → ESLint
 *     `no-explicit-any` stays clean; the only `as unknown` cast is
 *     encapsulated in this one helper).
 */

/**
 * Options object for `createMockRequest`. All fields are optional with
 * documented defaults — see the module docstring for full behavior.
 */
interface CreateMockRequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  query?: Record<string, string>;
  body?: unknown;
  headers?: Record<string, string>;
}

const DEFAULT_BASE_URL = "http://localhost:3000";

/**
 * Create a mock `NextRequest` for API Route unit tests. See the
 * module docstring for the full argument semantics and scope.
 */
export function createMockRequest(
  path: string,
  options: CreateMockRequestOptions = {}
): NextRequest {
  const { method = "GET", query = {}, body, headers = {} } = options;

  // ── 1. Build the URL (full URL vs path-only with default base) ──
  const urlStr = path.startsWith("http")
    ? path
    : `${DEFAULT_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
  const url = new URL(urlStr);

  // ── 2. Merge explicit `query` into searchParams ──
  for (const [k, v] of Object.entries(query)) {
    url.searchParams.set(k, v);
  }

  // ── 3. Build real Headers instance (case-insensitive .get() natively) ──
  const rawHeaders = new Headers();
  for (const [k, v] of Object.entries(headers)) {
    rawHeaders.set(k, v);
  }

  // ── 4. Compute body (string pass-through vs auto-stringify for objects) ──
  // GET requests cannot carry a body per the Fetch spec — drop it.
  const canHaveBody = method !== "GET";
  const hasBodyValue = body !== undefined && canHaveBody;
  const bodyString = hasBodyValue
    ? typeof body === "string"
      ? body
      : JSON.stringify(body)
    : undefined;

  // ── 5. Build the real Request instance ──
  const init: RequestInit = { method, headers: rawHeaders };
  if (hasBodyValue) init.body = bodyString;

  const request = new Request(url.toString(), init);

  // ── 6. Layer nextUrl + json/text overrides on top ──
  // Own-property lookup wins over the prototype, so the overrides shadow
  // Request.prototype.json / text. Production Request.prototype.json
  // consumes a stream — overriding prevents the "body stream already read"
  // error when tests call .json() multiple times or in branches that
  // wouldn't reach the original.
  return Object.assign(request, {
    nextUrl: url,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(bodyString ?? ""),
  }) as unknown as NextRequest;
}
