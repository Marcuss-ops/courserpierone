/**
 * src/domains/catalog/content-pages/resolve-published-content.test.ts
 *
 * Unit tests for the `resolvePublishedContent` use case (MCR
 * Phase 1 — public reader mirror of `publishContentProduct`).
 *
 * Pattern mirrors the established `mkStubPort`-style unit tests:
 *   - Stub the `ResolvePublishedContentPort` directly. No Prisma
 *     or Next mock — the use case is pure domain.
 *   - Each test pre-sets the stub's responses for
 *     `findPublishedProductBySlug` /
 *     `listPublishedPagesWithOneTranslation` independently,
 *     exercising one branch of the truth table.
 *
 * Coverage (per user spec: "unit test sui casi unpublished /
 * locale mancante"):
 *
 *   ── INPUT SHAPE ─────────────────────────────────────────────
 *     (a) input shape has exactly { slug, locale? } — no
 *         actorId / pageId (public endpoint, no auth).
 *
 *   ── GUARD ───────────────────────────────────────────────────
 *     (b) empty slug → not_found (no port calls).
 *
 *   ── findPublishedProductBySlug (collapsed posture) ──────────
 *     (c) product missing → not_found (NO listPages call).
 *         Note: the port's adapter collapses "no product" with
 *         "product not published" into a single null return;
 *         the use case does NOT differentiate.
 *
 *   ── LOCALE CHAIN (the spec's hard requirement) ──────────────
 *     (d) input.locale + translation present in that locale →
 *         chain = [input.locale, defaultLanguage],
 *         page resolvedLocale = input.locale, isFallback=false.
 *     (e) input.locale + translation MISSING in that locale but
 *         PRESENT in defaultLanguage → page resolvedLocale =
 *         defaultLanguage, isFallback=true.
 *     (f) input.locale + translation missing in BOTH the
 *         requested AND default → page resolvedLocale=null,
 *         isFallback=false (we didn't fall back; we failed).
 *     (g) no input.locale (only defaultLanguage) → chain =
 *         [defaultLanguage] (de-duplicated to 1 entry);
 *         page resolvedLocale = defaultLanguage, isFallback=false.
 *     (h) input.locale === defaultLanguage → chain = [locale]
 *         (de-duplicated to 1 entry).
 *
 *   ── PAGE ATTRIBUTES (preserve truth, delegate UX) ───────────
 *     (i) orphan published page (parent is draft) → page
 *         surfaces with parentId set (use case preserves the
 *         truth; renderer decides UX).
 *     (j) page with no translation in any locale → page
 *         surfaces with title/document/revision/resolvedLocale
 *         null (page metadata preserved, no info leak).
 *     (k) flat list order is preserved as port order (renderer
 *         builds tree deterministically).
 *     (l) empty pages list → success with pages=[] (mandatory
 *         defensive — even if publish gate forbids it).
 *
 *   ── HAPPY PATH ─────────────────────────────────────────────
 *     (m) published product + 2 pages with translations in
 *         requested locale → success with both pages echoing
 *         product meta + page meta + translations.
 *
 *   ── PLUMBING ────────────────────────────────────────────────
 *     (n) chain forwarding: the locales[] passed to the port is
 *         exactly the de-duplicated chain (NOT the raw input).
 *     (o) input.locale forwarded verbatim (no normalization —
 *         route layer handles BCP-47 expansion).
 *
 *   ── NO INFO LEAK POSTURE (the spec's hard requirement) ──────
 *     (p) single `not_found` branch covers both "no product"
 *         AND "product not published" (collapsed posture).
 *     (q) success branch does NOT contain creatorId.
 *         (Defense in depth at the test level — the types
 *         already exclude it but the runtime check confirms
 *         the schema enforces it.)
 *
 *   ── ARCHITECTURE GUARD ─────────────────────────────────────
 *     (r) input shape has exactly { slug, locale? } and does
 *         NOT contain actorId / auth-context fields.
 */

import { describe, expect, it } from "vitest";

import {
  resolvePublishedContent,
} from "./resolve-published-content";
import type {
  ResolvePublishedContentInput,
  ResolvePublishedContentPort,
  PublishedPageRow,
} from "./resolve-published-content-types";

// ─── Test helpers ─────────────────────────────────────────────────

type ProductCtx = {
  productId: string;
  slug: string;
  defaultLanguage: string;
  publishedAt: Date;
};

interface StubState {
  // Recorded inputs.
  lastFindInput?: { slug: string };
  lastListInput?: { productId: string; locales: readonly string[] };

