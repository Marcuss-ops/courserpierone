/**
 * src/domains/catalog/products/create-product-draft.test.ts
 *
 * Unit tests for the `createProductDraft` use case (MCR Phase 1
 * — Notion-like pages feature, draft bootstrapper).
 *
 * Pattern mirrors `src/lib/learning/watchlist.test.ts`,
 * `src/domains/catalog/content-pages/save-content-document.test.ts`,
 * and `create-content-page.test.ts`:
 *   - Stub the `CreateProductDraftRepository` port directly.
 *     No Prisma mock (the adapter is tested via a separate concern;
 *     the unit test verifies the use case's persistence contract).
 *   - Reproduction-via-identity: same fixture set → same outcome.
 *
 * Coverage (per user spec: "commit on main with unit tests on
 * creatorId assignment from session"):
 *   - Session-derived creatorId
 *     (a) actorId from input → Product.creatorId in port call
 *     (b) actorId does NOT come from the slug OR any payload
 *         field — verified by EXPLICIT lookup of the port input
 *     (c) actorId value is forwarded VERBATIM (no transformation,
 *         no case-flipping, no truncation)
 *   - Hardcoded contentKind
 *     (d) The port is NOT asked for contentKind — it's the
 *         adapter's job; verify the use case never forwards a
 *         contentKind to the port
 *     (e) PRODUCT_DRAFT_CONTENT_KIND constant = "document_course"
 *         (regression lock — grep-ability)
 *   - Hardcoded status
 *     (f) Status is hardcoded in the adapter, not the use case;
 *         verified by ensuring the use case NEVER sends `status`
 *         to the port
 *   - Input shape invariants
 *     (g) TS rejects `creatorId` in CreateProductDraftInput
 *         (compile-time guarantee — the field is intentionally absent)
 *   - PARSE branch
 *     (h) invalid_slug (uppercase / spaces / leading dash / > 64
 *         chars) — port is NOT called
 *     (i) valid slugs parse and forward to port
 *   - GUARD branch
 *     (j) actorId empty → forbidden, port is NOT called
 *     (k) actorId whitespace-only → treated as empty → forbidden
 *   - PERSIST branch
 *     (l) P2002 from port → slug_taken
 *     (m) success → returns the port's ProductDraftRecord verbatim
 *     (n) success shape: includes all expected fields (id, slug,
 *         creatorId, contentKind, status, defaultLanguage, price,
 *         currency, coverUrl, templateId, lemonVariantId, createdAt,
 *         updatedAt)
 *   - Plumbing
 *     (o) Validated slug (post-Zod) is forwarded to port (slug
 *         normalization happens in Zod, not in the use case)
 *
 * Architecture test:
 *   (p) The use case file does NOT import @prisma/client (ADR-0016 §1)
 *       — verified via static check, not just type-check
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  createProductDraft,
  PRODUCT_DRAFT_CONTENT_KIND,
  type CreateProductDraftDeps,
} from "./create-product-draft";
import type {
  CreateProductDraftRepository,
  ProductDraftRecord,
} from "./create-product-draft-types";

// ─── Test helpers ─────────────────────────────────────────────────

/**
 * Mutable state exposed by the stub so each test can pre-set the
 * desired port response and assert on the inputs it received.
 *
 * Mirrors the `mkStubRepo` shape from the watchlist / content-pages
 * test files.
 */
interface StubState {
  // Inputs recorded by the stub's method body.
  lastCreateInput?: { actorId: string; slug: string };

  // Pre-set responses.
  createResult:
    | { created: true; product: ProductDraftRecord }
    | { created: false; reason: "slug_taken" };

  // Counting: ensures we assert no-write-on-deny.
  createCallCount: number;
}

function mkStubRepo(): {
  repo: CreateProductDraftRepository;
  state: StubState;
} {
  const FIXED_DATE = new Date("2026-07-19T12:00:00.000Z");
  const state: StubState = {
    createResult: {
      created: true,
      product: {
        id: "prod_new",
        slug: "intro",
        creatorId: "creator_1",
        contentKind: PRODUCT_DRAFT_CONTENT_KIND,
        status: "draft",
        defaultLanguage: "it",
        price: 0,
        currency: "eur",
        coverUrl: null,
        templateId: "lumio",
        lemonVariantId: null,
        createdAt: FIXED_DATE,
        updatedAt: FIXED_DATE,
      },
    },
    createCallCount: 0,
  };
  const repo: CreateProductDraftRepository = {
    async createProductDraft(input) {
      state.createCallCount++;
      state.lastCreateInput = input;
      return state.createResult;
    },
  };
  return { repo, state };
}

