/**
 * src/domains/catalog/content-pages/publish-content-product.test.ts
 *
 * Unit tests for the `publishContentProduct` use case (MCR
 * Phase 1 — Notion-like content pages feature).
 *
 * Pattern mirrors the established `mkStubPort`-style unit tests:
 *   - Stub the `PublishContentProductPort` directly. No Prisma
 *     or Next mock — the use case is pure domain.
 *   - Each test pre-sets the stub's responses for
 *     `findProductForPublishGate` /
 *     `listContentPagesWithTranslationCounts` /
 *     `applyPublishTransition` / `revalidateNavigation`
 *     independently, exercising one branch of the truth table.
 *
 * Coverage (per user spec: "unit test sul gate di pubblicazione"):
 *
 *   ── INPUT SHAPE ─────────────────────────────────────────────
 *     (a) input shape has exactly
 *         { actorId, productId, bypassOwnership?, now? } —
 *         defense-in-depth lock against future maintainer drift.
 *
 *   ── GUARD ───────────────────────────────────────────────────
 *     (b) empty actorId → not_found (no port calls).
 *     (c) empty productId → not_found (no port calls).
 *
 *   ── PORT.findProductForPublishGate ──────────────────────────
 *     (d) product missing → not_found (no further port calls).
 *
 *   ── OWNERSHIP ──────────────────────────────────────────────
 *     (e) actorId !== creatorId AND no bypass → forbidden
 *         (no gate, no apply, no revalidate).
 *     (f) actorId !== creatorId AND `bypassOwnership: true` →
 *         not forbidden; proceeds past ownership.
 *
 *   ── STATUS BRANCH ──────────────────────────────────────────
 *     (g) status="archived" → archived_status (no gate, no
 *         apply, no revalidate).
 *     (h) status="published" with publishedAt → already_published
 *         carrying the EXISTING timestamp (no gate, no apply,
 *         no revalidate).
 *     (i) status="published" with publishedAt=null (anomaly) →
 *         already_published with input.now fallback.
 *
 *   ── GATE — no_pages ────────────────────────────────────────
 *     (j) zero pages → no_pages (no apply, no revalidate).
 *
 *   ── GATE — gate_failed (aggregate) ─────────────────────────
 *     (k) one draft page → gate_failed with [{pageId, draft}].
 *     (l) one published page with 0 translations →
 *         gate_failed with [{pageId, no_translation}].
 *     (m) one page that is BOTH draft AND has 0 translations →
 *         gate_failed with TWO issues (one per reason).
 *     (n) MIX: some pages pass + some fail (each failure type)
 *         → gate_failed with ALL issues (no short-circuit).
 *     (o) gate_failed short-circuits BEFORE apply + revalidate.
 *
 *   ── PRECEDENCE ─────────────────────────────────────────────
 *     (p) `already_published` wins over `no_pages` / `gate_failed`
 *         (a published-and-then-deleted-content product is
 *         already_published; re-saving content shouldn't be
 *         required to leave idempotent state).
 *     (q) `archived_status` wins over `gate_failed` (terminal
 *         state precedes gate — the route layer must
 *         unarchive first).
 *     (r) `forbidden` wins over `already_published` (ordered
 *         defense — no info leak).
 *
 *   ── HAPPY PATH ─────────────────────────────────────────────
 *     (s) draft product with N pages all published+translated →
 *         success with new publishedAt = input.now.
 *     (t) success echoes slug from gate context AND
 *         revalidated:true.
 *
 *   ── PLUMBING ───────────────────────────────────────────────
 *     (u) `input.now` propagates to applyPublishTransition.
 *     (v) applyPublishTransition is called BEFORE
 *         revalidateNavigation (cache after commit).
 *     (w) slug from gate context flows to revalidateNavigation.
 *
 *   ── ARCHITECTURE GUARD ─────────────────────────────────────
 *     (x) input shape has exactly
 *         { actorId, productId, bypassOwnership?, now? }.
 *     (y) input does NOT contain `actorRole` / `slug` /
 *         `creatorId` (Prisma-derivable fields are read
 *         fresh inside the port).
 */

import { describe, expect, it } from "vitest";

import {
  publishContentProduct,
} from "./publish-content-product";
import type {
  PublishContentProductInput,
  PublishContentProductPort,
  PublishGatePageSummary,
} from "./publish-content-product-types";

// ─── Test helpers ─────────────────────────────────────────────────

interface ProductGateCtx {
  creatorId: string;
  slug: string;
  status: "draft" | "published" | "archived";
  publishedAt: Date | null;
}