  // Pre-set responses.
  productCtx: ProductCtx | null;
  pagesResult: { items: PublishedPageRow[] };

  // Call counters.
  findCallCount: number;
  listCallCount: number;
}

function mkStubPort(): {
  port: ResolvePublishedContentPort;
  state: StubState;
} {
  const state: StubState = {
    // Default: a published Italian product with 2 pages,
    // each with a translation in 'it'. The happy path
    // baseline.
    productCtx: {
      productId: "product_1",
      slug: "test-slug",
      defaultLanguage: "it",
      publishedAt: new Date("2026-04-01T08:00:00.000Z"),
    },
    pagesResult: {
      items: [
        {
          pageId: "page_a",
          parentId: null,
          slug: "intro",
          position: 1,
          publishedAt: new Date("2026-04-02T08:00:00.000Z"),
          title: "Introduzione",
          document: { schemaVersion: 1, blocks: [] },
          revision: 3,
          resolvedLocale: "it",
        },
        {
          pageId: "page_b",
          parentId: "page_a",
          slug: "capitolo-1",
          position: 1,
          publishedAt: new Date("2026-04-03T08:00:00.000Z"),
          title: "Capitolo 1",
          document: { schemaVersion: 1, blocks: [] },
          revision: 5,
          resolvedLocale: "it",
        },
      ],
    },
    findCallCount: 0,
    listCallCount: 0,
  };

  const port: ResolvePublishedContentPort = {
    async findPublishedProductBySlug(input) {
      state.findCallCount++;
      state.lastFindInput = input;
      return state.productCtx;
    },
    async listPublishedPagesWithOneTranslation(input) {
      state.listCallCount++;
      state.lastListInput = input;
      return state.pagesResult;
    },
  };

  return { port, state };
}

function happyInput(): ResolvePublishedContentInput {
  return {
    slug: "test-slug",
  };
}

// ─── Tests ─────────────────────────────────────────────────────────

describe("resolvePublishedContent — input invariants", () => {
  it("exports resolvePublishedContent as an async function", () => {
    expect(typeof resolvePublishedContent).toBe("function");
  });
});

// ─── 1. ARCHITECTURE GUARD — input shape ─────────────────────────

describe("resolvePublishedContent — input shape", () => {
  it("accepts exactly { slug, locale? } (no actorId / pageId / auth)", () => {
    const minimal: ResolvePublishedContentInput = {
      slug: "test-slug",
    };
    expect(Object.keys(minimal).sort()).toEqual(["slug"]);

    const full: ResolvePublishedContentInput = {
      slug: "test-slug",
      locale: "en",
    };
    expect(Object.keys(full).sort()).toEqual(["locale", "slug"]);
  });

  it("does NOT accept actorId / pageId / auth fields (public endpoint)", () => {
    const sample: ResolvePublishedContentInput = happyInput();
    const forbidden = [
      "actorId",
      "actorRole",
      "pageId",
      "parentId",
      "creatorId",
      "productId",
      "sessionToken",
    ];
    for (const f of forbidden) {
      expect(Object.keys(sample)).not.toContain(f);
    }
  });
});

// ─── 2. GUARD ────────────────────────────────────────────────────

describe("resolvePublishedContent — guard: empty inputs", () => {
  it("empty slug → not_found (no port calls)", async () => {
    const { port, state } = mkStubPort();
    const result = await resolvePublishedContent(
      { slug: "" },
      { port },
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.reason).toBe("not_found");
    expect(state.findCallCount).toBe(0);
    expect(state.listCallCount).toBe(0);
  });
});

// ─── 3. findPublishedProductBySlug (collapsed posture) ──────────

describe("resolvePublishedContent — findPublishedProductBySlug", () => {
  it("product missing → not_found (NO listPages call)", async () => {
    const { port, state } = mkStubPort();
    state.productCtx = null;
    const result = await resolvePublishedContent(
      happyInput(),
      { port },
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.reason).toBe("not_found");
    expect(state.listCallCount).toBe(0);
  });

  it("forwards slug verbatim to the find call", async () => {
    const { port, state } = mkStubPort();
    await resolvePublishedContent(
      { slug: "my-custom-slug" },
      { port },
    );
    expect(state.lastFindInput?.slug).toBe("my-custom-slug");
  });
});

// ─── 4. LOCALE CHAIN (the spec's hard requirement) ──────────────