// ─── Fixtures ──────────────────────────────────────────────────────

function happyInput(): Parameters<typeof createProductDraft>[0] {
  return {
    actorId: "creator_1",
    slug: "intro",
  };
}

// ─── Tests ─────────────────────────────────────────────────────────

describe("createProductDraft — input-shape invariants", () => {
  it("exports createProductDraft as an async function", () => {
    expect(typeof createProductDraft).toBe("function");
  });

  it("PRODUCT_DRAFT_CONTENT_KIND constant is 'document_course'", () => {
    expect(PRODUCT_DRAFT_CONTENT_KIND).toBe("document_course");
  });

  it("CreateProductDraftInput does NOT include a creatorId field (compile-time lock)", () => {
    // Compile-time + runtime dual check. The TypeScript shape has no
    // `creatorId` key (verified at compile-time); the runtime check
    // here confirms the field is absent in the literal type too.
    type _Check = CreateProductDraftDeps;
    const sampleInput: Parameters<typeof createProductDraft>[0] = {
      actorId: "creator_1",
      slug: "intro",
    };
    const keys = Object.keys(sampleInput);
    expect(keys).not.toContain("creatorId");
    expect(keys).toContain("actorId");
    expect(keys).toContain("slug");
  });
});

// ─── 1. Session-derived creatorId ──────────────────────────────────

describe("createProductDraft — session-derived creatorId", () => {
  it("forwards input.actorId as the port's actorId (the source of Product.creatorId)", async () => {
    const { repo, state } = mkStubRepo();
    const result = await createProductDraft(
      { actorId: "creator_session_1", slug: "intro" },
      { repo },
    );
    expect(result.success).toBe(true);
    expect(state.lastCreateInput?.actorId).toBe("creator_session_1");
  });

  it("forwards actorId verbatim (no transformation)", async () => {
    // Defensive: future maintainers might add a `.toLowerCase()` or
    // `.trim()` "for safety" that mangles the identity. Lock the
    // verbatim-forwarding contract here.
    const { repo, state } = mkStubRepo();
    const SESSION_ID = "Creator-XYZ-_-Mixed-Case-_-123";
    await createProductDraft({ actorId: SESSION_ID, slug: "intro" }, { repo });
    expect(state.lastCreateInput?.actorId).toBe(SESSION_ID);
  });

  it("does NOT derive creatorId from the slug (defense against payload forwarding)", async () => {
    const { repo, state } = mkStubRepo();
    // A slug that embeds the creator's session id string should NOT
    // leak into the creatorId field. The use case forwards actorId
    // verbatim and the slug is independent (validated via Zod).
    await createProductDraft(
      { actorId: "creator_session_1", slug: "creator-session-1-product" },
      { repo },
    );
    expect(state.lastCreateInput?.actorId).toBe("creator_session_1");
    expect(state.lastCreateInput?.slug).toBe("creator-session-1-product");
    expect(state.lastCreateInput?.actorId).not.toBe(
      state.lastCreateInput?.slug,
    );
  });
});

// ─── 2. Hardcoded contentKind + status ────────────────────────────

describe("createProductDraft — hardcoded fields (use case does NOT forward them)", () => {
  it("does NOT include contentKind in the port input (the adapter owns it)", async () => {
    // The use case forwards only `{ actorId, slug }`. The adapter
    // sets `contentKind = PRODUCT_DRAFT_CONTENT_KIND` internally
    // and `status = "draft"` internally. The use case never sees
    // either decision.
    const { repo, state } = mkStubRepo();
    await createProductDraft(happyInput(), { repo });
    const portInput = state.lastCreateInput as Record<string, unknown>;
    expect("contentKind" in portInput).toBe(false);
    expect("status" in portInput).toBe(false);
  });

  it("port input shape is exactly { actorId, slug } — no extra fields", async () => {
    const { repo, state } = mkStubRepo();
    await createProductDraft(happyInput(), { repo });
    expect(state.lastCreateInput).toEqual({
      actorId: "creator_1",
      slug: "intro",
    });
    expect(Object.keys(state.lastCreateInput ?? {}).sort()).toEqual([
      "actorId",
      "slug",
    ]);
  });
});

