/**
 * src/lib/shared/build-tree.test.ts
 *
 * Unit tests for the shared tree-builder. Covers:
 *   - empty list → empty forest
 *   - all-root list
 *   - nested children (depth > 1)
 *   - orphan (parentId missing) is promoted to root
 *   - sort: position ASC at every level
 *   - stability: same row id maintains its position relative
 *     to siblings when sibling positions change
 */

import { describe, expect, it } from "vitest";

import { buildTree, type TreeBuildableRow } from "./build-tree";

function row(
  id: string,
  parentId: string | null,
  position: number,
): TreeBuildableRow {
  return { id, parentId, position };
}

describe("buildTree — input invariants", () => {
  it("empty list returns empty forest", () => {
    expect(buildTree([])).toEqual([]);
  });

  it("all-root list returns roots in position order", () => {
    const tree = buildTree([
      row("a", null, 2),
      row("b", null, 1),
      row("c", null, 3),
    ]);
    expect(tree.map((n) => n.row.id)).toEqual(["b", "a", "c"]);
    expect(tree[0].children).toEqual([]);
    expect(tree[1].children).toEqual([]);
    expect(tree[2].children).toEqual([]);
  });

  it("nested children attach to their parentId", () => {
    const tree = buildTree([
      row("alpha", null, 1),
      row("beta", null, 2),
      row("alpha-1", "alpha", 1),
      row("alpha-2", "alpha", 2),
      row("alpha-1-1", "alpha-1", 1),
    ]);
    expect(tree.map((n) => n.row.id)).toEqual(["alpha", "beta"]);
    expect(tree[0].children.map((n) => n.row.id)).toEqual([
      "alpha-1",
      "alpha-2",
    ]);
    expect(tree[0].children[0].children.map((n) => n.row.id)).toEqual([
      "alpha-1-1",
    ]);
  });
});

describe("buildTree — defensive orphan handling", () => {
  it("a row whose parentId does not resolve is promoted to root", () => {
    const tree = buildTree([
      row("orphan", "ghost-parent", 1),
      row("real", null, 2),
    ]);
    expect(tree.map((n) => n.row.id)).toEqual(["orphan", "real"]);
  });

  it("a referenced parent appears only once (no duplicate nodes)", () => {
    const tree = buildTree([
      row("parent", null, 1),
      row("child-a", "parent", 1),
      row("child-b", "parent", 2),
    ]);
    // The parent appears once in roots (not also as an orphan).
    expect(tree).toHaveLength(1);
    expect(tree[0].children.map((n) => n.row.id)).toEqual([
      "child-a",
      "child-b",
    ]);
  });
});

describe("buildTree — sort invariants", () => {
  it("sorts positions ASC at every level", () => {
    const tree = buildTree([
      row("r", null, 5),
      row("r-1", "r", 3),
      row("r-2", "r", 1),
      row("r-3", "r", 2),
    ]);
    expect(tree[0].row.id).toBe("r");
    expect(tree[0].children.map((n) => n.row.id)).toEqual([
      "r-2",
      "r-3",
      "r-1",
    ]);
  });

  it("preserves relative sibling order after sort", () => {
    const tree = buildTree([
      row("a", null, 3),
      row("b", null, 3), // tie
      row("c", null, 3), // tie
    ]);
    // Stable sort: input order is preserved when positions tie.
    expect(tree.map((n) => n.row.id)).toEqual(["a", "b", "c"]);
  });
});

describe("buildTree — generic row passthrough", () => {
  it("preserves extra fields on the row (not consumed by the utility)", () => {
    interface ExtraRow extends TreeBuildableRow {
      title: string;
      slug: string;
    }
    const tree = buildTree<ExtraRow>([
      row("x", null, 1) as ExtraRow,
    ]);
    expect(tree[0].row.title).toBeUndefined();
    // The structural type is preserved.
    expect(tree[0].row).toEqual({
      id: "x",
      parentId: null,
      position: 1,
      title: undefined,
      slug: undefined,
    });
  });
});