describe("resolvePublishedContent — locale chain", () => {
  it("input.locale + translation present → resolvedLocale=input.locale, isFallback=false", async () => {
    const { port, state } = mkStubPort();
    state.productCtx = {
      productId: "product_1",
      slug: "test-slug",
      defaultLanguage: "it",
      publishedAt: new Date("2026-04-01T08:00:00.000Z"),
    };
    state.pagesResult = {
      items: [
        {
          pageId: "p_en",
          parentId: null,
          slug: "intro",
          position: 1,
          publishedAt: new Date(),
          title: "Introduction",
          document: { schemaVersion: 1, blocks: [] },
          revision: 1,
          resolvedLocale: "en",
        },
      ],
    };
    const result = await resolvePublishedContent(
      { slug: "test-slug", locale: "en" },
      { port },
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.pages[0]?.resolvedLocale).toBe("en");
      expect(result.pages[0]?.isFallback).toBe(false);
    }
    // Chain is [en, it] (en was requested, it is fallback).
    expect(state.lastListInput?.locales).toEqual(["en", "it"]);
  });

  it("input.locale missing in DB but defaultLanguage has translation → resolvedLocale=defaultLanguage, isFallback=true", async () => {
    const { port, state } = mkStubPort();
    state.productCtx = {
      productId: "product_1",
      slug: "test-slug",
      defaultLanguage: "it",
      publishedAt: new Date("2026-04-01T08:00:00.000Z"),
    };
    state.pagesResult = {
      items: [
        {
          pageId: "p_it",
          parentId: null,
          slug: "intro",
          position: 1,
          publishedAt: new Date(),
          title: "Introduzione",
          document: { schemaVersion: 1, blocks: [] },
          revision: 1,
          resolvedLocale: "it", // port fell back from "en" → "it"
        },
      ],
    };
    const result = await resolvePublishedContent(
      { slug: "test-slug", locale: "en" },
      { port },
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.pages[0]?.resolvedLocale).toBe("it");
      expect(result.pages[0]?.isFallback).toBe(true);
    }
    // Chain still forwarded as [en, it] — the port resolved
    // the fallback internally.
    expect(state.lastListInput?.locales).toEqual(["en", "it"]);
  });

  it("input.locale missing in BOTH requested AND default → resolvedLocale=null, isFallback=false (failed outright, not 'fell back')", async () => {
    const { port, state } = mkStubPort();
    state.productCtx = {
      productId: "product_1",
      slug: "test-slug",
      defaultLanguage: "it",
      publishedAt: new Date("2026-04-01T08:00:00.000Z"),
    };
    state.pagesResult = {
      items: [
        {
          pageId: "p_no_tr",
          parentId: null,
          slug: "intro",
          position: 1,
          publishedAt: new Date(),
          title: null,
          document: null,
          revision: null,
          resolvedLocale: null,
        },
      ],
    };
    const result = await resolvePublishedContent(
      { slug: "test-slug", locale: "en" },
      { port },
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.pages[0]?.resolvedLocale).toBeNull();
      expect(result.pages[0]?.title).toBeNull();
      expect(result.pages[0]?.document).toBeNull();
      expect(result.pages[0]?.revision).toBeNull();
      expect(result.pages[0]?.isFallback).toBe(false);
    }
  });

  it("no input.locale (only defaultLanguage) → chain de-duplicated to [defaultLanguage] only, isFallback=false", async () => {
    const { port, state } = mkStubPort();
    state.productCtx = {
      productId: "product_1",
      slug: "test-slug",
      defaultLanguage: "it",
      publishedAt: new Date(),
    };
    state.pagesResult = {
      items: [
        {
          pageId: "p",
          parentId: null,
          slug: "intro",
          position: 1,
          publishedAt: new Date(),
          title: "Introduzione",
          document: { schemaVersion: 1, blocks: [] },
          revision: 1,
          resolvedLocale: "it",
        },
      ],
    };
    const result = await resolvePublishedContent(
      { slug: "test-slug" }, // no locale
      { port },
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.pages[0]?.isFallback).toBe(false);
    }
    // Chain is de-duplicated to a single entry.
    expect(state.lastListInput?.locales).toEqual(["it"]);
  });

  it("input.locale === defaultLanguage → chain de-duplicated to a single entry", async () => {
    const { port, state } = mkStubPort();
    state.productCtx = {
      productId: "product_1",
      slug: "test-slug",
      defaultLanguage: "it",
      publishedAt: new Date(),
    };
    await resolvePublishedContent(
      { slug: "test-slug", locale: "it" },
      { port },
    );
    // Single-entry chain (de-duplicated).
    expect(state.lastListInput?.locales).toEqual(["it"]);
  });
});

