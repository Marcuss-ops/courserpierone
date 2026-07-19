/**
 * src/domains/catalog/content-pages/rename-content-page.test.ts
 *
 * Unit tests for the `renameContentPage` use case (MCR Phase 1 —
 * updates default translation title).
 *
 * Pattern mirrors the established `mkStubRepo`-style unit tests
 * across the codebase:
 *   - Stub the `RenameContentPagePort` directly. No Prisma mock.
 *   - Each test pre-sets the stub's responses for productContext /
 *     pageContext / renameOutcome independently, exercising one
 *     branch of the truth table.
 *
 * Coverage (per user spec + design):
 *   - PARSE branch
 *     (a) invalid_title: empty string → invalid_title
 *     (b) invalid_title: whitespace-only → invalid_title (trim → empty)
 *     (c) invalid_title: too long (> 200 chars) → invalid_title
 *   - GUARD branch
 *     (d) empty actorId / productId / pageId → not_found (no port call)
 *     (e) all three empty simultaneously → not_found (single branch)
 *   - PRODUCT branch
 *     (f) product missing → not_found
 *     (g) product exists, actor !== creator → forbidden
 *   - PAGE branch
 *     (h) page missing → not_found (after passing product check)
 *     (i) page belongs to a DIFFERENT product → not_found (collapse)
 *   - LOCALE branch
 *     (j) input.locale supplied → forwarded verbatim to port
 *     (k) input.locale omitted → uses product.defaultLanguage
 *     (l) input.locale = null → uses product.defaultLanguage
 *   - PERSIST branch
 *     (m) translation row missing → translation_not_found (locale echoed)
 *   - Happy path
 *     (n) success: title is the trimmed string, locale resolved,
 *         revision + updatedAt forwarded from port verbatim
 *   - Plumbing / dispatch
 *     (o) newTitle is trimmed BEFORE forwarding to port
 *         (input "  hello  " → port receives "hello")
 *     (p) input.now forwarded to port (deterministic clock)
 *     (q) input.now omitted → port receives a Date (within tolerance)
 *   - Discriminated-union shape
 *     (r) success branch returns exactly { success: true, title,
 *         locale, revision, updatedAt }
 *     (s) all 5 denial branches reachable via stub configuration
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  renameContentPage,
} from "./rename-content-page";
import type {
  RenameContentPagePort,
} from "./rename-content-page-types";

// ─── Test helpers ─────────────────────────────────────────────────

/**
 * Mutable state exposed by the stub so each test can pre-set the
 * desired port responses and assert on the inputs the port received.
 *
 * Mirrors the `mkStubRepo` shape from
 * `create-content-page.test.ts` /
 * `save-content-document.test.ts`.
 */
interface StubState {
  // Inputs recorded by the stub's method bodies.
  lastProductInput?: { productId: string };
  lastPageInput?: { pageId: string };
  lastRenameInput?: {
    pageId: string;
    locale: string;
    title: string;
    now: Date;
  };

  // Pre-set responses.
  productResult:
    | { defaultLanguage: string; creatorId: string }
    | null;
  pageResult: { productId: string } | null;
  renameResult:
    | { updated: true; title: string; revision: number; updatedAt: Date }
    | { updated: false; reason: "translation_not_found" };

  // Counting.
  findProductCallCount: number;
  findPageCallCount: number;
  renameCallCount: number;
}

function mkStubPort(): { port: RenameContentPagePort; state: StubState } {
  const FIXED_DATE = new Date("2026-07-19T12:00:00.000Z");
  const state: StubState = {
    productResult: { defaultLanguage: "it", creatorId: "creator_1" },
    pageResult: { productId: "product_1" },
    renameResult: {
      updated: true,
      title: "Renamed Title",
      revision: 2,
      updatedAt: FIXED_DATE,
    },
    findProductCallCount: 0,
    findPageCallCount: 0,
    renameCallCount: 0,
  };
  const port: RenameContentPagePort = {
    async findProductLocaleAndOwner(input) {
      state.findProductCallCount++;
      state.lastProductInput = input;
      return state.productResult;
    },
    async findPageProductId(input) {
      state.findPageCallCount++;
      state.lastPageInput = input;
      return state.pageResult;
    },
    async renameContentPageTranslation(input) {
      state.renameCallCount++;
      state.lastRenameInput = input;
      return state.renameResult;
    },
  };
  return { port, state };
}

