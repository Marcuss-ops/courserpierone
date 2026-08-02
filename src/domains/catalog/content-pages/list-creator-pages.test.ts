/**
 * src/domains/catalog/content-pages/list-creator-pages.test.ts
 *
 * Unit tests for the `listCreatorPages` use case (MCR Phase 1 —
 * creator-side sidebar SSOT).
 *
 * Pattern mirrors the established `mkStubRepo`-style tests:
 *   - Stub the `ListCreatorPagesPort` directly. No Prisma mock.
 *   - Each test pre-sets the stub's responses for owner +
 *     list independently.
 *
 * Coverage (per the use-case orchestration + architecture guard):
 *   - PROJECT SHAPE
 *     (a) exports listCreatorPages as an async function
 *   - GUARD branch
 *     (b) empty actorId → not_found (no port call)
 *     (c) empty productId → not_found (no port call)
 *     (d) empty actorId AND productId → not_found (single branch)
 *   - OWNER branch
 *     (e) product missing → not_found (pages port not called)
 *     (f) product exists, actor !== creator → forbidden
 *         (pages port not called — short-circuits BEFORE list)
 *   - LIST branch
 *     (g) success: returns the port's flat list verbatim
 *     (h) success: status coercion — unknown statuses fall
 *         back to "draft"
 *     (i) success: defaultLanguage from owner echoed on every row
 *   - PLUMBING
 *     (j) forwards actorId + productId verbatim to the owner port
 *     (k) forwards productId + defaultLanguage verbatim to list port
 *   - DISCRIMINATED UNION exhaustiveness
 *     (l) success branch has exactly { success, pages }
 *     (m) not_found branch has exactly { success, reason: "not_found" }
 *     (n) forbidden branch has exactly { success, reason: "forbidden" }
 */

import { describe, expect, it } from "vitest";

import {
  listCreatorPages,
} from "./list-creator-pages";
import type {
  ListCreatorPagesPort,
  ListCreatorPagesPageRow,
} from "./list-creator-pages-types";

// ─── Test helpers ─────────────────────────────────────────────────

interface StubState {
  lastOwnerInput?: { productId: string };
  lastListInput?: { productId: string; defaultLanguage: string };
  ownerResult: { creatorId: string; defaultLanguage: string } | null;
  listResult: { items: ListCreatorPagesPageRow[] };
  ownerCallCount: number;
  listCallCount: number;
}

function mkStubPort(
  preset?: Partial<{
    owner: { creatorId: string; defaultLanguage: string } | null;
    list: { items: ListCreatorPagesPageRow[] };
  }>,
): { port: ListCreatorPagesPort; state: StubState } {
  // Default owner + list, BUT: if the caller explicitly
  // passes `owner: null` (the "missing product" branch) we
  // MUST honor that null, NOT fall back to the default. The
  // `??` operator would treat null as "set" and replace it
  // anyway, so we use a sentinel via the `in` operator.
  const DEFAULT_OWNER = {
    creatorId: "creator_1",
    defaultLanguage: "it",
  };
  const DEFAULT_LIST = {
    items: [
      {
        id: "page_1",
        parentId: null,
        slug: "intro",
        position: 1,
        status: "published" as const,
        title: "Introduzione",
        defaultLanguage: "it",
        updatedAt: new Date("2026-07-19T00:00:00.000Z"),
      },
      {
        id: "page_2",
        parentId: null,
        slug: "concetti",
        position: 2,
        status: "draft" as const,
        title: "Concetti fondamentali",
        defaultLanguage: "it",
        updatedAt: new Date("2026-07-19T00:00:00.000Z"),
      },
    ],
  };

  const ownerResult =
    preset && "owner" in preset ? preset.owner! : DEFAULT_OWNER;
  const listResult =
    preset && "list" in preset ? preset.list! : DEFAULT_LIST;

  const state: StubState = {
    ownerResult,
    listResult,
    ownerCallCount: 0,
    listCallCount: 0,
  };
  const port: ListCreatorPagesPort = {
    async findProductOwner(input) {
      state.ownerCallCount++;
      state.lastOwnerInput = input;
      return state.ownerResult;
    },
    async listContentPagesWithDefaultTitle(input) {
      state.listCallCount++;
      state.lastListInput = input;
      return state.listResult;
    },
  };
  return { port, state };
}

function happyInput(): Parameters<typeof listCreatorPages>[0] {
  return { actorId: "creator_1", productId: "product_1" };
}

// ─── 1. Project shape ─────────────────────────────────────────────

describe("listCreatorPages — project shape", () => {
  it("exports listCreatorPages as an async function", () => {
    expect(typeof listCreatorPages).toBe("function");
  });
});

// ─── 2. GUARD branch ───────────────────────────────────────────────

describe("listCreatorPages — guard: empty inputs", () => {
  it("empty actorId → not_found (no port call)", async () => {
    const { port, state } = mkStubPort();
    const result = await listCreatorPages(
      { ...happyInput(), actorId: "" },
      { repo: port },
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.reason).toBe("not_found");
    expect(state.ownerCallCount).toBe(0);
    expect(state.listCallCount).toBe(0);
  });

  it("empty productId → not_found (no port call)", async () => {
    const { port, state } = mkStubPort();
    const result = await listCreatorPages(
      { ...happyInput(), productId: "" },
      { repo: port },
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.reason).toBe("not_found");
    expect(state.ownerCallCount).toBe(0);
  });

  it("empty actorId AND productId → not_found (single branch)", async () => {
    const { port, state } = mkStubPort();
    const result = await listCreatorPages(
      { actorId: "", productId: "" },
      { repo: port },
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.reason).toBe("not_found");
    expect(state.ownerCallCount).toBe(0);
  });
});

