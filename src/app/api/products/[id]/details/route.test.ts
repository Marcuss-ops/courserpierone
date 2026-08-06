// @vitest-environment node

/**
 * src/app/api/products/[id]/details/route.test.ts
 *
 * Route-level smoke + correctness tests for the
 * `GET /api/products/:slug/details` handler. Mirrors the
 * `route.test.ts` pattern used across the API surface
 * (e.g. `src/app/api/products/[slug]/content/route.test.ts`):
 *
 *   - Stub the data layer fetcher with `vi.mock` so the
 *     route is tested in isolation (no Prisma, no DB).
 *   - Assert the route maps the discriminated union to
 *     HTTP correctly (`not_found` → 404, success → 200 +
 *     JSON payload).
 *   - Verify the `?locale=` query param is forwarded
 *     verbatim to the use case.
 *
 * No real I/O. Pure unit test of the handler boundary.
 *
 * ─── Why `NextRequest` directly (not `Request`) ───────────────────
 *
 * The handler reads `req.nextUrl.searchParams.get("locale")`.
 * `nextUrl` is a Next.js-specific extension on `Request`. Using
 * `new Request(...)` would crash at runtime because `Request`
 * doesn't carry `nextUrl`. Constructing `new NextRequest(new URL(...))`
 * matches how Next.js's middleware constructs the request at
 * runtime — no cast, no crash.
 *
 * ─── Why a static `import` (not dynamic `await import`) ──────────
 *
 * `vi.mock(...)` declared at module scope is hoisted by vitest
 * before any `import` resolves (vitest's "automatic hoisting"
 * for `vi.mock`). A dynamic `await import("./route")` after
 * `vi.mock` is brittle across bundler tweaks; a static import
 * is the documented idiom and equivalent in correctness.
 */

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ContentDocumentV1 } from "@/domains/catalog/blocks/document";
import type { ResolveProductDocumentOutcome } from "@/domains/catalog/product-documents/resolve-product-document";

// ─── Mock the data fetcher (composition root) ─────────────────────

const fetchProductDocumentMock = vi.fn<
  (input: { slug: string; locale?: string }) => Promise<ResolveProductDocumentOutcome>
>();

vi.mock("@/lib/data/product-document-data", () => ({
  fetchProductDocument: (input: {
    slug: string;
    locale?: string;
  }): Promise<ResolveProductDocumentOutcome> => fetchProductDocumentMock(input),
}));

// Static import: vitest hoists the `vi.mock` above this line so
// the import resolution observes the mocked module factory.
import { GET } from "./route";

const VALID_DOC: ContentDocumentV1 = {
  schemaVersion: 1,
  blocks: [
    {
      id: "block_intro",
      type: "heading",
      position: 0,
      props: { level: 1 },
      content: [{ type: "text", text: "Benvenuto" }],
    } as never,
  ] as never,
};

// ─── Helpers ─────────────────────────────────────────────────────

function okOutcome(locale: string, isFallback = false): ResolveProductDocumentOutcome {
  return {
    success: true,
    data: {
      document: VALID_DOC,
      plainText: "Benvenuto",
      revision: 1,
      resolvedLocale: locale,
      isFallback,
    },
  };
}

function notFoundOutcome(): ResolveProductDocumentOutcome {
  return { success: false, reason: "not_found" };
}

function mkReq(url: string): NextRequest {
  return new NextRequest(new URL(url));
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  fetchProductDocumentMock.mockReset();
});

// ─── Tests ──────────────────────────────────────────────────────

describe("GET /api/products/:slug/details — outcome mapping", () => {
  it("success: returns 200 + JSON payload (data branch)", async () => {
    fetchProductDocumentMock.mockResolvedValueOnce(okOutcome("en"));

    const res = await GET(mkReq("https://example.test/api/products/lumio/details"), params("lumio"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      document: VALID_DOC,
      plainText: "Benvenuto",
      revision: 1,
      resolvedLocale: "en",
      isFallback: false,
    });
  });

  it("success with isFallback=true: payload reflects fallback flag", async () => {
    fetchProductDocumentMock.mockResolvedValueOnce(okOutcome("it", true));

    const res = await GET(
      mkReq("https://example.test/api/products/lumio/details?locale=en"),
      params("lumio"),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isFallback).toBe(true);
    expect(body.resolvedLocale).toBe("it");
  });

  it("not_found: returns 404 + `{ error: 'not_found' }`", async () => {
    fetchProductDocumentMock.mockResolvedValueOnce(notFoundOutcome());

    const res = await GET(
      mkReq("https://example.test/api/products/missing/details"),
      params("missing"),
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: "not_found" });
  });
});

describe("GET /api/products/:slug/details — input forwarding", () => {
  it("forwards `slug` verbatim to the fetcher", async () => {
    fetchProductDocumentMock.mockResolvedValueOnce(okOutcome("en"));

    await GET(
      mkReq("https://example.test/api/products/amish-secrets/details"),
      params("amish-secrets"),
    );

    expect(fetchProductDocumentMock).toHaveBeenCalledWith({
      slug: "amish-secrets",
      locale: undefined,
    });
  });

  it("forwards `?locale=it` to the fetcher", async () => {
    fetchProductDocumentMock.mockResolvedValueOnce(okOutcome("it"));

    await GET(
      mkReq("https://example.test/api/products/lumio/details?locale=it"),
      params("lumio"),
    );

    expect(fetchProductDocumentMock).toHaveBeenCalledWith({
      slug: "lumio",
      locale: "it",
    });
  });

  it("trim whitespace on `?locale=  ` (the route normalizes; use case falsy-coerces)", async () => {
    fetchProductDocumentMock.mockResolvedValueOnce(okOutcome("it"));

    // The route layer trims explicit whitespace so callers don't
    // hit a "locale was spaces" edge; the use case's
    // falsy-coercion handles truly empty strings / undefined.
    await GET(
      mkReq("https://example.test/api/products/lumio/details?locale=%20%20"),
      params("lumio"),
    );

    // After trim, "  " → "". Use case falsy-coerces "" to undefined.
    expect(fetchProductDocumentMock).toHaveBeenCalledWith({
      slug: "lumio",
      locale: undefined,
    });
  });
});
