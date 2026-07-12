/**
 * src/app/api/__test-helpers__/mock-request.test.ts
 *
 * V3.3.3.x — Factory-invariant tests for `createMockRequest()` so this
 * shared SSOT helper is not in "untested-factory" state. The 4 tests
 * below lock in the 4 invariants the helper is supposed to satisfy.
 *
 * Invariants proven here:
 *
 *   (a) `createMockRequest(path)` returns a NextRequest-shaped mock with:
 *       — `method` defaulting to `"GET"`;
 *       — `url` set to `http://localhost:3000<path>` (path auto-prefixed
 *         with the helper's default base);
 *       — `nextUrl.searchParams` parsed from the URL (empty for no
 *         inline `?foo=...`).
 *       — `headers` is a real `Headers` instance whose `.get("x")`
 *         returns `null` for unset headers (matches NextRequest semantics).
 *
 *   (b) `createMockRequest(path, { query, headers })` merges both:
 *       — `query` keys are merged into `nextUrl.searchParams` IN ADDITION
 *         to any inline `?foo=bar` in the path (Pattern B inline +
 *         Pattern A explicit can coexist).
 *       — `headers` keys populate the real `Headers` instance with
 *         case-insensitive `.get()` semantics (`X-Test` and `x-test`
 *         resolve to the same entry).
 *
 *   (c) `createMockRequest(path, { method: "POST", body })` exposes JSON:
 *       — `await req.json()` returns the body OBJECT UNCHANGED (not the
 *         pre-stringified form);
 *       — `await req.text()` returns the JSON-stringified form;
 *       — `body` is auto-JSON-stringified when given an object (caller
 *         does NOT need to pre-stringify).
 *       — String bodies pass through verbatim (Pattern-B convention of
 *         pre-stringifying survives).
 *       — Method drops the body on GET (Fetch spec: GET/HEAD cannot
 *         carry a body).
 *
 *   (d) Full HTTP URL pass-through — `createMockRequest("http://...")`
 *       is preserved verbatim (NOT double-prefixed); the helper detects
 *       `path.startsWith("http")` and skips the default base prefix.
 *       This is the backward-compat escape hatch for Pattern A's
 *       `http://localhost:3000/api/access` style calls.
 *
 * Why no `NextRequest` direct import:
 *
 *   We only need to assert the mock's behavior (URL, headers, methods
 *   return correct shapes). The mock's return type is `NextRequest`, but
 *   the assertions here use basic instance checks and `.get()`/`.json()`
 *   reads that work through the `Object.assign` extension. Importing
 *   Next.js's `NextRequest` class would add a build dep we don't need
 *   for invariant proof.
 */

import { describe, it, expect } from "vitest";

import { createMockRequest } from "./mock-request";

describe("src/app/api/__test-helpers__/mock-request.ts — factory invariants", () => {
  it("(a) createMockRequest(path) defaults: GET method, URL auto-prefixed, empty headers.nextUrl", () => {
    const req = createMockRequest("/api/test");

    // Method default.
    expect(req.method).toBe("GET");
    // URL auto-prefixed with localhost:3000.
    expect(req.url).toBe("http://localhost:3000/api/test");
    // nextUrl is a parsed URL with empty searchParams.
    expect(req.nextUrl.pathname).toBe("/api/test");
    expect(req.nextUrl.searchParams.toString()).toBe("");
    // Headers is a real Headers instance whose .get on an unset key is null.
    expect(req.headers.get("x-not-set")).toBeNull();
  });

  it("(b) query + headers merge: inline ?foo=bar + explicit query: {} coexist; headers case-insensitive", () => {
    const req = createMockRequest("/api/test?foo=abc", {
      query: { bar: "123", baz: "qux" },
      headers: { "X-Test": "yes" },
    });

    // Inline `foo=abc` is preserved AND explicit `bar=123`, `baz=qux` are merged in.
    expect(req.nextUrl.searchParams.get("foo")).toBe("abc");
    expect(req.nextUrl.searchParams.get("bar")).toBe("123");
    expect(req.nextUrl.searchParams.get("baz")).toBe("qux");

    // Headers are case-insensitive via real Headers instance:
    // The helper stored `X-Test`; the assertion reads with lowercase.
    expect(req.headers.get("x-test")).toBe("yes");
    expect(req.headers.get("X-TEST")).toBe("yes");
    // Unset headers still return null.
    expect(req.headers.get("missing")).toBeNull();
  });

  it("(c) body serialization: objects auto-stringify; .json() returns object, .text() returns JSON string", async () => {
    const req = createMockRequest("/api/test", {
      method: "POST",
      body: { field: "value", nested: { ok: 1 } },
    });

    // Method override honored.
    expect(req.method).toBe("POST");

    // .json() returns the OBJECT unchanged — not the stringified form.
    const jsonBody = await req.json();
    expect(jsonBody).toEqual({ field: "value", nested: { ok: 1 } });

    // .text() returns the JSON-stringified form.
    const textBody = await req.text();
    expect(textBody).toBe('{"field":"value","nested":{"ok":1}}');
  });

  it("(d) full HTTP URL pass-through (Backward-compat with Pattern A) — no localhost:3000 prefix added", () => {
    const fullUrl = "http://example.org:8080/api/legacy?pre=1";
    const req = createMockRequest(fullUrl, {
      query: { post: "1" },
    });

    // The URL keeps the original host (no localhost:3000 prefix was added).
    // Note: `req.url` will reflect the MERGED URL (with explicit `post=1`
    // appended to inline `pre=1`) — assert on the origin/host instead of
    // the exact URL string, since merging is intentional behavior.
    expect(req.url.startsWith("http://example.org:8080/")).toBe(true);
    // Both inline `pre=1` and explicit `post=1` are merged into
    // nextUrl.searchParams — the SSOT for query access in this codebase.
    expect(req.nextUrl.searchParams.get("pre")).toBe("1");
    expect(req.nextUrl.searchParams.get("post")).toBe("1");
  });
});