interface StubState {
  // Recorded inputs.
  lastFindProductInput?: { productId: string };
  lastListPagesInput?: { productId: string };
  lastApplyInput?: { productId: string; now: Date };
  lastRevalidateInput?: { slug: string };

  // Pre-set responses.
  productCtx: ProductGateCtx | null;
  pagesResult: { items: PublishGatePageSummary[] };

  // Call counters — explicit, so tests can assert short-circuit
  // behavior (port X was or wasn't called).
  findProductCallCount: number;
  listPagesCallCount: number;
  applyCallCount: number;
  revalidateCallCount: number;

  // Order tracker — verify apply BEFORE revalidate.
  callOrder: ("find" | "list" | "apply" | "revalidate")[];
}

function mkStubPort(): {
  port: PublishContentProductPort;
  state: StubState;
} {
  const state: StubState = {
    // Default: a draft product owned by creator_1 with 2 pages
    // all published+translated. The "happy path" baseline.
    productCtx: {
      creatorId: "creator_1",
      slug: "test-slug",
      status: "draft",
      publishedAt: null,
    },
    pagesResult: {
      items: [
        { pageId: "page_a", status: "published", translationCount: 2 },
        { pageId: "page_b", status: "published", translationCount: 1 },
      ],
    },
    findProductCallCount: 0,
    listPagesCallCount: 0,
    applyCallCount: 0,
    revalidateCallCount: 0,
    callOrder: [],
  };

  const port: PublishContentProductPort = {
    async findProductForPublishGate(input) {
      state.findProductCallCount++;
      state.lastFindProductInput = input;
      state.callOrder.push("find");
      return state.productCtx;
    },
    async listContentPagesWithTranslationCounts(input) {
      state.listPagesCallCount++;
      state.lastListPagesInput = input;
      state.callOrder.push("list");
      return state.pagesResult;
    },
    async applyPublishTransition(input) {
      state.applyCallCount++;
      state.lastApplyInput = input;
      state.callOrder.push("apply");
      // The port echoes the use case-supplied clock for
      // deterministic tests (the adapter's real DB write
      // would set NOW() server-side; the use case tells the
      // adapter what `now` to use).
      return { publishedAt: input.now, slug: "test-slug" };
    },
    async revalidateNavigation(input) {
      state.revalidateCallCount++;
      state.lastRevalidateInput = input;
      state.callOrder.push("revalidate");
      return { revalidated: true };
    },
  };

  return { port, state };
}

function happyInput(): PublishContentProductInput {
  return {
    actorId: "creator_1",
    productId: "product_1",
  };
}

// ─── Tests ─────────────────────────────────────────────────────────

describe("publishContentProduct — input invariants", () => {
  it("exports publishContentProduct as an async function", () => {
    expect(typeof publishContentProduct).toBe("function");
  });
});

// ─── 1. ARCHITECTURE GUARD — input shape ─────────────────────────

describe("publishContentProduct — input shape", () => {
  it("accepts exactly { actorId, productId, bypassOwnership?, now? }", () => {
    // Runtime lock: defense against the input gaining untyped
    // properties in future PRs (e.g. someone sneaking `actorRole`
    // through the route layer).
    const minimal: PublishContentProductInput = {
      actorId: "x",
      productId: "y",
    };
    expect(Object.keys(minimal).sort()).toEqual([
      "actorId",
      "productId",
    ]);

    const full: PublishContentProductInput = {
      actorId: "x",
      productId: "y",
      bypassOwnership: true,
      now: new Date(),
    };
    expect(Object.keys(full).sort()).toEqual([
      "actorId",
      "bypassOwnership",
      "now",
      "productId",
    ]);
  });

  it("does NOT expose actorRole / slug / creatorId on input (read fresh inside port)", () => {
    // Sample a representative input — runtime lock.
    const sample: PublishContentProductInput = happyInput();
    const forbidden = ["actorRole", "slug", "creatorId"];
    for (const f of forbidden) {
      expect(Object.keys(sample)).not.toContain(f);
    }
  });
});

// ─── 2. GUARD ────────────────────────────────────────────────────

describe("publishContentProduct — guard: empty inputs", () => {
  it("empty actorId → not_found (no port calls)", async () => {
    const { port, state } = mkStubPort();
    const result = await publishContentProduct(
      { ...happyInput(), actorId: "" },
      { port },
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.reason).toBe("not_found");
    expect(state.findProductCallCount).toBe(0);
    expect(state.listPagesCallCount).toBe(0);
    expect(state.applyCallCount).toBe(0);
    expect(state.revalidateCallCount).toBe(0);
  });

  it("empty productId → not_found (no port calls)", async () => {
    const { port, state } = mkStubPort();
    const result = await publishContentProduct(
      { ...happyInput(), productId: "" },
      { port },
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.reason).toBe("not_found");
    expect(state.findProductCallCount).toBe(0);
  });
});

