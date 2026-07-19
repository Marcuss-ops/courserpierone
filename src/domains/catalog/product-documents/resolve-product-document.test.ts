/**
 * src/domains/catalog/product-documents/resolve-product-document.test.ts
 *
 * Unit tests for `resolveProductDocument` use case (MCR Phase 2).
 *
 * Test posture (mirrors content-pages use cases — same author):
 *   - Stub the `ResolveProductDocumentPort` directly. No Prisma mock.
 *     The adapter has its own test suite (in a sibling file, future
 *     commit) that verifies the SQL shape.
 *   - All assertions on the discriminated-union outcome + result
 *     payload semantics (isFallback, narrow, chain hops).
 *   - Vitest 1.x: `describe`, `it`, `expect` are imported (the
 *     project does not opt into vitest globals; explicit imports
 *     are the convention).
 *
 * `VALID_DOC` casts the document to `ContentDocumentV1` once at the
 * boundary. Inside, blocks follow the schema's literal shape:
 * `id`, `type`, `props`, `content` (top-level). The BLOCK schema
 * has strict typing per variant; the cast bypasses narrowing on
 * `level: 1` / `position: 0` here so the test fixtures stay
 * readable. Production paths handle the strict narrowing correctly.
 */

import { describe, expect, it } from "vitest";

import type { ContentDocumentV1 } from "@/domains/catalog/blocks/document";
import type {
  ProductDocumentRow,
  ResolveProductDocumentPort,
} from "./resolve-product-document-types";
import { resolveProductDocument } from "./resolve-product-document";

// ─── Test helpers ────────────────────────────────────────────────

const VALID_DOC = {
  schemaVersion: 1,
  blocks: [
    {
      id: "block_intro",
      type: "heading",
      position: 0,
      props: { level: 1 },
      content: [{ type: "text", text: "Benvenuto" }],
    },
  ],
} as unknown as ContentDocumentV1;

interface StubState {
  calls: Array<{ slug: string; requestedLocale?: string }>;
}

/** Build a successful "primary matched" lookup. */
function okPrimary(
  productId: string,
  locale: string,
  document: ContentDocumentV1 | null = VALID_DOC,
): {
  productId: string;
  defaultLanguage: string;
  row: ProductDocumentRow;
  matchedLocale: string;
} {
  return {
    productId,
    defaultLanguage: "it",
    row: {
      id: "doc_1",
      productId,
      locale,
      document,
      plainText: "Benvenuto",
      revision: 1,
    },
    matchedLocale: locale,
  };
}

// ─── Tests ──────────────────────────────────────────────────────

describe("resolveProductDocument — guard + port stub posture", () => {
  it("1. GUARD: empty slug → not_found, NO port calls", async () => {
    const state: StubState = { calls: [] };
    const port: ResolveProductDocumentPort = {
      async findPublishedProductDocumentBySlug({ slug, requestedLocale }) {
        state.calls.push({ slug, requestedLocale });
        throw new Error("unreachable: stub should be overridden per test");
      },
    };

    const result = await resolveProductDocument({ slug: "" }, { port });

    expect(result).toEqual({ success: false, reason: "not_found" });
    expect(state.calls).toHaveLength(0);
  });

  it("2. NORMALIZATION_EMPTY_AS_UNDEFINED: empty `input.locale` → port receives `requestedLocale: undefined`", async () => {
    const state: StubState = { calls: [] };
    const port: ResolveProductDocumentPort = {
      async findPublishedProductDocumentBySlug({ slug, requestedLocale }) {
        state.calls.push({ slug, requestedLocale });
        return okPrimary("prod_1", "it");
      },
    };

    const result = await resolveProductDocument(
      { slug: "lumio", locale: "" },
      { port },
    );

    // Empty string coerced to undefined BEFORE the port call.
    expect(state.calls).toEqual([
      { slug: "lumio", requestedLocale: undefined },
    ]);

    // Success branch: matchedLocale = "it", requestedLocale = undefined.
    // isFallback = requestedLocale !== undefined && matchedLocale !== requestedLocale
    //           = false && ...
    //           = false
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isFallback).toBe(false);
      expect(result.data.resolvedLocale).toBe("it");
    }
  });
});

describe("resolveProductDocument — port outcomes collapsed to not_found", () => {
  it("3. PORT_NULL: no published product → not_found (no info leak)", async () => {
    const state: StubState = { calls: [] };
    const port: ResolveProductDocumentPort = {
      async findPublishedProductDocumentBySlug({ slug, requestedLocale }) {
        state.calls.push({ slug, requestedLocale });
        return null;
      },
    };

    const result = await resolveProductDocument(
      { slug: "missing-product", locale: "en" },
      { port },
    );

    expect(result).toEqual({ success: false, reason: "not_found" });
    expect(state.calls).toHaveLength(1);
    expect(state.calls[0]).toEqual({
      slug: "missing-product",
      requestedLocale: "en",
    });
  });

  it("4. PORT_NO_ROW: product published but no document row → not_found", async () => {
    const port: ResolveProductDocumentPort = {
      async findPublishedProductDocumentBySlug() {
        return {
          productId: "prod_1",
          defaultLanguage: "it",
          row: null,
          matchedLocale: null,
        };
      },
    };

    const result = await resolveProductDocument(
      { slug: "lumio", locale: "en" },
      { port },
    );

    expect(result).toEqual({ success: false, reason: "not_found" });
  });

  it("5. PORT_CORRUPTION: row.document === null → not_found (defensive narrowing)", async () => {
    const port: ResolveProductDocumentPort = {
      async findPublishedProductDocumentBySlug() {
        return {
          productId: "prod_1",
          defaultLanguage: "it",
          row: {
            id: "doc_1",
            productId: "prod_1",
            locale: "it",
            document: null,
            plainText: null,
            revision: 1,
          },
          // matchedLocale set even though document was null —
          // simulates the adapter surfacing a malformed row.
          matchedLocale: "it",
        };
      },
    };

    const result = await resolveProductDocument({ slug: "lumio" }, { port });

    expect(result).toEqual({ success: false, reason: "not_found" });
  });
});

