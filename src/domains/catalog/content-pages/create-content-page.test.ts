/**
 * src/domains/catalog/content-pages/create-content-page.test.ts
 *
 * Unit tests for the `createContentPage` use case (MCR Phase 1 —
 * Notion-like pages feature).
 *
 * Pattern mirrors `src/lib/learning/watchlist.test.ts` and the
 * sibling `src/domains/catalog/content-pages/save-content-document.
 * test.ts`:
 *   - Stub the `ContentPageRepository` port directly. No Prisma mock.
 *   - The adapter's `position` auto-assignment is exercised by
 *     inspecting the port's last inputs + pre-set return values.
 *   - Reproduction-via-identity: same fixture set → same outcome.
 *
 * Coverage (per user spec + design):
 *   - PARSE branch
 *     (a) invalid_slug (uppercase / spaces / leading dash / > 64 chars)
 *     (b) invalid_status (not in {draft|published|archived})
 *   - OWNER branch
 *     (c) product missing → not_found
 *     (d) actor !== creator → forbidden
 *     (e) empty actorId → not_found (defensive)
 *     (f) empty productId → not_found (defensive)
 *   - PARENT branch
 *     (g) parentId null → skipped (happy path)
 *     (h) parentId supplied, parent in same product → success
 *     (i) parentId supplied, parent doesn't exist → parent_not_found
 *     (j) parentId supplied, parent in DIFFERENT product → parent_not_found
 *   - PERSIST branch
 *     (k) slug_taken (adapter surfaces P2002)
 *     (l) parent_not_found from adapter (race: parent deleted between
 *         use case pre-check and the INSERT)
 *   - Happy path / ordering
 *     (m) first page in new product (parentId null) → success, position
 *         forwarded from port
 *     (n) success returns the port's `page` record verbatim (including
 *         the auto-assigned position)
 *   - Plumbing
 *     (o) parentId = undefined → treated as null (top-level)
 *     (p) status omitted → forwarded as "draft"
 *     (q) status supplied → forwarded verbatim
 *   - Input guards
 *     (r) actorId empty AND productId empty → not_found (short-circuit
 *         before port call)
 *   - Exhaustive 7-branch union
 *     (s) All 7 outcomes reachable via stub configuration (compile-
 *         time exhaustiveness)
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  createContentPage,
} from "./create-content-page";
import type {
  ContentPageRecord,
  ContentPageRepository,
} from "./create-content-page-types";

// ─── Test helpers ─────────────────────────────────────────────────

/**
 * Mutable state exposed by the stub so each test can pre-set the
 * desired port responses and assert on the inputs it received.
 *
 * Mirrors the `mkStubRepo` shape from `watchlist.test.ts` /
 * `save-content-document.test.ts`.
 */
interface StubState {
  // Inputs recorded by the stub's method bodies.
  lastFindOwnerInput?: { productId: string };
  lastFindPageInput?: { pageId: string };
  lastCreateInput?: {
    productId: string;
    parentId: string | null;
    slug: string;
    status: "draft" | "published" | "archived";
  };

  // Pre-set responses.
  ownerResult: { creatorId: string } | null;
  pageResult: { productId: string } | null;
  createResult:
    | { created: true; page: ContentPageRecord }
    | { created: false; reason: "slug_taken" | "parent_not_found" };

  // Counting: ensures we assert no-write-on-deny.
  findOwnerCallCount: number;
  findPageCallCount: number;
  createCallCount: number;
}