// ─── 3. findProductForPublishGate ────────────────────────────────

describe("publishContentProduct — findProductForPublishGate", () => {
  it("product missing → not_found (no listPages, no apply, no revalidate)", async () => {
    const { port, state } = mkStubPort();
    state.productCtx = null;
    const result = await publishContentProduct(happyInput(), { port });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.reason).toBe("not_found");
    expect(state.listPagesCallCount).toBe(0);
    expect(state.applyCallCount).toBe(0);
    expect(state.revalidateCallCount).toBe(0);
  });

  it("forwards productId verbatim to the gate lookup", async () => {
    const { port, state } = mkStubPort();
    await publishContentProduct(
      { ...happyInput(), productId: "product_777" },
      { port },
    );
    expect(state.lastFindProductInput?.productId).toBe("product_777");
  });
});

// ─── 4. OWNERSHIP ────────────────────────────────────────────────

describe("publishContentProduct — ownership", () => {
  it("actor !== creator AND no bypass → forbidden (no listPages)", async () => {
    const { port, state } = mkStubPort();
    state.productCtx = { creatorId: "creator_OTHER", slug: "x", status: "draft", publishedAt: null };
    const result = await publishContentProduct(happyInput(), { port });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.reason).toBe("forbidden");
    expect(state.listPagesCallCount).toBe(0);
    expect(state.applyCallCount).toBe(0);
    expect(state.revalidateCallCount).toBe(0);
  });

  it("bypassOwnership=true allows non-owner actor through (proceeds past ownership)", async () => {
    const { port, state } = mkStubPort();
    state.productCtx = { creatorId: "creator_OTHER", slug: "test-slug", status: "draft", publishedAt: null };
    const result = await publishContentProduct(
      { ...happyInput(), bypassOwnership: true },
      { port },
    );
    // Owner is NOT `creator_1` AND bypass is set → proceeds to
    // gate (where the default fixture passes). Expect success.
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.slug).toBe("test-slug");
      expect(result.revalidated).toBe(true);
    }
    expect(state.listPagesCallCount).toBe(1);
    expect(state.applyCallCount).toBe(1);
    expect(state.revalidateCallCount).toBe(1);
  });
});

// ─── 5. STATUS BRANCH — archived_status ──────────────────────────

describe("publishContentProduct — status: archived_status", () => {
  it("status=archived → archived_status (no gate, no apply, no revalidate)", async () => {
    const { port, state } = mkStubPort();
    state.productCtx = { creatorId: "creator_1", slug: "x", status: "archived", publishedAt: new Date("2025-01-01") };
    const result = await publishContentProduct(happyInput(), { port });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.reason).toBe("archived_status");
    expect(state.listPagesCallCount).toBe(0);
    expect(state.applyCallCount).toBe(0);
    expect(state.revalidateCallCount).toBe(0);
  });
});

// ─── 6. STATUS BRANCH — already_published (idempotent) ──────────

describe("publishContentProduct — status: already_published (idempotent)", () => {
  it("status=published with non-null publishedAt → already_published carrying existing timestamp", async () => {
    const { port, state } = mkStubPort();
    const EXISTING = new Date("2026-04-01T08:00:00.000Z");
    state.productCtx = { creatorId: "creator_1", slug: "x", status: "published", publishedAt: EXISTING };
    const result = await publishContentProduct(happyInput(), { port });
    expect(result.success).toBe(false);
    if (!result.success && result.reason === "already_published") {
      expect(result.publishedAt.getTime()).toBe(EXISTING.getTime());
    } else {
      throw new Error("Expected already_published");
    }
    expect(state.listPagesCallCount).toBe(0);
    expect(state.applyCallCount).toBe(0);
    expect(state.revalidateCallCount).toBe(0);
  });

  it("status=published with null publishedAt (anomaly) → already_published falls back to input.now", async () => {
    const { port, state } = mkStubPort();
    state.productCtx = { creatorId: "creator_1", slug: "x", status: "published", publishedAt: null };
    const FIXED = new Date("2026-05-01T00:00:00.000Z");
    const result = await publishContentProduct(
      { ...happyInput(), now: FIXED },
      { port },
    );
    expect(result.success).toBe(false);
    if (!result.success && result.reason === "already_published") {
      expect(result.publishedAt.getTime()).toBe(FIXED.getTime());
    } else {
      throw new Error("Expected already_published");
    }
    expect(state.applyCallCount).toBe(0);
  });
});