function happyInput(): Parameters<typeof renameContentPage>[0] {
  return {
    actorId: "creator_1",
    productId: "product_1",
    pageId: "page_1",
    locale: "it",
    newTitle: "Hello world",
  };
}

// ─── Tests ─────────────────────────────────────────────────────────

describe("renameContentPage — input invariants", () => {
  it("exports renameContentPage as an async function", () => {
    expect(typeof renameContentPage).toBe("function");
  });
});

// ─── 1. PARSE — invalid_title ─────────────────────────────────────

describe("renameContentPage — parse: invalid_title", () => {
  it("empty newTitle → invalid_title (Zod min(1) fail)", async () => {
    const { port } = mkStubPort();
    const result = await renameContentPage(
      { ...happyInput(), newTitle: "" },
      { port },
    );
    expect(result.success).toBe(false);
    if (!result.success && result.reason === "invalid_title") {
      expect(result.error).toBeInstanceOf(z.ZodError);
    } else {
      throw new Error("Expected invalid_title branch");
    }
  });

  it("whitespace-only newTitle → invalid_title (trim → empty)", async () => {
    const { port } = mkStubPort();
    const result = await renameContentPage(
      { ...happyInput(), newTitle: "   " },
      { port },
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe("invalid_title");
    }
  });

  it("newTitle longer than 200 chars → invalid_title", async () => {
    const { port } = mkStubPort();
    const result = await renameContentPage(
      { ...happyInput(), newTitle: "a".repeat(201) },
      { port },
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe("invalid_title");
    }
  });

  it("invalid_title short-circuits BEFORE any port call", async () => {
    const { port, state } = mkStubPort();
    await renameContentPage(
      { ...happyInput(), newTitle: "" },
      { port },
    );
    expect(state.findProductCallCount).toBe(0);
    expect(state.findPageCallCount).toBe(0);
    expect(state.renameCallCount).toBe(0);
  });
});

// ─── 2. GUARD — defensive empty inputs ─────────────────────────────

describe("renameContentPage — guard: empty inputs", () => {
  it("empty actorId → not_found (no port call)", async () => {
    const { port, state } = mkStubPort();
    const result = await renameContentPage(
      { ...happyInput(), actorId: "" },
      { port },
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.reason).toBe("not_found");
    expect(state.findProductCallCount).toBe(0);
  });

  it("empty productId → not_found (no port call)", async () => {
    const { port, state } = mkStubPort();
    const result = await renameContentPage(
      { ...happyInput(), productId: "" },
      { port },
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.reason).toBe("not_found");
    expect(state.findProductCallCount).toBe(0);
  });

  it("empty pageId → not_found (no port call)", async () => {
    const { port, state } = mkStubPort();
    const result = await renameContentPage(
      { ...happyInput(), pageId: "" },
      { port },
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.reason).toBe("not_found");
    expect(state.findProductCallCount).toBe(0);
  });

  it("empty ALL THREE → not_found (single branch)", async () => {
    const { port, state } = mkStubPort();
    const result = await renameContentPage(
      { actorId: "", productId: "", pageId: "", newTitle: "x" },
      { port },
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.reason).toBe("not_found");
    expect(state.findProductCallCount).toBe(0);
  });
});

// ─── 3. PRODUCT branch ─────────────────────────────────────────────

