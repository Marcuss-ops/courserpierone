/**
 * src/lib/shared/build-tree.ts
 *
 * Shared tree-builder utility for parentId-backed hierarchical
 * data (ContentPage rows in the catalog domain).
 *
 * ─── Why extracted (vs inlined in SidebarTree.tsx) ────────────
 *
 * The same O(N)-via-Map construction is used by:
 *   - `src/components/creator/SidebarTree.tsx` (creator editor sidebar)
 *   - `src/components/public/ReaderSidebar.tsx` (student reader sidebar)
 *
 * Inlining the function in both files would mean a single bug
 * fixed in one place would still live in the other. Extracting
 * to a tiny utility (this file) is the canonical "fix once,
 * cover everywhere" choice. The function is stable enough that
 * version drift is not a concern.
 *
 * ─── Algorithm ─────────────────────────────────────────────
 *
 *   1. First pass: index every row into `byId` Map keyed by
 *      `id` (so children can locate parents in O(1)).
 *   2. Second pass: walk the byId values; for each row whose
 *      `parentId` resolves to a known parent, append to the
 *      parent's `children[]`. Otherwise append to `roots`.
 *   3. Recursive sort: every level sorted by `position` ASC.
 *      The DB-side `ORDER BY (parentId, position)` is the
 *      authoritative ordering — this client-side sort is the
 *      resilience layer for optimistic reorder.
 *
 * Complexity: O(N) construction + O(N log N) sort = O(N log N).
 *
 * ─── Generic over `position` shape ─────────────────────────────
 *
 * The function is generic over the row type. Callers supply
 * `{ id, parentId, position }` plus any extra fields (e.g.
 * `title`, `slug`, `status`); the resulting `TreeNode<T>` keeps
 * the row verbatim so the rendered output can access every
 * field without re-derivation.
 *
 * Defensive orphan handling: a row whose `parentId` does NOT
 * resolve in the byId Map is treated as a root. This protects
 * against data drift — e.g. a deleted parent whose children
 * weren't cascaded, OR a row whose parentId was never bound.
 * Promoting orphans to root keeps the tree deterministic;
 * the renderer can decide whether to flag the orphan visually.
 */

export interface TreeBuildableRow {
  id: string;
  parentId: string | null;
  position: number;
}

export interface TreeNode<TRow extends TreeBuildableRow> {
  row: TRow;
  children: TreeNode<TRow>[];
}

/**
 * Convert a flat list to a forest, sorted (recursively) by
 * `position` ASC. The returned `roots[]` is the top of the
 * forest; pass to your renderer for nested traversal.
 */
export function buildTree<TRow extends TreeBuildableRow>(
  rows: TRow[],
): TreeNode<TRow>[] {
  // First pass: every row becomes a node with an empty
  // children array. We never mutate `row` itself — the
  // TreeNode is a structural wrapper that the renderer can
  // walk without losing the row identity.
  const byId = new Map<string, TreeNode<TRow>>();
  for (const row of rows) {
    byId.set(row.id, { row, children: [] });
  }

  // Second pass: classify root vs child. We iterate byId.values()
  // so the order is the same on every render — the sort step at
  // the end makes that irrelevant for visual output, but it
  // means dev-mode renders are stable.
  const roots: TreeNode<TRow>[] = [];
  for (const node of byId.values()) {
    const parentId = node.row.parentId;
    if (parentId !== null && byId.has(parentId)) {
      byId.get(parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Sort every level by position ASC. The recursive sort
  // is necessary because optimistic reorder on the creator
  // side can rewrite `position` WITHOUT touching the DB;
  // the client-side sort is the source of truth for the
  // current view order.
  const sortRec = (nodes: TreeNode<TRow>[]): void => {
    nodes.sort((a, b) => a.row.position - b.row.position);
    for (const n of nodes) sortRec(n.children);
  };
  sortRec(roots);
  return roots;
}