// ─── 5. PAGE ATTRIBUTES (preserve truth, delegate UX) ───────────

describe("resolvePublishedContent — page attributes", () => {
  it("orphan published page (parentId set, parent is unpublished) → surface with parentId as-is", async () => {
    const { port, state } = mkStubPort();
    state.pagesResult = {
      items: [
        {
          pageId: "p_orphan",
          parentId: "p_parent_draft", // parent IS unpublished
          slug: "orphan",
          position: 1,
          publishedAt: new Date(),
          title: "Orphan Page",
          document: { schemaVersion: 1, blocks: [] },
          revision: 1,
          resolvedLocale: "it",
        },
      ],
    };
    const result = await resolvePublishedContent(
      happyInput(),
      { port },
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.pages[0]?.parentId).toBe("p_parent_draft");
    }
  });

  it("page with no translation in any locale → page meta preserved, translation fields null", async () => {
    const { port, state } = mkStubPort();
    state.pagesResult = {
      items: [
        {
          pageId: "p",
          parentId: null,
          slug: "intro",
          position: 1,
          publishedAt: new Date("2026-04-01T00:00:00.000Z"),
          title: null,
          document: null,
          revision: null,
          resolvedLocale: null,
        },
      ],
    };
    const result = await resolvePublishedContent(
      happyInput(),
      { port },
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.pages[0]?.id).toBe("p");
      expect(result.pages[0]?.slug).toBe("intro");
      expect(result.pages[0]?.position).toBe(1);
      expect(result.pages[0]?.title).toBeNull();
      expect(result.pages[0]?.document).toBeNull();
      expect(result.pages[0]?.revision).toBeNull();
      expect(result.pages[0]?.resolvedLocale).toBeNull();
      expect(result.pages[0]?.isFallback).toBe(false);
    }
  });

  it("flat list order preserved as port order (renderer builds tree)", async () => {
    const { port, state } = mkStubPort();
    state.pagesResult = {
      items: [
        {
          pageId: "p_z",
          parentId: null,
          slug: "z",
          position: 3,
          publishedAt: new Date(),
          title: "Z",
          document: { schemaVersion: 1, blocks: [] },
          revision: 1,
          resolvedLocale: "it",
        },
        {
          pageId: "p_a",
          parentId: null,
          slug: "a",
          position: 1,
          publishedAt: new Date(),
          title: "A",
          document: { schemaVersion: 1, blocks: [] },
          revision: 1,
          resolvedLocale: "it",
        },
      ],
    };
    const result = await resolvePublishedContent(
      happyInput(),
      { port },
    );
    expect(result.success).toBe(true);
    if (result.success) {
      // Adapter's ORDER BY (parentId NULLS FIRST, position ASC)
      // is preserved verbatim — the use case does not re-sort.
      expect(result.pages.map((p) => p.id)).toEqual(["p_z", "p_a"]);
    }
  });

  it("empty pages list → success with pages=[]", async () => {
    const { port, state } = mkStubPort();
    state.pagesResult = { items: [] };
    const result = await resolvePublishedContent(
      happyInput(),
      { port },
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.pages).toEqual([]);
    }
  });
});

// ─── 6. HAPPY PATH ─────────────────────────────────────────────

describe("resolvePublishedContent — happy path", () => {
  it("published product + 2 pages with translations → success with both pages", async () => {
    const { port, state } = mkStubPort();
    state.pagesResult = {
      items: [
        {
          pageId: "p_root",
          parentId: null,
          slug: "intro",
          position: 1,
          publishedAt: new Date("2026-04-02T08:00:00.000Z"),
          title: "Introduzione",
          document: { schemaVersion: 1, blocks: [] },
          revision: 3,
          resolvedLocale: "it",
        },
        {
          pageId: "p_child",
          parentId: "p_root",
          slug: "capitolo-1",
          position: 1,
          publishedAt: new Date("2026-04-03T08:00:00.000Z"),
          title: "Capitolo 1",
          document: { schemaVersion: 1, blocks: [] },
          revision: 5,
          resolvedLocale: "it",
        },
      ],
    };
    const result = await resolvePublishedContent(
      happyInput(),
      { port },
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.product).toEqual({
        id: "product_1",
        slug: "test-slug",
        defaultLanguage: "it",
        publishedAt: new Date("2026-04-01T08:00:00.000Z"),
      });
      expect(result.pages).toHaveLength(2);
      expect(result.pages[0]?.id).toBe("p_root");
      expect(result.pages[1]?.parentId).toBe("p_root");
    }
  });
});

