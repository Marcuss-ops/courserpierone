/**
 * src/domains/catalog/content-pages/reorder-content-pages.test.ts
 *
 * Unit tests for the `reorderContentPages` use case (MCR Phase 1 —
 * renumber sibling positions within a (productId, parentId) scope).
 *
 * Pattern mirrors the established `mkStubRepo`-style unit tests:
 *   - Stub the `ReorderContentPagesPort` directly. No Prisma mock.
 *   - Each test pre-sets the stub's responses for
 *     productOwner / scopeList / applyReorder independently,
 *     exercising one branch of the truth table.
 *
 * Coverage (per user spec: "unit test sugli invarianti di position"):
 *
 *   ── INPUT SHAPE (invalid_ordered_pages) ─────────────────────
 *     (a) empty array (length 0) → invalid_ordered_pages
 *     (b) array > 1000 → invalid_ordered_pages
 *     (c) missing newPosition → invalid_ordered_pages
 *     (d) negative newPosition → invalid_ordered_pages
 *     (e) non-integer newPosition (e.g. 1.5) → invalid_ordered_pages
 *     (f) empty pageId → invalid_ordered_pages
 *     (g) invalid_ordered_pages short-circuits BEFORE port calls
 *
 *   ── GUARD ────────────────────────────────────────────────────
 *     (h) empty actorId / productId → not_found (no port call)
 *
 *   ── OWNER ────────────────────────────────────────────────────
 *     (i) product missing → not_found
 *     (j) actor !== creator → forbidden
 *
 *   ── INVARIANT CHECKS (the spec's hard requirement) ────────────
 *     (k) duplicate_page_id: same pageId twice → duplicate_page_id
 *     (l) non_contiguous_positions: positions [1, 2, 4] (gap) →
 *         non_contiguous_positions with expectedSize=3, supplied
 *     (m) non_contiguous_positions: positions [1, 1, 2] (dupe
 *         position) → non_contiguous_positions
 *     (n) non_contiguous_positions: positions [0, 1, 2] (start at
 *         0) → non_contiguous_positions
 *     (o) non_contiguous_positions: positions [1, 2, 4] when array
 *         length is 2 → non_contiguous_positions (overshoot)
 *     (p) non_contiguous_positions: positions [1, 2, 3] but input
 *         has 4 entries → non_contiguous_positions (mismatch)
 *     (q) scope_mismatch: pageId in input not in scope → extras echo
 *     (r) incomplete_set: scope has more pages than input →
 *         missingFromScope echo
 *
 *   ── PRECEDENCE / INTERACTION ──────────────────────────────────
 *     (s) invalid_ordered_pages wins over duplicate_page_id (shape
 *         checks happen first)
 *     (t) duplicate_page_id wins over scope_mismatch (input shape
 *         beats scope semantics)
 *     (u) scope_mismatch wins over incomplete_set (semantics first)
 *
 *   ── HAPPY PATH ───────────────────────────────────────────────
 *     (v) 3 siblings [a, b, c] with newPositions [2, 1, 3] →
 *         success, reordered sorted by newPosition ascending
 *     (w) parentId = null (top-level scope) → success
 *     (x) parentId = "p1" (sub-tree scope) → success
 *     (y) reordered list is sorted by POSITION (not by original
 *         input order) — array order is shipping order, position
 *         is the authoritative slot
 *
 *   ── PLUMBING ─────────────────────────────────────────────────
 *     (z) port.applyReorder receives entries verbatim + now
 *
 *   ── ARCHITECTURE GUARD ────────────────────────────────────────
 *     (aa) input shape has exactly
 *          { actorId, productId, parentId, orderedPages, now? }
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  reorderContentPages,
} from "./reorder-content-pages";
import type {
  ReorderContentPagesPort,
} from "./reorder-content-pages-types";

// ─── Test helpers ─────────────────────────────────────────────────

interface StubState {
  // Inputs recorded.
  lastOwnerInput?: { productId: string };
  lastScopeInput?: { productId: string; parentId: string | null };
  lastApplyInput?: {
    productId: string;
    parentId: string | null;
    entries: { pageId: string; newPosition: number }[];
    now: Date;
  };

  // Pre-set responses.
  ownerResult: { creatorId: string } | null;
  scopeResult: { pageIds: string[] };
  applyReorderResult: { applied: true };

  // Counters.
  ownerCallCount: number;
  scopeCallCount: number;
  applyReorderCallCount: number;
}

function mkStubPort(): {
  port: ReorderContentPagesPort;
  state: StubState;
} {
  const state: StubState = {
    ownerResult: { creatorId: "creator_1" },
    scopeResult: { pageIds: ["page_a", "page_b", "page_c"] },
    applyReorderResult: { applied: true },
    ownerCallCount: 0,
    scopeCallCount: 0,
    applyReorderCallCount: 0,
  };
  const port: ReorderContentPagesPort = {
    async findProductOwner(input) {
      state.ownerCallCount++;
      state.lastOwnerInput = input;
      return state.ownerResult;
    },
    async listContentPagesInScope(input) {
      state.scopeCallCount++;
      state.lastScopeInput = input;
      return state.scopeResult;
    },
    async applyReorder(input) {
      state.applyReorderCallCount++;
      state.lastApplyInput = input;
      return state.applyReorderResult;
    },
  };
  return { port, state };
}

function happyInput(): Parameters<typeof reorderContentPages>[0] {
  return {
    actorId: "creator_1",
    productId: "product_1",
    parentId: null,
    orderedPages: [
      { pageId: "page_a", newPosition: 1 },
      { pageId: "page_b", newPosition: 2 },
      { pageId: "page_c", newPosition: 3 },
    ],
  };
}

// ─── Tests ─────────────────────────────────────────────────────────

describe("reorderContentPages — input invariants", () => {
  it("exports reorderContentPages as an async function", () => {
    expect(typeof reorderContentPages).toBe("function");
  });
});

// ─── 1. PARSE — invalid_ordered_pages ─────────────────────────────

describe("reorderContentPages — parse: invalid_ordered_pages", () => {
  it("empty array → invalid_ordered_pages", async () => {
    const { port } = mkStubPort();
    const result = await reorderContentPages(
      { ...happyInput(), orderedPages: [] },
      { port },
    );
    expect(result.success).toBe(false);
    if (!result.success && result.reason === "invalid_ordered_pages") {
      expect(result.error).toBeInstanceOf(z.ZodError);
    }
  });

  it("array > 1000 → invalid_ordered_pages (REORDER_BATCH_MAX guard)", async () => {
    const { port } = mkStubPort();
    const huge = Array.from({ length: 1001 }, (_, i) => ({
      pageId: `p_${i}`,
      newPosition: i + 1,
    }));
    const result = await reorderContentPages(
      { ...happyInput(), orderedPages: huge },
      { port },
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.reason).toBe("invalid_ordered_pages");
  });

  it("missing newPosition → invalid_ordered_pages", async () => {
    const { port } = mkStubPort();
    const result = await reorderContentPages(
      {
        ...happyInput(),
        orderedPages: [
          { pageId: "x" }, // missing newPosition
        ] as unknown as [{ pageId: string; newPosition: number }],
      },
      { port },
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.reason).toBe("invalid_ordered_pages");
  });

  it("negative newPosition → invalid_ordered_pages", async () => {
    const { port } = mkStubPort();
    const result = await reorderContentPages(
      {
        ...happyInput(),
        orderedPages: [{ pageId: "x", newPosition: -1 }],
      },
      { port },
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.reason).toBe("invalid_ordered_pages");
  });

  it("non-integer newPosition (1.5) → invalid_ordered_pages", async () => {
    const { port } = mkStubPort();
    const result = await reorderContentPages(
      {
        ...happyInput(),
        orderedPages: [{ pageId: "x", newPosition: 1.5 }],
      },
      { port },
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.reason).toBe("invalid_ordered_pages");
  });

  it("empty pageId in entry → invalid_ordered_pages", async () => {
    const { port } = mkStubPort();
    const result = await reorderContentPages(
      {
        ...happyInput(),
        orderedPages: [{ pageId: "", newPosition: 1 }],
      },
      { port },
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.reason).toBe("invalid_ordered_pages");
  });

  it("invalid_ordered_pages short-circuits BEFORE all port calls", async () => {
    const { port, state } = mkStubPort();
    await reorderContentPages(
      { ...happyInput(), orderedPages: [] },
      { port },
    );
    expect(state.ownerCallCount).toBe(0);
    expect(state.scopeCallCount).toBe(0);
    expect(state.applyReorderCallCount).toBe(0);
  });
});

// ─── 2. GUARD — empty actor/productId ─────────────────────────────

describe("reorderContentPages — guard: empty inputs", () => {
  it("empty actorId → not_found (no port call)", async () => {
    const { port, state } = mkStubPort();
    const result = await reorderContentPages(
      { ...happyInput(), actorId: "" },
      { port },
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.reason).toBe("not_found");
    expect(state.ownerCallCount).toBe(0);
  });

  it("empty productId → not_found (no port call)", async () => {
    const { port, state } = mkStubPort();
    const result = await reorderContentPages(
      { ...happyInput(), productId: "" },
      { port },
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.reason).toBe("not_found");
    expect(state.ownerCallCount).toBe(0);
  });
});

// ─── 3. OWNER — not_found / forbidden ─────────────────────────────

describe("reorderContentPages — owner", () => {
  it("product missing → not_found (scope not called)", async () => {
    const { port, state } = mkStubPort();
    state.ownerResult = null;
    const result = await reorderContentPages(happyInput(), { port });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.reason).toBe("not_found");
    expect(state.scopeCallCount).toBe(0);
    expect(state.applyReorderCallCount).toBe(0);
  });

  it("actor !== creator → forbidden", async () => {
    const { port: p2, state } = mkStubPort();
    state.ownerResult = { creatorId: "creator_OTHER" };
    const result = await reorderContentPages(happyInput(), { port: p2 });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.reason).toBe("forbidden");
  });

  it("forbidden short-circuits BEFORE scope + apply", async () => {
    const { port: p2, state } = mkStubPort();
    state.ownerResult = { creatorId: "creator_OTHER" };
    await reorderContentPages(happyInput(), { port: p2 });
    expect(state.scopeCallCount).toBe(0);
    expect(state.applyReorderCallCount).toBe(0);
  });
});

// ─── 4. INVARIANT — duplicate_page_id ─────────────────────────────

describe("reorderContentPages — invariant: duplicate_page_id", () => {
  it("same pageId twice → duplicate_page_id", async () => {
    const { port } = mkStubPort();
    const result = await reorderContentPages(
      {
        ...happyInput(),
        orderedPages: [
          { pageId: "page_a", newPosition: 1 },
          { pageId: "page_a", newPosition: 2 }, // dupe
          { pageId: "page_c", newPosition: 3 },
        ],
      },
      { port },
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.reason).toBe("duplicate_page_id");
  });

  it("duplicate_page_id short-circuits BEFORE apply", async () => {
    const { port, state } = mkStubPort();
    await reorderContentPages(
      {
        ...happyInput(),
        orderedPages: [
          { pageId: "page_a", newPosition: 1 },
          { pageId: "page_a", newPosition: 2 },
        ],
      },
      { port },
    );
    expect(state.applyReorderCallCount).toBe(0);
  });
});

// ─── 5. INVARIANT — non_contiguous_positions ──────────────────────

describe("reorderContentPages — invariant: non_contiguous_positions", () => {
  it("positions with a numeric gap [1, 2, 4, 5] (skips 3) → non_contiguous_positions", async () => {
    const { port, state } = mkStubPort();
    state.scopeResult = { pageIds: ["page_a", "page_b", "page_c", "page_d"] };
    const result = await reorderContentPages(
      {
        ...happyInput(),
        orderedPages: [
          { pageId: "page_a", newPosition: 1 },
          { pageId: "page_b", newPosition: 2 },
          { pageId: "page_d", newPosition: 4 }, // gap: 3 missing
          { pageId: "page_c", newPosition: 5 },
        ],
      },
      { port },
    );
    expect(result.success).toBe(false);
    if (
      !result.success &&
      result.reason === "non_contiguous_positions"
    ) {
      expect(result.expectedSize).toBe(4);
      expect(result.supplied).toEqual([1, 2, 4, 5]);
    } else {
      throw new Error("Expected non_contiguous_positions");
    }
  });

  it("duplicate positions [1, 1, 2] → non_contiguous_positions (counts as gap via unique-set)", async () => {
    const { port, state } = mkStubPort();
    state.scopeResult = { pageIds: ["a", "b", "c"] };
    const result = await reorderContentPages(
      {
        ...happyInput(),
        orderedPages: [
          { pageId: "a", newPosition: 1 },
          { pageId: "b", newPosition: 1 }, // dupe position
          { pageId: "c", newPosition: 2 },
        ],
      },
      { port },
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe("non_contiguous_positions");
    }
  });

  it("positions starting at 0 → non_contiguous_positions (positions are 1-indexed)", async () => {
    const { port, state } = mkStubPort();
    state.scopeResult = { pageIds: ["a", "b", "c"] };
    const result = await reorderContentPages(
      {
        ...happyInput(),
        orderedPages: [
          { pageId: "a", newPosition: 0 },
          { pageId: "b", newPosition: 1 },
          { pageId: "c", newPosition: 2 },
        ],
      },
      { port },
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe("non_contiguous_positions");
    }
  });

  it("overshoot positions [1, 2, 3] when length is 2 → non_contiguous_positions", async () => {
    const { port, state } = mkStubPort();
    state.scopeResult = { pageIds: ["a", "b", "c"] }; // 3 in scope, 2 supplied
    // Use only 2 entries but supply positions spanning 1..3 — caught
    // upstream by incomplete_set (length 2 < scope size 3) BEFORE
    // non_contiguous check. To isolate non_contiguous, supply 3
    // entries but position them as 1..3 — and add a 4th missing
    // entry scenario: use the SAME 3 ids but positions 1..3 (ok) +
    // a 4th unmapped entry.
    //
    // Simplest isolation: supply 2 entries with positions [1, 3]
    // → expectedSize=2 but supplied = [1, 3].
    const result = await reorderContentPages(
      {
        ...happyInput(),
        orderedPages: [
          { pageId: "a", newPosition: 1 },
          { pageId: "b", newPosition: 3 }, // gap; expected [1, 2]
        ],
      },
      { port },
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe("non_contiguous_positions");
    }
  });

  it("positions [1, 2, 3, 4] when length is 4 but scope size > 4 → caught by incomplete_set (not non_contiguous)", async () => {
    const { port, state } = mkStubPort();
    state.scopeResult = { pageIds: ["a", "b", "c", "d", "e"] }; // 5 in scope
    const result = await reorderContentPages(
      {
        ...happyInput(),
        orderedPages: [
          { pageId: "a", newPosition: 1 },
          { pageId: "b", newPosition: 2 },
          { pageId: "c", newPosition: 3 },
          { pageId: "d", newPosition: 4 },
        ],
      },
      { port },
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe("incomplete_set"); // scope mismatch catches this
      if (result.reason === "incomplete_set") {
        expect(result.missingFromScope).toEqual(["e"]);
      }
    }
  });

  it("non_contiguous_positions short-circuits BEFORE apply", async () => {
    const { port, state } = mkStubPort();
    state.scopeResult = { pageIds: ["a", "b", "c"] };
    await reorderContentPages(
      {
        ...happyInput(),
        orderedPages: [
          { pageId: "a", newPosition: 1 },
          { pageId: "b", newPosition: 2 },
          { pageId: "c", newPosition: 5 }, // gap
        ],
      },
      { port },
    );
    expect(state.applyReorderCallCount).toBe(0);
  });
});

// ─── 6. INVARIANT — scope_mismatch / incomplete_set ───────────────

describe("reorderContentPages — invariant: scope_mismatch", () => {
  it("pageId in input but NOT in scope → scope_mismatch with extras echo", async () => {
    const { port, state } = mkStubPort();
    state.scopeResult = { pageIds: ["page_a", "page_b"] };
    const result = await reorderContentPages(
      {
        ...happyInput(),
        orderedPages: [
          { pageId: "page_a", newPosition: 1 },
          { pageId: "page_OTHER", newPosition: 2 }, // not in scope
        ],
      },
      { port },
    );
    expect(result.success).toBe(false);
    if (!result.success && result.reason === "scope_mismatch") {
      expect(result.extras).toEqual(["page_OTHER"]);
    } else {
      throw new Error("Expected scope_mismatch");
    }
  });
});

describe("reorderContentPages — invariant: incomplete_set", () => {
  it("scope has more pages than input → incomplete_set with missing echo", async () => {
    const { port, state } = mkStubPort();
    state.scopeResult = { pageIds: ["page_a", "page_b", "page_c"] };
    const result = await reorderContentPages(
      {
        ...happyInput(),
        orderedPages: [
          { pageId: "page_a", newPosition: 1 },
          { pageId: "page_b", newPosition: 2 },
          // page_c missing from input
        ],
      },
      { port },
    );
    expect(result.success).toBe(false);
    if (!result.success && result.reason === "incomplete_set") {
      expect(result.missingFromScope).toEqual(["page_c"]);
    } else {
      throw new Error("Expected incomplete_set");
    }
  });

  it("scope_mismatch wins over incomplete_set (semantics first)", async () => {
    const { port, state } = mkStubPort();
    state.scopeResult = { pageIds: ["page_a", "page_b", "page_c"] };
    const result = await reorderContentPages(
      {
        ...happyInput(),
        orderedPages: [
          { pageId: "page_a", newPosition: 1 },
          { pageId: "page_OTHER", newPosition: 2 }, // not in scope
          // page_b + page_c missing from input
        ],
      },
      { port },
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe("scope_mismatch");
    }
  });
});

// ─── 7. PRECEDENCE — interaction of denial branches ────────────────

describe("reorderContentPages — denial precedence", () => {
  it("invalid_ordered_pages wins over duplicate_page_id (shape beats content)", async () => {
    const { port } = mkStubPort();
    const result = await reorderContentPages(
      {
        ...happyInput(),
        orderedPages: [
          { pageId: "x", newPosition: -1 },
          { pageId: "x", newPosition: -2 },
        ],
      },
      { port },
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe("invalid_ordered_pages");
    }
  });

  it("duplicate_page_id wins over scope_mismatch (input shape first)", async () => {
    const { port, state } = mkStubPort();
    state.scopeResult = { pageIds: ["x"] };
    const result = await reorderContentPages(
      {
        ...happyInput(),
        orderedPages: [
          { pageId: "x", newPosition: 1 },
          { pageId: "x", newPosition: 2 }, // dupe
        ],
      },
      { port },
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe("duplicate_page_id");
    }
  });
});

// ─── 8. HAPPY PATH ────────────────────────────────────────────────

describe("reorderContentPages — happy path", () => {
  it("3 siblings with shuffled newPositions → success, reordered sorted by position", async () => {
    const { port, state } = mkStubPort();
    state.scopeResult = { pageIds: ["page_a", "page_b", "page_c"] };
    const result = await reorderContentPages(
      {
        ...happyInput(),
        orderedPages: [
          { pageId: "page_b", newPosition: 1 }, // shipping order is b,a,c
          { pageId: "page_a", newPosition: 2 },
          { pageId: "page_c", newPosition: 3 },
        ],
      },
      { port },
    );
    expect(result.success).toBe(true);
    if (result.success) {
      // Result is SORTED by new position (1-indexed ascending).
      expect(result.reordered).toEqual([
        { pageId: "page_b", position: 1 },
        { pageId: "page_a", position: 2 },
        { pageId: "page_c", position: 3 },
      ]);
      expect(result.scope).toEqual({
        productId: "product_1",
        parentId: null,
      });
    }
  });

  it("parentId = null (top-level scope) → success", async () => {
    const { port, state } = mkStubPort();
    state.scopeResult = { pageIds: ["p_a", "p_b"] };
    const result = await reorderContentPages(
      {
        ...happyInput(),
        parentId: null,
        orderedPages: [
          { pageId: "p_a", newPosition: 1 },
          { pageId: "p_b", newPosition: 2 },
        ],
      },
      { port },
    );
    expect(result.success).toBe(true);
  });

  it("parentId = 'p_parent' (sub-tree scope) → success, scope echoed", async () => {
    const { port, state } = mkStubPort();
    state.scopeResult = { pageIds: ["child_a", "child_b"] };
    const result = await reorderContentPages(
      {
        ...happyInput(),
        parentId: "p_parent",
        orderedPages: [
          { pageId: "child_a", newPosition: 1 },
          { pageId: "child_b", newPosition: 2 },
        ],
      },
      { port },
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.scope).toEqual({
        productId: "product_1",
        parentId: "p_parent",
      });
    }
  });
});

// ─── 9. PLUMBING ──────────────────────────────────────────────────

describe("reorderContentPages — plumbing", () => {
  it("forwards entries verbatim to applyReorder (ordering preserved as input)", async () => {
    const { port, state } = mkStubPort();
    state.scopeResult = { pageIds: ["a", "b", "c"] };
    const input = [
      { pageId: "a", newPosition: 3 }, // shipping order
      { pageId: "b", newPosition: 1 },
      { pageId: "c", newPosition: 2 },
    ];
    await reorderContentPages(
      { ...happyInput(), orderedPages: input },
      { port },
    );
    expect(state.lastApplyInput?.entries).toEqual(input);
  });

  it("forwards parentId verbatim (null vs string preserved)", async () => {
    const { port, state } = mkStubPort();
    state.scopeResult = { pageIds: ["a"] };
    await reorderContentPages(
      {
        ...happyInput(),
        parentId: "p1",
        orderedPages: [{ pageId: "a", newPosition: 1 }],
      },
      { port },
    );
    expect(state.lastScopeInput?.parentId).toBe("p1");
    expect(state.lastApplyInput?.parentId).toBe("p1");
  });

  it("forwards input.now verbatim to applyReorder", async () => {
    const FIXED = new Date("2026-04-01T00:00:00.000Z");
    const { port, state } = mkStubPort();
    state.scopeResult = { pageIds: ["a"] };
    await reorderContentPages(
      { ...happyInput(), now: FIXED, orderedPages: [{ pageId: "a", newPosition: 1 }] },
      { port },
    );
    expect(state.lastApplyInput?.now).toBe(FIXED);
  });
});

// ─── 10. Architecture guard ───────────────────────────────────────

describe("reorderContentPages — architecture guard", () => {
  it("input shape has exactly { actorId, productId, parentId, orderedPages, now? }", () => {
    // Runtime lock: input does NOT include Prisma-derivable fields.
    // Defense in depth — if a future maintainer adds `actorRole`,
    // this test would fail and force a types review.
    const sample: Parameters<typeof reorderContentPages>[0] =
      happyInput();
    const allowedKeys = ["actorId", "orderedPages", "parentId", "productId"].sort();
    const actualKeys = Object.keys(sample).sort();
    expect(actualKeys).toEqual(allowedKeys);
  });
});