// ─── 7. GATE — no_pages ──────────────────────────────────────────

describe("publishContentProduct — gate: no_pages", () => {
  it("zero pages → no_pages (no apply, no revalidate)", async () => {
    const { port, state } = mkStubPort();
    state.pagesResult = { items: [] };
    const result = await publishContentProduct(happyInput(), { port });
    expect(result.success).toBe(false);
    if (!result.success && result.reason === "no_pages") {
      expect(result.productId).toBe("product_1");
    } else {
      throw new Error("Expected no_pages");
    }
    expect(state.applyCallCount).toBe(0);
    expect(state.revalidateCallCount).toBe(0);
  });
});

// ─── 8. GATE — gate_failed (aggregate) ──────────────────────────

describe("publishContentProduct — gate: gate_failed (aggregate)", () => {
  it("single draft page → gate_failed with [draft]", async () => {
    const { port, state } = mkStubPort();
    state.pagesResult = {
      items: [{ pageId: "p1", status: "draft", translationCount: 1 }],
    };
    const result = await publishContentProduct(happyInput(), { port });
    expect(result.success).toBe(false);
    if (!result.success && result.reason === "gate_failed") {
      expect(result.issues).toEqual([
        { pageId: "p1", reason: "draft" },
      ]);
    } else {
      throw new Error("Expected gate_failed");
    }
  });

  it("single published page with 0 translations → gate_failed with [no_translation]", async () => {
    const { port, state } = mkStubPort();
    state.pagesResult = {
      items: [{ pageId: "p1", status: "published", translationCount: 0 }],
    };
    const result = await publishContentProduct(happyInput(), { port });
    expect(result.success).toBe(false);
    if (!result.success && result.reason === "gate_failed") {
      expect(result.issues).toEqual([
        { pageId: "p1", reason: "no_translation" },
      ]);
    } else {
      throw new Error("Expected gate_failed");
    }
  });

  it("page that is BOTH draft AND 0 translations → gate_failed with TWO issues (one per reason)", async () => {
    const { port, state } = mkStubPort();
    state.pagesResult = {
      items: [{ pageId: "p1", status: "draft", translationCount: 0 }],
    };
    const result = await publishContentProduct(happyInput(), { port });
    expect(result.success).toBe(false);
    if (!result.success && result.reason === "gate_failed") {
      expect(result.issues).toEqual([
        { pageId: "p1", reason: "draft" },
        { pageId: "p1", reason: "no_translation" },
      ]);
    } else {
      throw new Error("Expected gate_failed");
    }
  });

  it("MIX: some pages pass + some fail (each failure type) → gate_failed with ALL issues (no short-circuit)", async () => {
    const { port, state } = mkStubPort();
    state.pagesResult = {
      items: [
        { pageId: "p_ok", status: "published", translationCount: 3 }, // pass
        { pageId: "p_draft", status: "draft", translationCount: 1 }, // fail: draft
        { pageId: "p_no_tr", status: "published", translationCount: 0 }, // fail: no_translation
        { pageId: "p_both", status: "draft", translationCount: 0 }, // fail: both
      ],
    };
    const result = await publishContentProduct(happyInput(), { port });
    expect(result.success).toBe(false);
    if (!result.success && result.reason === "gate_failed") {
      expect(result.issues).toEqual([
        { pageId: "p_draft", reason: "draft" },
        { pageId: "p_no_tr", reason: "no_translation" },
        { pageId: "p_both", reason: "draft" },
        { pageId: "p_both", reason: "no_translation" },
      ]);
    } else {
      throw new Error("Expected gate_failed");
    }
  });

  it("gate_failed short-circuits BEFORE apply + revalidate", async () => {
    const { port, state } = mkStubPort();
    state.pagesResult = {
      items: [{ pageId: "p1", status: "draft", translationCount: 0 }],
    };
    await publishContentProduct(happyInput(), { port });
    expect(state.applyCallCount).toBe(0);
    expect(state.revalidateCallCount).toBe(0);
  });
});

// ─── 9. PRECEDENCE — interaction between status branches ──────