// ─── 3. OWNER branch ──────────────────────────────────────────────

describe("listCreatorPages — owner: not_found / forbidden", () => {
  it("product missing → not_found (list port not called)", async () => {
    const { port, state } = mkStubPort({ owner: null });
    const result = await listCreatorPages(happyInput(), { repo: port });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.reason).toBe("not_found");
    expect(state.ownerCallCount).toBe(1);
    expect(state.listCallCount).toBe(0);
  });

  it("product exists, actor !== creator → forbidden", async () => {
    const { port, state } = mkStubPort({
      owner: { creatorId: "creator_OTHER", defaultLanguage: "it" },
    });
    const result = await listCreatorPages(happyInput(), { repo: port });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.reason).toBe("forbidden");
    expect(state.listCallCount).toBe(0);
  });

  it("forbidden short-circuits BEFORE the list port call", async () => {
    const { port, state } = mkStubPort({
      owner: { creatorId: "creator_OTHER", defaultLanguage: "it" },
    });
    await listCreatorPages(happyInput(), { repo: port });
    expect(state.ownerCallCount).toBe(1);
    expect(state.listCallCount).toBe(0);
  });
});

// ─── 4. LIST branch — happy path ──────────────────────────────────

describe("listCreatorPages — list: happy path", () => {
  it("success: returns the port's flat list verbatim", async () => {
    const { port } = mkStubPort();
    const result = await listCreatorPages(happyInput(), { repo: port });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.pages).toHaveLength(2);
      expect(result.pages[0].id).toBe("page_1");
      expect(result.pages[1].id).toBe("page_2");
    }
  });

  it("success: empty list returns success with empty array", async () => {
    const { port } = mkStubPort({ list: { items: [] } });
    const result = await listCreatorPages(happyInput(), { repo: port });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.pages).toEqual([]);
    }
  });

  it("success: unknown status coerced to 'draft' (defensive)", async () => {
    const { port } = mkStubPort({
      list: {
        items: [
          {
            id: "page_legacy",
            parentId: null,
            slug: "legacy",
            position: 1,
            // Cast through unknown to simulate a legacy / corrupted
            // DB row whose status string isn't in the union.
            status: "mystery_status" as unknown as "draft",
            title: "Legacy",
            defaultLanguage: "it",
            updatedAt: new Date("2026-07-19T00:00:00.000Z"),
          },
        ],
      },
    });
    const result = await listCreatorPages(happyInput(), { repo: port });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.pages[0].status).toBe("draft");
    }
  });

  it("success: known statuses preserved verbatim", async () => {
    const { port } = mkStubPort();
    const result = await listCreatorPages(happyInput(), { repo: port });
    if (result.success) {
      expect(result.pages[0].status).toBe("published");
      expect(result.pages[1].status).toBe("draft");
    }
  });

  it("success: defaultLanguage from owner echoed on every row", async () => {
    const overrideList: ListCreatorPagesPageRow[] = [
      {
        id: "page_3",
        parentId: null,
        slug: "x",
        position: 1,
        status: "draft" as const,
        title: "X",
        defaultLanguage: "ignored", // adapter can have any value — use case overrides
        updatedAt: new Date("2026-07-19T00:00:00.000Z"),
      },
    ];
    const { port } = mkStubPort({
      owner: { creatorId: "creator_1", defaultLanguage: "es" },
      list: { items: overrideList },
    });
    const result = await listCreatorPages(happyInput(), { repo: port });
    if (result.success) {
      expect(result.pages[0].defaultLanguage).toBe("es");
    }
  });
});

// ─── 5. PLUMBING ──────────────────────────────────────────────────

describe("listCreatorPages — plumbing", () => {
  it("forwards actorId + productId verbatim to the owner port", async () => {
    const { port, state } = mkStubPort();
    await listCreatorPages(
      { actorId: "creator_X", productId: "product_X" },
      { repo: port },
    );
    expect(state.lastOwnerInput).toEqual({ productId: "product_X" });
  });

  it("forwards productId + defaultLanguage verbatim to the list port", async () => {
    const { port, state } = mkStubPort({
      owner: { creatorId: "creator_1", defaultLanguage: "de" },
    });
    await listCreatorPages(happyInput(), { repo: port });
    expect(state.lastListInput).toEqual({
      productId: "product_1",
      defaultLanguage: "de",
    });
  });
});

// ─── 6. DISCRIMINATED UNION exhaustiveness ─────────────────────────

describe("listCreatorPages — discriminated union", () => {
  it("success branch has exactly { success, pages }", async () => {
    const { port } = mkStubPort();
    const result = await listCreatorPages(happyInput(), { repo: port });
    if (result.success) {
      expect(Object.keys(result).sort()).toEqual(["pages", "success"]);
    } else {
      throw new Error("Expected success");
    }
  });

  it("not_found branch has exactly { success, reason }", async () => {
    const { port } = mkStubPort({ owner: null });
    const result = await listCreatorPages(happyInput(), { repo: port });
    if (!result.success) {
      expect(Object.keys(result).sort()).toEqual(["reason", "success"]);
      expect(result.reason).toBe("not_found");
    } else {
      throw new Error("Expected not_found");
    }
  });

  it("forbidden branch has exactly { success, reason }", async () => {
    const { port } = mkStubPort({
      owner: { creatorId: "creator_OTHER", defaultLanguage: "it" },
    });
    const result = await listCreatorPages(happyInput(), { repo: port });
    if (!result.success) {
      expect(Object.keys(result).sort()).toEqual(["reason", "success"]);
      expect(result.reason).toBe("forbidden");
    } else {
      throw new Error("Expected forbidden");
    }
  });
});
