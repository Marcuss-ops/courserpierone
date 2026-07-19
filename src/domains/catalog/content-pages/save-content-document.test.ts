/**
 * src/domains/catalog/content-pages/save-content-document.test.ts
 *
 * Unit tests for the `saveContentDocument` use case (MCR Phase 1.5
 * — Notion-like pages feature, autosaver entry point).
 *
 * Pattern mirrors `src/lib/learning/watchlist.test.ts`:
 *   - Stub the `ContentPageTranslationRepository` port directly.
 *     No Prisma mock, no clock — `now` is injected as a Date.
 *   - Reproduction-via-identity: same fixture set → same outcome.
 *
 * Imports use canonical paths:
 *   - types + port    → ./save-content-document-types
 *   - use case body   → ./save-content-document
 *
 * Coverage:
 *   - Validation branches
 *     (a) schemaVersion wrong  → invalid_document (ZodError)
 *     (b) free HTML in text    → invalid_document
 *     (c) unsupported block    → invalid_document
 *   - Context branches
 *     (d) product missing      → not_found
 *     (e) page not in product  → not_found (no info leak)
 *     (f) caller not creator   → forbidden
 *   - Persist branches
 *     (g) conflict (DB ahead)  → conflict + currentRevision
 *     (h) happy update (rev 3 → 4) → success, rev returned
 *     (i) happy create (no row)   → success, revision = 1
 *   - Eager extraction
 *     (j) plainText computed from doc → port receives the
 *         `extractDocumentText` output verbatim
 *   - Input plumbing
 *     (k) `now` injection     → port receives the injected clock
 *     (l) `fallbackTitle`     → port receives trimmed fallback
 *     (m) `document` typed    → port receives the validated
 *         ContentDocumentV1 (NOT the raw `unknown`)
 *   - DoC invariants
 *     (n) `success: false` is returned for ALL denial branches;
 *         the port is NEVER called on soft validation/context
 *         failures (we short-circuit BEFORE the port call).
 */

import { describe, expect, it } from "vitest";

import {
  saveContentDocument,
  type SaveContentDocumentDeps,
  type SaveContentDocumentResult,
} from "./save-content-document";
import type {
  ContentPageTranslationRepository,
  UpsertTranslationDocInput,
  UpsertTranslationDocResult,
  FindProductAndPageContextResult,
} from "./save-content-document-types";
import type { ContentDocumentV1 } from "@/domains/catalog/blocks";

// ─── Test helpers ─────────────────────────────────────────────────

/**
 * Mutable state exposed by the stub so each test can pre-set the
 * desired port response and assert on the inputs it received.
 *
 * Mirrors the `mkStubRepo` shape from
 * `src/lib/learning/watchlist.test.ts`.
 */
interface StubState {
  // Inputs recorded by the stub's method bodies.
  lastContextInput?: { productId: string; pageId: string };
  lastUpsertInput?: UpsertTranslationDocInput;

  // Pre-set responses.
  contextResult: FindProductAndPageContextResult | null;
  upsertResult: UpsertTranslationDocResult;

  // Counting: ensures we assert no-write-on-deny.
  contextCallCount: number;
  upsertCallCount: number;
}

function mkStubRepo(): { repo: ContentPageTranslationRepository; state: StubState } {
  const state: StubState = {
    contextResult: {
      productCreatorId: "creator_1",
      pageExists: true,
    },
    upsertResult: {
      saved: true,
      revision: 2,
      updatedAt: new Date("2026-07-19T12:00:00.000Z"),
    },
    contextCallCount: 0,
    upsertCallCount: 0,
  };
  const repo: ContentPageTranslationRepository = {
    async findProductAndPageContext(input) {
      state.contextCallCount++;
      state.lastContextInput = input;
      return state.contextResult;
    },
    async upsertTranslationDoc(input) {
      state.upsertCallCount++;
      state.lastUpsertInput = input;
      return state.upsertResult;
    },
  };
  return { repo, state };
}

// ─── Fixtures ──────────────────────────────────────────────────────

const validDoc: ContentDocumentV1 = {
  schemaVersion: 1,
  blocks: [
    {
      id: "block_intro",
      type: "paragraph",
      props: {},
      content: [
        { type: "text", text: "Hello, " },
        { type: "text", text: "world!", marks: [{ type: "bold" }] },
      ],
    },
    {
      id: "block_h1",
      type: "heading",
      props: { level: 1 },
      content: [{ type: "text", text: "Welcome" }],
    },
  ],
};