function mkStubRepo(): {
  repo: ContentPageRepository;
  state: StubState;
} {
  const FIXED_DATE = new Date("2026-07-19T12:00:00.000Z");
  const state: StubState = {
    ownerResult: { creatorId: "creator_1" },
    pageResult: null,
    createResult: {
      created: true,
      page: {
        id: "page_new",
        productId: "product_1",
        parentId: null,
        slug: "intro",
        position: 1,
        status: "draft",
        publishedAt: null,
        createdAt: FIXED_DATE,
        updatedAt: FIXED_DATE,
      },
    },
    findOwnerCallCount: 0,
    findPageCallCount: 0,
    createCallCount: 0,
  };
  const repo: ContentPageRepository = {
    async findProductOwner(input) {
      state.findOwnerCallCount++;
      state.lastFindOwnerInput = input;
      return state.ownerResult;
    },
    async findPageProductId(input) {
      state.findPageCallCount++;
      state.lastFindPageInput = input;
      return state.pageResult;
    },
    async createContentPage(input) {
      state.createCallCount++;
      state.lastCreateInput = input;
      return state.createResult;
    },
  };
  return { repo, state };
}

// ─── Fixtures ──────────────────────────────────────────────────────

function happyInput(): Parameters<typeof createContentPage>[0] {
  return {
    actorId: "creator_1",
    productId: "product_1",
    parentId: null,
    slug: "intro",
  };
}

// ─── Tests ─────────────────────────────────────────────────────────

describe("createContentPage — input-shape invariants", () => {
  it("exports createContentPage as an async function", () => {
    expect(typeof createContentPage).toBe("function");
  });
});

// ─── 1. PARSE — invalid_slug ──────────────────────────────────────