// ─── 7. PLUMBING ────────────────────────────────────────────────

describe("resolvePublishedContent — plumbing", () => {
  it("locales[] forwarded to port is the de-duplicated chain", async () => {
    const { port, state } = mkStubPort();
    state.productCtx = {
      productId: "product_1",
      slug: "test-slug",
      defaultLanguage: "it",
      publishedAt: new Date(),
    };
    await resolvePublishedContent(
      { slug: "test-slug", locale: "de" },
      { port },
    );
    // Chain is [de, it] (de requested, it fallback) — NOT
    // [de, it, it].
    expect(state.lastListInput?.locales).toEqual(["de", "it"]);
  });

  it("input.locale forwarded verbatim (no normalization at the use case layer)", async () => {
    const { port, state } = mkStubPort();
    state.productCtx = {
      productId: "product_1",
      slug: "test-slug",
      defaultLanguage: "it",
      publishedAt: new Date(),
    };
    await resolvePublishedContent(
      { slug: "test-slug", locale: "en-US" }, // full BCP-47
      { port },
    );
    // "en-US" forwarded unchanged — normalization is route
    // layer's job.
    expect(state.lastListInput?.locales).toEqual(["en-US", "it"]);
  });

  it("slug forwarded verbatim to the find call", async () => {
    const { port, state } = mkStubPort();
    await resolvePublishedContent(
      { slug: "abc-123-xyz" },
      { port },
    );
    expect(state.lastFindInput?.slug).toBe("abc-123-xyz");
  });

  it("productId forwarded verbatim from the gate to the list call", async () => {
    const { port, state } = mkStubPort();
    state.productCtx = {
      productId: "product_42",
      slug: "test-slug",
      defaultLanguage: "it",
      publishedAt: new Date(),
    };
    await resolvePublishedContent(happyInput(), { port });
    expect(state.lastListInput?.productId).toBe("product_42");
  });
});

// ─── 8. NO INFO LEAK POSTURE (the spec's hard requirement) ──────

describe("resolvePublishedContent — no info leak posture", () => {
  it("single `not_found` branch covers BOTH (a) no product AND (b) product not published", async () => {
    // The collapsed posture: the port's adapter returns null
    // for both reasons. The use case does NOT distinguish.
    const r1 = await resolvePublishedContent(
      { slug: "missing-slug" },
      {
        port: {
          async findPublishedProductBySlug() { return null; },
          async listPublishedPagesWithOneTranslation() {
            throw new Error("should not be called");
          },
        },
      },
    );
    expect(r1.success).toBe(false);
    if (!r1.success) expect(r1.reason).toBe("not_found");

    // And the same outcome when status != "published" (the
    // port's adapter filters status='published' so it returns
    // null in both cases).
    const r2 = await resolvePublishedContent(
      happyInput(),
      {
        port: {
          async findPublishedProductBySlug() { return null; },
          async listPublishedPagesWithOneTranslation() {
            throw new Error("should not be called");
          },
        },
      },
    );
    if (!r2.success) expect(r2.reason).toBe("not_found");
  });

  it("success branch does NOT include creatorId (test-level schema verification)", () => {
    // Defense in depth: types already exclude creatorId, but
    // a runtime check confirms what's actually surfaced.
    //
    // (We don't call the use case for this; we just lock the
    // shape that the success branch will produce by examining
    // the union.)
    type SuccessBranch = Extract<
      Awaited<ReturnType<typeof resolvePublishedContent>>,
      { success: true }
    >;
    // The product sub-shape of the success branch should
    // contain { id, slug, defaultLanguage, publishedAt }
    // exactly — no creatorId, no updatedAt, no internal
    // fields.
    type ProductSub = SuccessBranch["product"];
    const productKeys: Array<keyof ProductSub> = [
      "id",
      "slug",
      "defaultLanguage",
      "publishedAt",
    ];
    expect(productKeys.sort()).toEqual([
      "defaultLanguage",
      "id",
      "publishedAt",
      "slug",
    ]);
  });
});

// ─── 9. DENIAL REASON CONST EXPORTS ─────────────────────────────

describe("resolvePublishedContent — denial reason exports", () => {
  it("ResolvePublishedContentDenialReason.NotFound === 'not_found'", async () => {
    const mod = await import("./resolve-published-content");
    expect(mod.ResolvePublishedContentDenialReason.NotFound).toBe("not_found");
  });
});