const FIXED_NOW = new Date("2026-07-19T13:00:00.000Z");

function happyInput(): Parameters<typeof saveContentDocument>[0] {
  return {
    actorId: "creator_1",
    productId: "product_1",
    pageId: "page_1",
    locale: "it",
    expectedRevision: 1,
    document: validDoc,
    now: FIXED_NOW,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────

describe("saveContentDocument — input-shape invariants", () => {
  it("exports saveContentDocument as an async function", () => {
    expect(typeof saveContentDocument).toBe("function");
  });
});

// ─── 1. PARSE — validation branches ───────────────────────────────

describe("saveContentDocument — invalid_document (schema rejection)", () => {
  it("returns invalid_document for schemaVersion: 2", async () => {
    const { repo, state } = mkStubRepo();
    const input = {
      ...happyInput(),
      document: { schemaVersion: 2, blocks: [] },
    } as Parameters<typeof saveContentDocument>[0];
    const result = await saveContentDocument(input, { repo });
    expect(result.success).toBe(false);
    if (result.success === false && result.reason === "invalid_document") {
      expect(result.error).toBeDefined();
      expect(result.error.issues.length).toBeGreaterThan(0);
      // The ZodError carries the discriminator literal failure.
      // Zod 4 message: "Invalid input: expected 1" — Zod 3 was
      // "Invalid literal value, expected 1, received N". We match
      // all known variants to be version-stable.
      expect(result.error.issues[0]?.message).toMatch(
        /expected 1|Invalid input|Invalid literal/i,
      );
    } else {
      throw new Error("Expected invalid_document branch");
    }
    // Short-circuit: port MUST NOT be called when validation fails.
    expect(state.contextCallCount).toBe(0);
    expect(state.upsertCallCount).toBe(0);
  });

  it("returns invalid_document when an unsupported block type is supplied", async () => {
    const { repo, state } = mkStubRepo();
    const input = {
      ...happyInput(),
      document: {
        schemaVersion: 1,
        blocks: [
          { id: "bogus", type: "youtubeEmbed", props: {}, content: [] },
        ],
      },
    } as Parameters<typeof saveContentDocument>[0];
    const result = await saveContentDocument(input, { repo });
    expect(result.success).toBe(false);
    if (result.success === false && result.reason === "invalid_document") {
      expect(result.error).toBeDefined();
    } else {
      throw new Error("Expected invalid_document branch");
    }
    expect(state.contextCallCount).toBe(0);
    expect(state.upsertCallCount).toBe(0);
  });

  it("returns invalid_document when free HTML is detected in a paragraph", async () => {
    const { repo, state } = mkStubRepo();
    const input = {
      ...happyInput(),
      document: {
        schemaVersion: 1,
        blocks: [
          {
            id: "xss",
            type: "paragraph" as const,
            props: {},
            content: [{ type: "text" as const, text: "<script>alert(1)</script>" }],
          },
        ],
      },
    } as Parameters<typeof saveContentDocument>[0];
    const result = await saveContentDocument(input, { repo });
    expect(result.success).toBe(false);
    if (result.success === false && result.reason === "invalid_document") {
      // The free-HTML guard wraps its error in a synthetic ZodError
      // with the custom "Free HTML detected" message — verify.
      const messages = result.error.issues.map((i) => i.message).join(" | ");
      expect(messages).toMatch(/Free HTML/i);
    } else {
      throw new Error("Expected invalid_document branch");
    }
    expect(state.upsertCallCount).toBe(0);
  });

  it("rejects non-object payloads (null, undefined, string, number)", async () => {
    const { repo } = mkStubRepo();
    const negatives: unknown[] = [null, undefined, "not a doc", 42, true];
    for (const doc of negatives) {
      const result = await saveContentDocument(
        { ...happyInput(), document: doc },
        { repo },
      );
      expect(result.success).toBe(false);
      if (result.success === false) {
        expect(result.reason).toBe("invalid_document");
      }
    }
  });
});

// ─── 2. CONTEXT — existence + ownership ───────────────────────────

describe("saveContentDocument — not_found", () => {
  it("returns not_found when the product doesn't exist (contextResult === null)", async () => {
    const { repo, state } = mkStubRepo();
    state.contextResult = null;
    const result = await saveContentDocument(happyInput(), { repo });
    expect(result.success).toBe(false);
    if (result.success === false) {
      expect(result.reason).toBe("not_found");
    }
    // Port contract: when context returns null, we MUST NOT call
    // the upsert (defense; the use case can't enforce ownership
    // without a product lookup).
    expect(state.upsertCallCount).toBe(0);
  });

  it("returns not_found when the page doesn't belong to the product (defensive collapse)", async () => {
    const { repo, state } = mkStubRepo();
    state.contextResult = {
      productCreatorId: "creator_1",
      pageExists: false,
    };
    const result = await saveContentDocument(happyInput(), { repo });
    expect(result.success).toBe(false);
    if (result.success === false) {
      expect(result.reason).toBe("not_found");
    }
    expect(state.upsertCallCount).toBe(0);
  });
});

describe("saveContentDocument — forbidden", () => {
  it("returns forbidden when the actor is not the product's creator", async () => {
    const { repo, state } = mkStubRepo();
    state.contextResult = {
      productCreatorId: "creator_OTHER",
      pageExists: true,
    };
    const result = await saveContentDocument(happyInput(), { repo });
    expect(result.success).toBe(false);
    if (result.success === false) {
      expect(result.reason).toBe("forbidden");
    }
    expect(state.upsertCallCount).toBe(0);
  });
});

// ─── 3. PERSIST — conflict ────────────────────────────────────────

describe("saveContentDocument — conflict (optimistic concurrency)", () => {
  it("returns conflict + currentRevision when the port reports saved=false", async () => {
    const { repo, state } = mkStubRepo();
    state.upsertResult = { saved: false, currentRevision: 5 };
    const result = await saveContentDocument(
      {
        ...happyInput(),
        expectedRevision: 3,
      },
      { repo },
    );
    expect(result.success).toBe(false);
    if (result.success === false && result.reason === "conflict") {
      expect(result.currentRevision).toBe(5);
    } else {
      throw new Error("Expected conflict branch");
    }
  });

  it("treats expectedRevision=0 as 'first save' (does NOT skip the port call)", async () => {
    // expectedRevision=0 is the legitimate 'I never saw a row'
    // signal from the client — the port (adapter) is responsible
    // for normalizing this to a create-branch decision. The use
    // case just forwards the value.
    const { repo, state } = mkStubRepo();
    state.upsertResult = { saved: true, revision: 1, updatedAt: FIXED_NOW };
    const result = await saveContentDocument(
      { ...happyInput(), expectedRevision: 0 },
      { repo },
    );
    expect(result.success).toBe(true);
    expect(state.lastUpsertInput?.expectedRevision).toBe(0);
    expect(state.upsertCallCount).toBe(1);
  });
});

// ─── 4. PERSIST — happy paths ─────────────────────────────────────

describe("saveContentDocument — happy path (update existing)", () => {
  it("returns success + new revision + updatedAt on a successful update", async () => {
    const { repo, state } = mkStubRepo();
    state.upsertResult = {
      saved: true,
      revision: 7,
      updatedAt: new Date("2026-07-19T14:00:00.000Z"),
    };
    const result = await saveContentDocument(
      { ...happyInput(), expectedRevision: 6 },
      { repo },
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.revision).toBe(7);
      expect(result.updatedAt.toISOString()).toBe("2026-07-19T14:00:00.000Z");
    }
  });
});

describe("saveContentDocument — happy path (first save, no row)", () => {
  it("returns success + revision=1 when the adapter creates the row", async () => {
    const { repo, state } = mkStubRepo();
    state.upsertResult = {
      saved: true,
      revision: 1,
      updatedAt: FIXED_NOW,
    };
    const result = await saveContentDocument(
      { ...happyInput(), expectedRevision: 0 },
      { repo },
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.revision).toBe(1);
      expect(result.updatedAt).toEqual(FIXED_NOW);
    }
  });
});