describe("resolveProductDocument — success branches", () => {
  it("6. PRIMARY_MATCH: requested locale matched → success, isFallback=false", async () => {
    const port: ResolveProductDocumentPort = {
      async findPublishedProductDocumentBySlug() {
        return okPrimary("prod_1", "en");
      },
    };

    const result = await resolveProductDocument(
      { slug: "lumio", locale: "en" },
      { port },
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.resolvedLocale).toBe("en");
      expect(result.data.isFallback).toBe(false);
      expect(result.data.document).toEqual(VALID_DOC);
      expect(result.data.plainText).toBe("Benvenuto");
      expect(result.data.revision).toBe(1);
    }
  });

  it("7. PRIMARY_MISS, DEFAULT_MATCH: requested locale missing, default matched → success, isFallback=true", async () => {
    const port: ResolveProductDocumentPort = {
      async findPublishedProductDocumentBySlug() {
        return okPrimary("prod_1", "it");
      },
    };

    const result = await resolveProductDocument(
      { slug: "lumio", locale: "en" },
      { port },
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.resolvedLocale).toBe("it");
      expect(result.data.isFallback).toBe(true);
    }
  });

  it("8. NEITHER_MATCH: port surfaces row:null → not_found", async () => {
    const port: ResolveProductDocumentPort = {
      async findPublishedProductDocumentBySlug() {
        return {
          productId: "prod_1",
          defaultLanguage: "it",
          row: null,
          matchedLocale: null,
        };
      },
    };

    const result = await resolveProductDocument(
      { slug: "lumio", locale: "zh" },
      { port },
    );

    expect(result).toEqual({ success: false, reason: "not_found" });
  });

  it("9. NO_REQUEST: input.locale undefined, default matched → success, isFallback=false", async () => {
    const port: ResolveProductDocumentPort = {
      async findPublishedProductDocumentBySlug() {
        return okPrimary("prod_1", "it");
      },
    };

    const result = await resolveProductDocument({ slug: "lumio" }, { port });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.resolvedLocale).toBe("it");
      // No "requested" → no "fallback" — the default IS canonical.
      expect(result.data.isFallback).toBe(false);
    }
  });

  it("10. REQUESTED_EQUALS_DEFAULT: short-circuits to single-hop chain, matchedLocale=default, isFallback=false", async () => {
    const port: ResolveProductDocumentPort = {
      async findPublishedProductDocumentBySlug({ requestedLocale }) {
        // The port adapter is responsible for the de-dup; here
        // we simulate by passing through whatever the port would
        // do. Assert that requestedLocale was forwarded.
        expect(requestedLocale).toBe("it");
        return okPrimary("prod_1", "it");
      },
    };

    const result = await resolveProductDocument(
      { slug: "lumio", locale: "it" },
      { port },
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.resolvedLocale).toBe("it");
      // requested = default → matchedLocale = requested → isFallback=false
      expect(result.data.isFallback).toBe(false);
    }
  });
});

describe("resolveProductDocument — port forward-passes input verbatim", () => {
  it("11. FORWARD: `slug` and normalised `requestedLocale` are passed through unchanged", async () => {
    const state: StubState = { calls: [] };
    const port: ResolveProductDocumentPort = {
      async findPublishedProductDocumentBySlug({ slug, requestedLocale }) {
        state.calls.push({ slug, requestedLocale });
        return okPrimary("prod_1", "en");
      },
    };

    await resolveProductDocument(
      { slug: "amish-secrets", locale: "en" },
      { port },
    );

    expect(state.calls).toEqual([
      { slug: "amish-secrets", requestedLocale: "en" },
    ]);
  });

  it("12. FORWARD_NO_LOCALE: omitting `input.locale` forwards `requestedLocale: undefined`", async () => {
    const state: StubState = { calls: [] };
    const port: ResolveProductDocumentPort = {
      async findPublishedProductDocumentBySlug({ slug, requestedLocale }) {
        state.calls.push({ slug, requestedLocale });
        return okPrimary("prod_1", "it");
      },
    };

    await resolveProductDocument({ slug: "lumio" }, { port });

    expect(state.calls).toEqual([
      { slug: "lumio", requestedLocale: undefined },
    ]);
  });
});