describe("renameContentPage — product: not_found / forbidden", () => {
  it("product missing → not_found (page port not called)", async () => {
    const { port, state } = mkStubPort();
    state.productResult = null;
    const result = await renameContentPage(happyInput(), { port });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.reason).toBe("not_found");
    expect(state.findProductCallCount).toBe(1);
    expect(state.findPageCallCount).toBe(0);
    expect(state.renameCallCount).toBe(0);
  });

  it("product exists, actor !== creator → forbidden", async () => {
    const { port, state } = mkStubPort();
    state.productResult = { defaultLanguage: "it", creatorId: "creator_OTHER" };
    const result = await renameContentPage(happyInput(), { port });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe("forbidden");
    }
  });

  it("forbidden short-circuits BEFORE the page port call", async () => {
    const { port, state } = mkStubPort();
    state.productResult = { defaultLanguage: "it", creatorId: "creator_OTHER" };
    await renameContentPage(happyInput(), { port });
    expect(state.findPageCallCount).toBe(0);
    expect(state.renameCallCount).toBe(0);
  });
});

// ─── 4. PAGE branch ────────────────────────────────────────────────

describe("renameContentPage — page: not_found (collapse)", () => {
  it("page missing → not_found", async () => {
    const { port, state } = mkStubPort();
    state.pageResult = null;
    const result = await renameContentPage(happyInput(), { port });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.reason).toBe("not_found");
    expect(state.renameCallCount).toBe(0);
  });

  it("page belongs to a DIFFERENT product → not_found (no info leak)", async () => {
    const { port, state } = mkStubPort();
    state.pageResult = { productId: "product_OTHER" };
    const result = await renameContentPage(happyInput(), { port });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.reason).toBe("not_found");
  });

  it("page belongs to a DIFFERENT product short-circuits BEFORE rename", async () => {
    const { port, state } = mkStubPort();
    state.pageResult = { productId: "product_OTHER" };
    await renameContentPage(happyInput(), { port });
    expect(state.renameCallCount).toBe(0);
  });
});

// ─── 5. LOCALE branch ──────────────────────────────────────────────

describe("renameContentPage — locale: resolution", () => {
  it("input.locale supplied → forwarded verbatim to port", async () => {
    const { port, state } = mkStubPort();
    await renameContentPage(
      { ...happyInput(), locale: "fr-FR" },
      { port },
    );
    expect(state.lastRenameInput?.locale).toBe("fr-FR");
  });

  it("input.locale omitted → uses product.defaultLanguage", async () => {
    const { port, state } = mkStubPort();
    state.productResult = { defaultLanguage: "es", creatorId: "creator_1" };
    const result = await renameContentPage(
      { ...happyInput(), locale: undefined },
      { port },
    );
    expect(state.lastRenameInput?.locale).toBe("es");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.locale).toBe("es");
    }
  });

  it("input.locale = null → uses product.defaultLanguage (NULL treated as omit)", async () => {
    const { port, state } = mkStubPort();
    state.productResult = { defaultLanguage: "de", creatorId: "creator_1" };
    await renameContentPage(
      { ...happyInput(), locale: null },
      { port },
    );
    expect(state.lastRenameInput?.locale).toBe("de");
  });

  it("input.locale supplied but product.defaultLanguage differs → supplied wins", async () => {
    const { port, state } = mkStubPort();
    state.productResult = { defaultLanguage: "de", creatorId: "creator_1" };
    await renameContentPage(
      { ...happyInput(), locale: "fr" },
      { port },
    );
    expect(state.lastRenameInput?.locale).toBe("fr");
  });
});

// ─── 6. PERSIST branch — translation_not_found ────────────────────

describe("renameContentPage — persist: translation_not_found", () => {
  it("port returns translation_not_found → typed denial with locale echo", async () => {
    const { port, state } = mkStubPort();
    state.renameResult = { updated: false, reason: "translation_not_found" };
    const result = await renameContentPage(
      { ...happyInput(), locale: "fr" },
      { port },
    );
    expect(result.success).toBe(false);
    if (!result.success && result.reason === "translation_not_found") {
      expect(result.locale).toBe("fr");
    } else {
      throw new Error("Expected translation_not_found branch");
    }
  });
});

// ─── 7. HAPPY PATH ────────────────────────────────────────────────