describe("createContentPage — invalid_slug", () => {
  it("rejects an uppercase slug (anchor: contentSlugSchema)", async () => {
    const { repo, state } = mkStubRepo();
    const result = await createContentPage(
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
    // Short-circuit: port MUST NOT be called when slug fails validation.
    expect(state.findOwnerCallCount).toBe(0);
    expect(state.createCallCount).toBe(0);
  });

  it("rejects a slug with spaces", async () => {
    const { repo, state } = mkStubRepo();
    const result = await createContentPage(
      { ...happyInput(), slug: "hello world" },
      { repo },
    );
    expect(result.success).toBe(false);
    if (result.success === false) {
      expect(result.reason).toBe("invalid_slug");
    }
    expect(state.createCallCount).toBe(0);
  });

  it("rejects a slug with a leading dash (regex requires leading alphanumeric)", async () => {
    const { repo, state } = mkStubRepo();
    const result = await createContentPage(
      { ...happyInput(), slug: "-hello" },
      { repo },
    );
    expect(result.success).toBe(false);
    if (result.success === false) {
      expect(result.reason).toBe("invalid_slug");
    }
    expect(state.createCallCount).toBe(0);
  });

  it("rejects a slug > 64 characters", async () => {
    const { repo, state } = mkStubRepo();
    const result = await createContentPage(
      { ...happyInput(), slug: "a".repeat(65) },
      { repo },
    );
    expect(result.success).toBe(false);
    if (result.success === false) {
      expect(result.reason).toBe("invalid_slug");
    }
    expect(state.createCallCount).toBe(0);
  });

  it("accepts valid slugs (kebab, alphanumeric, single letter rejected by regex but 3+ chars accepted)", async () => {
    const { repo, state } = mkStubRepo();
    for (const slug of ["intro", "a-b-c", "course-101", "module-foo"]) {
      state.createCallCount = 0;
      const result = await createContentPage(
        { ...happyInput(), slug },
        { repo },
      );
      expect(result.success).toBe(true);
      expect(state.createCallCount).toBe(1);
    }
  });
});

// ─── 2. PARSE — invalid_status ────────────────────────────────────

describe("createContentPage — invalid_status", () => {
  it("rejects a status not in {draft|published|archived}", async () => {
    const { repo, state } = mkStubRepo();
    const result = await createContentPage(
      {
        ...happyInput(),
        status: "deleted" as unknown as "draft", // intentional bypass
      },
      { repo },
    );
    expect(result.success).toBe(false);
    if (result.success === false && result.reason === "invalid_status") {
      expect(result.error).toBeInstanceOf(z.ZodError);
    } else {
      throw new Error("Expected invalid_status branch");
    }
    expect(state.createCallCount).toBe(0);
  });

  it("accepts draft / published / archived as valid statuses", async () => {
    const { repo } = mkStubRepo();
    for (const status of ["draft", "published", "archived"] as const) {
      const result = await createContentPage(
        { ...happyInput(), status },
        { repo },
      );
      expect(result.success).toBe(true);
    }
  });
});

// ─── 3. OWNER — not_found / forbidden ─────────────────────────────

describe("createContentPage — not_found", () => {
  it("returns not_found when the product doesn't exist (findProductOwner returns null)", async () => {
    const { repo, state } = mkStubRepo();
    state.ownerResult = null;
    const result = await createContentPage(happyInput(), { repo });
    expect(result.success).toBe(false);
    if (result.success === false) {
      expect(result.reason).toBe("not_found");
    }
    // Short-circuit: parent lookup + create MUST NOT fire.
    expect(state.findPageCallCount).toBe(0);
    expect(state.createCallCount).toBe(0);
  });

  it("returns not_found when actorId is empty (defensive)", async () => {
    const { repo, state } = mkStubRepo();
    const result = await createContentPage(
      { ...happyInput(), actorId: "" },
      { repo },
    );
    expect(result.success).toBe(false);
    if (result.success === false) {
      expect(result.reason).toBe("not_found");
    }
    // Defense: empty actorId short-circuits before any DB call.
    expect(state.findOwnerCallCount).toBe(0);
  });

  it("returns not_found when productId is empty (defensive)", async () => {
    const { repo, state } = mkStubRepo();
    const result = await createContentPage(
      { ...happyInput(), productId: "" },
      { repo },
    );
    expect(result.success).toBe(false);
    if (result.success === false) {
      expect(result.reason).toBe("not_found");
    }
    expect(state.findOwnerCallCount).toBe(0);
  });
});

describe("createContentPage — forbidden", () => {
  it("returns forbidden when the actor is not the product's creator", async () => {
    const { repo, state } = mkStubRepo();
    state.ownerResult = { creatorId: "creator_OTHER" };
    const result = await createContentPage(happyInput(), { repo });
    expect(result.success).toBe(false);
    if (result.success === false) {
      expect(result.reason).toBe("forbidden");
    }
    expect(state.findPageCallCount).toBe(0);
    expect(state.createCallCount).toBe(0);
  });
});

// ─── 4. PARENT — parent_not_found ─────────────────────────────────

describe("createContentPage — parent_not_found", () => {
  it("skips the parent lookup when parentId is null (top-level page)", async () => {
    const { repo, state } = mkStubRepo();
    const result = await createContentPage(
      { ...happyInput(), parentId: null },
      { repo },
    );
    expect(result.success).toBe(true);
    // parent lookup MUST NOT be called when parentId is null.
    expect(state.findPageCallCount).toBe(0);
  });

  it("skips the parent lookup when parentId is undefined", async () => {
    const { repo, state } = mkStubRepo();
    const result = await createContentPage(
      { ...happyInput(), parentId: undefined },
      { repo },
    );
    expect(result.success).toBe(true);
    expect(state.findPageCallCount).toBe(0);
  });

  it("forwards a supplied parentId to findPageProductId", async () => {
    const { repo, state } = mkStubRepo();
    state.pageResult = { productId: "product_1" };
    const result = await createContentPage(
      { ...happyInput(), parentId: "page_parent" },
      { repo },
    );
    expect(result.success).toBe(true);
    expect(state.lastFindPageInput).toEqual({ pageId: "page_parent" });
    expect(state.findPageCallCount).toBe(1);
  });

  it("returns parent_not_found when the parent page doesn't exist", async () => {
    const { repo, state } = mkStubRepo();
    state.pageResult = null;
    const result = await createContentPage(
      { ...happyInput(), parentId: "page_ghost" },
      { repo },
    );
    expect(result.success).toBe(false);
    if (result.success === false) {
      expect(result.reason).toBe("parent_not_found");
    }
    expect(state.createCallCount).toBe(0);
  });

  it("returns parent_not_found when the parent belongs to a DIFFERENT product (collapsed for no info leak)", async () => {
    const { repo, state } = mkStubRepo();
    state.pageResult = { productId: "product_OTHER" };
    const result = await createContentPage(
      { ...happyInput(), parentId: "page_other_product" },
      { repo },
    );
    expect(result.success).toBe(false);
    if (result.success === false) {
      expect(result.reason).toBe("parent_not_found");
    }
    expect(state.createCallCount).toBe(0);
  });
});

// ─── 5. PERSIST — slug_taken / port race ──────────────────────────

describe("createContentPage — slug_taken", () => {
  it("returns slug_taken when the adapter reports @@unique violation", async () => {
    const { repo } = mkStubRepo();
    repo.createContentPage = async () => ({
      created: false,
      reason: "slug_taken",
    });
    const result = await createContentPage(happyInput(), { repo });
    expect(result.success).toBe(false);
    if (result.success === false) {
      expect(result.reason).toBe("slug_taken");
    }
  });
});

describe("createContentPage — port-race parent_not_found", () => {
  it("returns parent_not_found when the adapter catches a parent-deleted race (defense in depth)", async () => {
    // The use case pre-checks the parent (step 3), but a parallel
    // delete can land between the check and the INSERT. The adapter
    // re-verifies and surfaces parent_not_found; the use case
    // forwards it to the caller.
    const { repo } = mkStubRepo();
    repo.createContentPage = async () => ({
      created: false,
      reason: "parent_not_found",
    });
    const result = await createContentPage(
      { ...happyInput(), parentId: "page_parent" },
      { repo },
    );
    expect(result.success).toBe(false);
    if (result.success === false) {
      expect(result.reason).toBe("parent_not_found");
    }
  });
});

// ─── 6. Happy path + ordering ─────────────────────────────────────

describe("createContentPage — happy path", () => {
  it("returns the auto-assigned position from the port (first page in new product → position 1)", async () => {
    const { repo, state } = mkStubRepo();
    state.createResult = {
      created: true,
      page: {
        id: "page_first",
        productId: "product_1",
        parentId: null,
        slug: "intro",
        position: 1,
        status: "draft",
        publishedAt: null,
        createdAt: new Date("2026-07-19T13:00:00.000Z"),
        updatedAt: new Date("2026-07-19T13:00:00.000Z"),
      },
    };
    const result = await createContentPage(happyInput(), { repo });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.page.position).toBe(1);
      expect(result.page.id).toBe("page_first");
      expect(result.page.slug).toBe("intro");
    }
  });

  it("returns the auto-assigned position from the port (subsequent page under same parent → position 7)", async () => {
    // Position is computed by the adapter's MAX+1 subquery. The use
    // case doesn't care about the value — only that it's forwarded
    // verbatim. This locks the contract.
    const { repo, state } = mkStubRepo();
    // Wire the parent lookup: parentId "page_parent" must belong to
    // the same product (default fixture) so the parent check passes.
    state.pageResult = { productId: "product_1" };
    state.createResult = {
      created: true,
      page: {
        id: "page_sub",
        productId: "product_1",
        parentId: "page_parent",
        slug: "lesson-7",
        position: 7,
        status: "draft",
        publishedAt: null,
        createdAt: new Date("2026-07-19T13:00:00.000Z"),
        updatedAt: new Date("2026-07-19T13:00:00.000Z"),
      },
    };
    const result = await createContentPage(
      { ...happyInput(), parentId: "page_parent", slug: "lesson-7" },
      { repo },
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.page.position).toBe(7);
      expect(result.page.parentId).toBe("page_parent");
    }
  });

  it("forwards parent's parentId to the port verbatim on success", async () => {
    const { repo, state } = mkStubRepo();
    state.pageResult = { productId: "product_1" };
    state.createResult = {
      created: true,
      page: {
        id: "page_child",
        productId: "product_1",
        parentId: "page_parent",
        slug: "child-page",
        position: 2,
        status: "draft",
        publishedAt: null,
        createdAt: new Date("2026-07-19T13:00:00.000Z"),
        updatedAt: new Date("2026-07-19T13:00:00.000Z"),
      },
    };
    const result = await createContentPage(
      { ...happyInput(), parentId: "page_parent", slug: "child-page" },
      { repo },
    );
    expect(result.success).toBe(true);
    expect(state.lastCreateInput?.parentId).toBe("page_parent");
  });
});

