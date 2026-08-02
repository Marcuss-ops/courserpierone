/**
 * src/domains/catalog/content-pages/prisma-reorder-content-pages-repository.test.ts
 *
 * Unit tests for `prismaReorderContentPagesRepository` with the
 * `@/lib/db/prisma` client mocked via `vi.mock` + `vi.hoisted`.
 *
 * ─── Why mock-prisma here ───────────────────────────────────────
 *
 * The adapter's meaningful surface is the `$transaction` shape
 * (one UPDATE per entry, all-or-nothing commit) + the read
 * methods' projection. Mocking the Prisma client surfaces
 * these branching points without a test DB:
 *
 *   - `findUnique` returning null → `{ creatorId } | null`
 *   - `findMany` returning the scope's pageId set
 *   - `$transaction` called with N `update` promises, one per entry
 *   - `applyReorder` returns `{ applied: true }` on commit
 *   - empty entries batch → no-op success (defensive guard)
 *
 * The `$transaction` mock is a `vi.fn()` that resolves to an
 * array of mock rows — we assert the SHAPE of the call (length
 * matches entries, each call updates the right pageId →
 * position pair) without exercising the real PG transaction
 * semantics. The integration test (real DB) covers the actual
 * all-or-nothing commit + row-lock serialization.
 *
 * ─── Test posture ───────────────────────────────────────────────
 *
 *   - `vi.hoisted` lifts the mock above `vi.mock`'s hoisting.
 *   - `beforeEach(vi.clearAllMocks)` resets state between cases.
 *   - We assert the `pageId → position` mapping by extracting
 *     the `where` + `data.position` from each captured call.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    product: {
      findUnique: vi.fn(),
    },
    contentPage: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));

import { prismaReorderContentPagesRepository } from "./prisma-reorder-content-pages-repository";

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── findProductOwner ───────────────────────────────────────────

describe("prismaReorderContentPagesRepository — findProductOwner", () => {
  it("returns null when productId is empty (defensive)", async () => {
    const result = await prismaReorderContentPagesRepository.findProductOwner({
      productId: "",
    });
    expect(result).toBeNull();
    expect(mockPrisma.product.findUnique).not.toHaveBeenCalled();
  });

  it("returns null when the product row is missing", async () => {
    mockPrisma.product.findUnique.mockResolvedValue(null);
    const result = await prismaReorderContentPagesRepository.findProductOwner({
      productId: "p-missing",
    });
    expect(result).toBeNull();
    expect(mockPrisma.product.findUnique).toHaveBeenCalledWith({
      where: { id: "p-missing" },
      select: { creatorId: true },
    });
  });

  it("returns { creatorId } on a hit", async () => {
    mockPrisma.product.findUnique.mockResolvedValue({ creatorId: "u-creator-1" });
    const result = await prismaReorderContentPagesRepository.findProductOwner({
      productId: "p-1",
    });
    expect(result).toEqual({ creatorId: "u-creator-1" });
  });

  it("forwards arbitrary errors to the caller", async () => {
    mockPrisma.product.findUnique.mockRejectedValue(new Error("DB down"));
    await expect(
      prismaReorderContentPagesRepository.findProductOwner({ productId: "p-1" }),
    ).rejects.toThrow("DB down");
  });
});

// ─── listContentPagesInScope ────────────────────────────────────

describe("prismaReorderContentPagesRepository — listContentPagesInScope", () => {
  it("returns empty pageIds when productId is empty (defensive)", async () => {
    const result = await prismaReorderContentPagesRepository.listContentPagesInScope(
      { productId: "", parentId: null },
    );
    expect(result).toEqual({ pageIds: [] });
    expect(mockPrisma.contentPage.findMany).not.toHaveBeenCalled();
  });

  it("queries with the provided parentId verbatim (null = top-level scope)", async () => {
    mockPrisma.contentPage.findMany.mockResolvedValue([
      { id: "pg-1" },
      { id: "pg-2" },
    ]);
    const result = await prismaReorderContentPagesRepository.listContentPagesInScope(
      { productId: "p-1", parentId: null },
    );
    expect(result).toEqual({ pageIds: ["pg-1", "pg-2"] });
    expect(mockPrisma.contentPage.findMany).toHaveBeenCalledWith({
      where: { productId: "p-1", parentId: null },
      select: { id: true },
      orderBy: { position: "asc" },
    });
  });

  it("queries with a non-null parentId (sub-page scope)", async () => {
    mockPrisma.contentPage.findMany.mockResolvedValue([{ id: "pg-child-1" }]);
    const result = await prismaReorderContentPagesRepository.listContentPagesInScope(
      { productId: "p-1", parentId: "pg-parent" },
    );
    expect(result).toEqual({ pageIds: ["pg-child-1"] });
    expect(mockPrisma.contentPage.findMany).toHaveBeenCalledWith({
      where: { productId: "p-1", parentId: "pg-parent" },
      select: { id: true },
      orderBy: { position: "asc" },
    });
  });

  it("returns empty pageIds for a scope with no pages", async () => {
    mockPrisma.contentPage.findMany.mockResolvedValue([]);
    const result = await prismaReorderContentPagesRepository.listContentPagesInScope(
      { productId: "p-1", parentId: null },
    );
    expect(result).toEqual({ pageIds: [] });
  });
});

// ─── applyReorder ───────────────────────────────────────────────

describe("prismaReorderContentPagesRepository — applyReorder", () => {
  it("returns applied:true without calling $transaction for an empty entries array (defensive)", async () => {
    const result = await prismaReorderContentPagesRepository.applyReorder({
      productId: "p-1",
      parentId: null,
      entries: [],
      now: new Date(),
    });
    expect(result).toEqual({ applied: true });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("issues one update per entry inside a single $transaction with the shared clock", async () => {
    const FIXED = new Date("2026-07-19T12:00:00.000Z");
    mockPrisma.$transaction.mockResolvedValue([{}, {}, {}]);

    const result = await prismaReorderContentPagesRepository.applyReorder({
      productId: "p-1",
      parentId: null,
      entries: [
        { pageId: "pg-1", newPosition: 3 },
        { pageId: "pg-2", newPosition: 1 },
        { pageId: "pg-3", newPosition: 2 },
      ],
      now: FIXED,
    });

    expect(result).toEqual({ applied: true });

    // $transaction called once with an array of 3 promises.
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    const txArg = mockPrisma.$transaction.mock.calls[0]?.[0] as unknown[];
    expect(Array.isArray(txArg)).toBe(true);
    expect(txArg).toHaveLength(3);

    // Each entry produced one update call against the right
    // pageId + position + the shared clock.
    expect(mockPrisma.contentPage.update).toHaveBeenCalledTimes(3);
    const calls = mockPrisma.contentPage.update.mock.calls;
    const mapping = new Map(
      calls.map((c) => {
        const arg = c[0] as { where: { id: string }; data: { position: number; updatedAt: Date } };
        return [arg.where.id, arg.data.position];
      }),
    );
    expect(mapping.get("pg-1")).toBe(3);
    expect(mapping.get("pg-2")).toBe(1);
    expect(mapping.get("pg-3")).toBe(2);
    // Same `now` for every row — batch-internal consistency.
    for (const c of calls) {
      const arg = c[0] as { data: { updatedAt: Date } };
      expect(arg.data.updatedAt).toBe(FIXED);
    }
  });

  it("lets $transaction errors bubble (Prisma rolls back automatically)", async () => {
    mockPrisma.$transaction.mockRejectedValue(new Error("deadlock detected"));
    await expect(
      prismaReorderContentPagesRepository.applyReorder({
        productId: "p-1",
        parentId: null,
        entries: [{ pageId: "pg-1", newPosition: 1 }],
        now: new Date(),
      }),
    ).rejects.toThrow("deadlock detected");
  });
});