// ─── 5. Eager plainText derivation ────────────────────────────────

describe("saveContentDocument — eager plainText", () => {
  it("computes plainText via extractDocumentText and forwards it to the port verbatim", async () => {
    const { repo, state } = mkStubRepo();
    await saveContentDocument(happyInput(), { repo });
    // exact string match against the documented extract behavior
    expect(state.lastUpsertInput?.plainText).toBe("Hello, world!\n\nWelcome");
  });

  it("forwards the VALIDATED document (not the raw unknown input)", async () => {
    const { repo, state } = mkStubRepo();
    await saveContentDocument(happyInput(), { repo });
    // The port receives a ContentDocumentV1, NOT the original
    // `unknown` payload. Confirms the use case's validation step
    // ran before the port call.
    expect(state.lastUpsertInput?.document).toEqual(validDoc);
  });
});

// ─── 6. Input plumbing ────────────────────────────────────────────

describe("saveContentDocument — input plumbing", () => {
  it("uses input.now when provided (deterministic clock)", async () => {
    const { repo, state } = mkStubRepo();
    await saveContentDocument(happyInput(), { repo });
    expect(state.lastUpsertInput?.now).toEqual(FIXED_NOW);
  });

  it("falls back to new Date() when input.now is omitted", async () => {
    const { repo, state } = mkStubRepo();
    const before = new Date();
    const result = await saveContentDocument(
      {
        ...happyInput(),
        now: undefined,
      },
      { repo },
    );
    const after = new Date();
    expect(result.success).toBe(true);
    // The port's recorded `now` MUST fall within [before, after].
    const portNow = state.lastUpsertInput?.now;
    expect(portNow).toBeDefined();
    if (portNow) {
      expect(portNow.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(portNow.getTime()).toBeLessThanOrEqual(after.getTime());
    }
  });

  it("forwards fallbackTitle to the port verbatim when provided", async () => {
    const { repo, state } = mkStubRepo();
    await saveContentDocument(
      { ...happyInput(), fallbackTitle: "My Page Title" },
      { repo },
    );
    expect(state.lastUpsertInput?.fallbackTitle).toBe("My Page Title");
  });

  it("defaults fallbackTitle to 'Untitled' when omitted", async () => {
    const { repo, state } = mkStubRepo();
    await saveContentDocument(happyInput(), { repo });
    expect(state.lastUpsertInput?.fallbackTitle).toBe("Untitled");
  });

  it("forwards productId, pageId, and locale to the context lookup", async () => {
    const { repo, state } = mkStubRepo();
    await saveContentDocument(happyInput(), { repo });
    expect(state.lastContextInput).toEqual({
      productId: "product_1",
      pageId: "page_1",
    });
    expect(state.lastUpsertInput?.pageId).toBe("page_1");
    expect(state.lastUpsertInput?.locale).toBe("it");
  });
});

// ─── 7. Shape-level invariants on the discriminated union ─────────

// ─── 7. Discriminator robustness (Zod-level — exhaustive on input shapes) ─

describe("saveContentDocument — discriminated-result shape", () => {
  it("compile-time exhaustiveness: the success branch carries revision + updatedAt", async () => {
    // The `success: true` branch is typed `{ revision: number, updatedAt: Date }`.
    // We verify the assignment compiles and that both fields are present.
    const { repo, state } = mkStubRepo();
    state.upsertResult = {
      saved: true,
      revision: 9,
      updatedAt: new Date("2026-07-19T15:00:00.000Z"),
    };
    const result = await saveContentDocument(
      { ...happyInput(), expectedRevision: 8 },
      { repo },
    );
    // Discriminator narrows: on `success: true`, `revision` and `updatedAt`
    // are guaranteed non-undefined at the type level.
    if (result.success) {
      const _revision: number = result.revision;
      const _updatedAt: Date = result.updatedAt;
      expect(_revision).toBe(9);
      expect(_updatedAt.toISOString()).toBe("2026-07-19T15:00:00.000Z");
    } else {
      throw new Error("Expected success branch — got " + result.reason);
    }
  });

  it("compile-time exhaustiveness: the conflict branch carries currentRevision", async () => {
    // The `success: false` branch with reason:"conflict" is typed
    // `{ reason: "conflict", currentRevision: number }`. We verify the
    // narrowing works at the type level.
    const { repo, state } = mkStubRepo();
    state.upsertResult = { saved: false, currentRevision: 42 };
    const result = await saveContentDocument(
      { ...happyInput(), expectedRevision: 41 },
      { repo },
    );
    if (!result.success && result.reason === "conflict") {
      const _current: number = result.currentRevision;
      expect(_current).toBe(42);
    } else {
      throw new Error("Expected conflict branch");
    }
  });
});