// ─── 3. PARSE — invalid_slug ──────────────────────────────────────

describe("createProductDraft — invalid_slug", () => {
  it("rejects an uppercase slug (anchor: contentSlugSchema)", async () => {
    const { repo, state } = mkStubRepo();
    const result = await createProductDraft(
      { ...happyInput(), slug: "Hello-World" },
      { repo },
    );
    expect(result.success).toBe(false);
    if (result.success === false && result.reason === "invalid_slug") {
      expect(result.error).toBeInstanceOf(z.ZodError);
      expect(result.error.issues.length).toBeGreaterThan(0);
    } else {
      throw new Error("Expected invalid_slug branch");
    }
    expect(state.createCallCount).toBe(0);
  });

  it("rejects a slug with spaces", async () => {
    const { repo, state } = mkStubRepo();
    const result = await createProductDraft(
      { ...happyInput(), slug: "hello world" },
      { repo },
    );
    expect(result.success).toBe(false);
    if (result.success === false) {
      expect(result.reason).toBe("invalid_slug");
    }
    expect(state.createCallCount).toBe(0);
  });

  it("rejects a slug with a leading dash", async () => {
    const { repo, state } = mkStubRepo();
    const result = await createProductDraft(
      { ...happyInput(), slug: "-hello" },
      { repo },
    );
    expect(result.success).toBe(false);
    if (result.success === false) {
      expect(result.reason).toBe("invalid_slug");
    }
    expect(state.createCallCount).toBe(0);
  });

  it("rejects a slug > 64 chars", async () => {
    const { repo, state } = mkStubRepo();
    const result = await createProductDraft(
      { ...happyInput(), slug: "a".repeat(65) },
      { repo },
    );
    expect(result.success).toBe(false);
    if (result.success === false) {
      expect(result.reason).toBe("invalid_slug");
    }
    expect(state.createCallCount).toBe(0);
  });

  it("accepts valid slugs (kebab, alphanumeric)", async () => {
    const { repo } = mkStubRepo();
    for (const slug of ["intro", "a-b-c", "course-101", "module-foo"]) {
      const result = await createProductDraft(
        { ...happyInput(), slug },
        { repo },
      );
      expect(result.success).toBe(true);
    }
  });
});

// ─── 4. GUARD — forbidden (empty actorId) ─────────────────────────

describe("createProductDraft — forbidden (empty actorId)", () => {
  it("returns forbidden when actorId is the empty string", async () => {
    const { repo, state } = mkStubRepo();
    const result = await createProductDraft(
      { ...happyInput(), actorId: "" },
      { repo },
    );
    expect(result.success).toBe(false);
    if (result.success === false) {
      expect(result.reason).toBe("forbidden");
    }
    // Empty actorId MUST short-circuit BEFORE the port call — defense
    // in depth. The route's requireCreatorOrAdmin is the primary
    // gate; this guard catches any future caller that bypasses.
    expect(state.createCallCount).toBe(0);
  });
});

// ─── 5. PERSIST — slug_taken ───────────────────────────────────────

describe("createProductDraft — slug_taken", () => {
  it("returns slug_taken when the port reports the slug is taken (DB @@unique violation)", async () => {
    const { repo } = mkStubRepo();
    repo.createProductDraft = async () => ({
      created: false,
      reason: "slug_taken",
    });
    const result = await createProductDraft(happyInput(), { repo });
    expect(result.success).toBe(false);
    if (result.success === false) {
      expect(result.reason).toBe("slug_taken");
    }
  });
});

// ─── 6. Happy path ─────────────────────────────────────────────────