// ─── 7. Plumbing — status defaults / inputs ───────────────────────

describe("createContentPage — input plumbing", () => {
  it("defaults status to 'draft' when omitted (forwarded to port)", async () => {
    const { repo, state } = mkStubRepo();
    await createContentPage(happyInput(), { repo });
    expect(state.lastCreateInput?.status).toBe("draft");
  });

  it("forwards a supplied status to the port verbatim", async () => {
    const { repo, state } = mkStubRepo();
    await createContentPage(
      { ...happyInput(), status: "published" },
      { repo },
    );
    expect(state.lastCreateInput?.status).toBe("published");
  });

  it("does NOT pass actorId to createContentPage (port doesn't need it)", async () => {
    // The use case has already verified ownership; the port trusts
    // the productId-correct context. Confirm the port contract.
    const { repo, state } = mkStubRepo();
    await createContentPage(happyInput(), { repo });
    expect(state.lastCreateInput).toBeDefined();
    // `actorId` is NOT in CreateContentPageInputPort (TS will catch
    // a future regression that tries to add it; this test documents).
    const portInput = state.lastCreateInput as Record<string, unknown>;
    expect("actorId" in portInput).toBe(false);
  });

  it("forwards productId + slug + parentId to the port", async () => {
    const { repo, state } = mkStubRepo();
    state.pageResult = { productId: "product_1" };
    await createContentPage(
      {
        ...happyInput(),
        parentId: "page_parent",
        slug: "advanced-topics",
      },
      { repo },
    );
    expect(state.lastCreateInput).toEqual({
      productId: "product_1",
      parentId: "page_parent",
      slug: "advanced-topics",
      status: "draft",
    });
  });
});