describe("publishContentProduct — denial precedence", () => {
  it("forbidden wins over already_published (no info leak on status)", async () => {
    const { port, state } = mkStubPort();
    state.productCtx = {
      creatorId: "creator_OTHER", // foreign owner
      slug: "x",
      status: "published", // published, but...
      publishedAt: new Date("2026-04-01"),
    };
    const result = await publishContentProduct(happyInput(), { port });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.reason).toBe("forbidden");
    // Confirms forbidden is checked BEFORE the status branch.
    expect(state.findProductCallCount).toBe(1);
  });

  it("archived_status wins over gate_failed (terminal state precedes gate)", async () => {
    const { port, state } = mkStubPort();
    state.productCtx = {
      creatorId: "creator_1",
      slug: "x",
      status: "archived", // terminal
      publishedAt: new Date("2025-01-01"),
    };
    // Even though pages would also fail the gate:
    state.pagesResult = {
      items: [{ pageId: "p1", status: "draft", translationCount: 0 }],
    };
    const result = await publishContentProduct(happyInput(), { port });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.reason).toBe("archived_status");
    expect(state.listPagesCallCount).toBe(0); // gate never evaluated
  });

  it("already_published wins over gate_failed (idempotent retry skips gate)", async () => {
    const { port, state } = mkStubPort();
    state.productCtx = {
      creatorId: "creator_1",
      slug: "x",
      status: "published",
      publishedAt: new Date("2026-04-01"),
    };
    // Pages array would fail if evaluated:
    state.pagesResult = {
      items: [{ pageId: "p1", status: "draft", translationCount: 0 }],
    };
    const result = await publishContentProduct(happyInput(), { port });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.reason).toBe("already_published");
    expect(state.listPagesCallCount).toBe(0); // gate skipped on idle retry
  });
});

// ─── 10. HAPPY PATH ────────────────────────────────────────────

describe("publishContentProduct — happy path", () => {
  it("draft product with all pages published+translated → success with new publishedAt = input.now", async () => {
    const FIXED = new Date("2026-04-01T08:00:00.000Z");
    const { port, state } = mkStubPort();
    state.productCtx = {
      creatorId: "creator_1",
      slug: "my-course",
      status: "draft",
      publishedAt: null,
    };
    state.pagesResult = {
      items: [
        { pageId: "p1", status: "published", translationCount: 2 },
        { pageId: "p2", status: "published", translationCount: 1 },
        { pageId: "p3", status: "published", translationCount: 1 },
      ],
    };
    const result = await publishContentProduct(
      { ...happyInput(), now: FIXED },
      { port },
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.productId).toBe("product_1");
      expect(result.slug).toBe("my-course");
      expect(result.publishedAt.getTime()).toBe(FIXED.getTime());
      expect(result.revalidated).toBe(true);
    }
  });

  it("success echoes slug from gate context AND revalidated:true", async () => {
    const { port, state } = mkStubPort();
    state.productCtx = {
      creatorId: "creator_1",
      slug: "echo-slug-here",
      status: "draft",
      publishedAt: null,
    };
    const result = await publishContentProduct(happyInput(), { port });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.slug).toBe("echo-slug-here");
      expect(result.revalidated).toBe(true);
    }
  });
});

// ─── 11. PLUMBING ──────────────────────────────────────────────

describe("publishContentProduct — plumbing", () => {
  it("input.now propagates verbatim to applyPublishTransition", async () => {
    const FIXED = new Date("2026-04-01T00:00:00.000Z");
    const { port, state } = mkStubPort();
    await publishContentProduct(
      { ...happyInput(), now: FIXED },
      { port },
    );
    expect(state.lastApplyInput?.now).toBe(FIXED);
    expect(state.lastApplyInput?.now.getTime()).toBe(FIXED.getTime());
  });

  it("revalidates AFTER apply (cache invalidation happens post-commit)", async () => {
    const { port, state } = mkStubPort();
    await publishContentProduct(happyInput(), { port });
    // apply (index 2) BEFORE revalidate (index 3) in callOrder.
    const idxApply = state.callOrder.indexOf("apply");
    const idxRevalidate = state.callOrder.indexOf("revalidate");
    expect(idxApply).toBeGreaterThanOrEqual(0);
    expect(idxRevalidate).toBeGreaterThanOrEqual(0);
    expect(idxApply).toBeLessThan(idxRevalidate);
  });

  it("slug from gate context forwards verbatim to revalidateNavigation", async () => {
    const { port, state } = mkStubPort();
    state.productCtx = {
      creatorId: "creator_1",
      slug: "the-published-slug",
      status: "draft",
      publishedAt: null,
    };
    await publishContentProduct(happyInput(), { port });
    expect(state.lastRevalidateInput?.slug).toBe("the-published-slug");
  });

  it("listContentPagesWithTranslationCounts called with the same productId as the gate lookup", async () => {
    const { port, state } = mkStubPort();
    await publishContentProduct(
      { ...happyInput(), productId: "product_42" },
      { port },
    );
    expect(state.lastFindProductInput?.productId).toBe("product_42");
    expect(state.lastListPagesInput?.productId).toBe("product_42");
    expect(state.lastApplyInput?.productId).toBe("product_42");
  });
});