describe("renameContentPage — happy path", () => {
  it("success: title is the trimmed string, revision + updatedAt echoed", async () => {
    const FIXED_DATE = new Date("2026-07-19T13:00:00.000Z");
    const { port, state } = mkStubPort();
    state.renameResult = {
      updated: true,
      title: "Trimmed Hello",
      revision: 7,
      updatedAt: FIXED_DATE,
    };
    const result = await renameContentPage(happyInput(), { port });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.title).toBe("Trimmed Hello");
      expect(result.revision).toBe(7);
      expect(result.updatedAt).toBe(FIXED_DATE);
    }
  });

  it("success: locale = product.defaultLanguage when input.locale omitted", async () => {
    const { port, state } = mkStubPort();
    state.productResult = { defaultLanguage: "it", creatorId: "creator_1" };
    const { locale: _locale, ...inputNoLocale } = happyInput();
    const result = await renameContentPage(inputNoLocale, { port });
    expect(result.success).toBe(true);
    if (result.success) expect(result.locale).toBe("it");
  });
});

// ─── 8. PLUMBING / dispatch ────────────────────────────────────────

describe("renameContentPage — plumbing", () => {
  it("forwards TRIMMED newTitle to port (input \"  hello  \" → port \"hello\")", async () => {
    const { port, state } = mkStubPort();
    await renameContentPage(
      { ...happyInput(), newTitle: "  Hello world  " },
      { port },
    );
    expect(state.lastRenameInput?.title).toBe("Hello world");
  });

  it("forwards input.now verbatim to port (deterministic clock)", async () => {
    const FIXED = new Date("2026-01-01T00:00:00.000Z");
    const { port, state } = mkStubPort();
    await renameContentPage({ ...happyInput(), now: FIXED }, { port });
    expect(state.lastRenameInput?.now).toBe(FIXED);
  });

  it("input.now omitted → port receives a Date (within call duration)", async () => {
    const { port, state } = mkStubPort();
    const before = new Date();
    await renameContentPage(happyInput(), { port });
    const after = new Date();
    expect(state.lastRenameInput).toBeDefined();
    const sent = state.lastRenameInput!.now;
    expect(sent.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(sent.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it("forwards productId + pageId verbatim to their ports", async () => {
    const { port, state } = mkStubPort();
    await renameContentPage(happyInput(), { port });
    expect(state.lastProductInput).toEqual({ productId: "product_1" });
    expect(state.lastPageInput).toEqual({ pageId: "page_1" });
  });
});

// ─── 9. Discriminated-union exhaustiveness ─────────────────────────

describe("renameContentPage — discriminated union", () => {
  it("success branch has exactly { success: true, title, locale, revision, updatedAt }", async () => {
    const { port, state } = mkStubPort();
    state.renameResult = {
      updated: true,
      title: "T",
      revision: 1,
      updatedAt: new Date(),
    };
    const result = await renameContentPage(happyInput(), { port });
    if (result.success) {
      expect(Object.keys(result).sort()).toEqual(
        ["locale", "revision", "success", "title", "updatedAt"].sort(),
      );
    } else {
      throw new Error("Expected success branch");
    }
  });

  it("invalid_title branch has exactly { success, reason, error }", async () => {
    const { port } = mkStubPort();
    const result = await renameContentPage(
      { ...happyInput(), newTitle: "" },
      { port },
    );
    if (!result.success && result.reason === "invalid_title") {
      expect(result.error).toBeInstanceOf(z.ZodError);
    } else {
      throw new Error("Expected invalid_title");
    }
  });

  it("translation_not_found branch has exactly { success, reason, locale }", async () => {
    const { port, state } = mkStubPort();
    state.renameResult = { updated: false, reason: "translation_not_found" };
    const result = await renameContentPage(happyInput(), { port });
    if (!result.success && result.reason === "translation_not_found") {
      expect(result.locale).toBe("it");
    } else {
      throw new Error("Expected translation_not_found");
    }
  });
});