// ─── 8. Defensive input guards ────────────────────────────────────

describe("createContentPage — defensive guards (no port call)", () => {
  it("returns not_found when both actorId AND productId are empty (collapsed)", async () => {
    const { repo, state } = mkStubRepo();
    const result = await createContentPage(
      { ...happyInput(), actorId: "", productId: "" },
      { repo },
    );
    expect(result.success).toBe(false);
    if (result.success === false) {
      expect(result.reason).toBe("not_found");
    }
    // No port call for empty input.
    expect(state.findOwnerCallCount).toBe(0);
    expect(state.findPageCallCount).toBe(0);
    expect(state.createCallCount).toBe(0);
  });
});

// ─── 9. Discriminated-union shape (compile-time exhaustiveness) ───

describe("createContentPage — discriminated-result shape", () => {
  it("success: true returns { page: ContentPageRecord } with all required fields", async () => {
    const { repo, state } = mkStubRepo();
    const result = await createContentPage(happyInput(), { repo });
    expect(result.success).toBe(true);
    if (result.success) {
      // Discriminator narrows: on `success: true`, `page` is the
      // canonical ContentPageRecord shape (compile-time guarantee).
      const _page: ContentPageRecord = result.page;
      expect(_page.id).toBe(state.createResult.created
        ? (state.createResult as { page: ContentPageRecord }).page.id
        : "");
    } else {
      throw new Error("Expected success branch — got " + result.reason);
    }
  });

  it("invalid_slug denial carries a ZodError", async () => {
    const { repo } = mkStubRepo();
    const result = await createContentPage(
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

  it("invalid_status denial carries a ZodError", async () => {
    const { repo } = mkStubRepo();
    const result = await createContentPage(
      {
        ...happyInput(),
        status: "rejected" as unknown as "draft",
      },
      { repo },
    );
    if (!result.success && result.reason === "invalid_status") {
      const _err: z.ZodError = result.error;
      expect(_err).toBeInstanceOf(z.ZodError);
    } else {
      throw new Error("Expected invalid_status branch");
    }
  });
});