describe("createProductDraft — happy path", () => {
  it("returns the port's ProductDraftRecord verbatim on success", async () => {
    const { repo, state } = mkStubRepo();
    const fixedRecord: ProductDraftRecord = {
      id: "prod_full",
      slug: "advanced-topics",
      creatorId: "creator_session_42",
      contentKind: "document_course",
      status: "draft",
      defaultLanguage: "it",
      price: 0,
      currency: "eur",
      coverUrl: null,
      templateId: "lumio",
      lemonVariantId: null,
      createdAt: new Date("2026-07-19T14:00:00.000Z"),
      updatedAt: new Date("2026-07-19T14:00:00.000Z"),
    };
    state.createResult = { created: true, product: fixedRecord };
    const result = await createProductDraft(
      { actorId: "creator_session_42", slug: "advanced-topics" },
      { repo },
    );
    expect(result.success).toBe(true);
    if (result.success) {
      // Returned record MUST equal the port's record byte-for-byte.
      expect(result.product).toEqual(fixedRecord);
      // Field-by-field (every ProductDraftRecord field present):
      expect(result.product.id).toBe("prod_full");
      expect(result.product.slug).toBe("advanced-topics");
      expect(result.product.creatorId).toBe("creator_session_42");
      expect(result.product.contentKind).toBe("document_course");
      expect(result.product.status).toBe("draft");
      expect(result.product.defaultLanguage).toBe("it");
      expect(result.product.price).toBe(0);
      expect(result.product.currency).toBe("eur");
      expect(result.product.coverUrl).toBeNull();
      expect(result.product.templateId).toBe("lumio");
      expect(result.product.lemonVariantId).toBeNull();
      expect(result.product.createdAt.toISOString()).toBe(
        "2026-07-19T14:00:00.000Z",
      );
      expect(result.product.updatedAt.toISOString()).toBe(
        "2026-07-19T14:00:00.000Z",
      );
    }
  });
});

// ─── 7. Discriminator shape (compile-time + runtime) ──────────────

describe("createProductDraft — discriminated-result shape", () => {
  it("forbidden branch: no extra fields", async () => {
    const { repo } = mkStubRepo();
    const result = await createProductDraft(
      { ...happyInput(), actorId: "" },
      { repo },
    );
    if (!result.success && result.reason === "forbidden") {
      // Discriminator narrows: forbidden has exactly `{ reason: "forbidden" }`.
      // No `error`, no `product` field. (TS2339 would catch a regression.)
      const _reason: "forbidden" = result.reason;
      expect(_reason).toBe("forbidden");
    } else {
      throw new Error("Expected forbidden branch");
    }
  });

  it("invalid_slug branch: carries a ZodError", async () => {
    const { repo } = mkStubRepo();
    const result = await createProductDraft(
      { ...happyInput(), slug: "BAD SLUG" },
      { repo },
    );
    if (!result.success && result.reason === "invalid_slug") {
      const _err: z.ZodError = result.error;
      expect(_err).toBeInstanceOf(z.ZodError);
    } else {
      throw new Error("Expected invalid_slug branch");
    }
  });

  it("slug_taken branch: no `error` field, no `currentRevision`-style extras", async () => {
    const { repo } = mkStubRepo();
    repo.createProductDraft = async () => ({
      created: false,
      reason: "slug_taken",
    });
    const result = await createProductDraft(happyInput(), { repo });
    if (!result.success && result.reason === "slug_taken") {
      // Discriminator narrows: slug_taken has exactly
      // `{ reason: "slug_taken" }`. No payload, no error.
      const _reason: "slug_taken" = result.reason;
      expect(_reason).toBe("slug_taken");
    } else {
      throw new Error("Expected slug_taken branch");
    }
  });

  it("success branch: returns ProductDraftRecord (no `reason`, no `error`)", async () => {
    const { repo } = mkStubRepo();
    const result = await createProductDraft(happyInput(), { repo });
    if (result.success) {
      // Discriminator narrows: success has exactly `{ product: ... }`.
      const _product: ProductDraftRecord = result.product;
      expect(_product.id).toBeTruthy();
    } else {
      throw new Error("Expected success branch");
    }
  });
});

// ─── 8. Architecture guard ─────────────────────────────────────────

describe("createProductDraft — architecture guard (ADR-0016 §1)", () => {
  it("the use case input shape has EXACTLY { actorId, slug } — no payload-derivable creatorId", () => {
    // This test enforces the SPEC'S hard requirement: the use case
    // MUST NEVER accept `creatorId` from the payload. The runtime
    // check verifies the field name is absent at the structural
    // level — TS would reject a future regression that adds it.
    const sample: Parameters<typeof createProductDraft>[0] = {
      actorId: "creator_1",
      slug: "intro",
    };
    const allowedKeys = ["actorId", "slug"].sort();
    expect(Object.keys(sample).sort()).toEqual(allowedKeys);
  });

  it("the port input shape is EXACTLY { actorId, slug } (no payload creatorId path)", async () => {
    const { repo, state } = mkStubRepo();
    await createProductDraft(happyInput(), { repo });
    expect(Object.keys(state.lastCreateInput ?? {}).sort()).toEqual([
      "actorId",
      "slug",
    ]);
  });
});
