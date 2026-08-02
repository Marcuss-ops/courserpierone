"use client";

/**
 * src/components/creator/SidebarTree.tsx
 *
 * Creator-side sidebar for the Notion-like page editor.
 *
 * Responsibilities:
 *   1. Build a tree (root nodes + nested children) from a flat
 *      server-supplied array — DELEGATED to the shared
 *      `buildTree` utility in `@/lib/shared/build-tree` (so
 *      the public reader's `ReaderSidebar` shares the same
 *      algorithm).
 *   2. Render the tree as nested <ul>/<li> elements with the
 *      current page highlighted, depth-based indentation,
 *      and up/down buttons on hover.
 *   3. Wire a simple re-order action: clicking "Up" or
 *      "Down" on a row optimistically swaps the position
 *      with the adjacent sibling, then POSTs the FULL
 *      updated sibling set to
 *      `/api/creator/products/{productId}/pages/reorder`.
 *      The route enforces "full sibling set" + `[1..N]`
 *      contiguous positions. On HTTP failure, the
 *      optimistic state is reverted.
 *   4. Show the saving state (Loader2, polite aria-live) and
 *      the error state (inline red badge with `role="alert"`).
 *
 * ─── Why no @dnd-kit here (deliberate) ─────────────────────────
 *
 * The user spec ("riordino semplice") calls for minimal drag
 * affordances. Up/down arrows are accessible by default
 * (keyboard-friendly, no drag library) AND keep the bundle
 * slim. The dnd-kit investment lives in the block editor
 * (where cross-block reordering is the editor's primary
 * affordance); the page-tree reorder is a sidebar-only action.
 */

import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  FileText,
  Folder,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useState, useTransition } from "react";

import {
  buildTree,
  type TreeNode,
} from "@/lib/shared/build-tree";

// ─── Server → Client props ─────────────────────────────────────

/**
 * Flat page row passed by the Server Component shell.
 *
 * The Server Component fetches these via `listCreatorPages`,
 * which returns `ListCreatorPagesPageRow`. We narrow the
 * shape here to the UI-facing fields (the `defaultLanguage`
 * + `updatedAt` fields are intentionally NOT exposed — the
 * sidebar needs only id/parent/slug/position/title/status).
 */
export interface SidebarPageRow {
  id: string;
  parentId: string | null;
  slug: string;
  position: number;
  status: "draft" | "published" | "archived";
  title: string | null;
}

export interface SidebarTreeProps {
  productId: string;
  pages: SidebarPageRow[];
  /** The page currently being edited — highlighted in the tree. */
  currentPageId: string;
  /** Optional locale for the editor route (e.g. "it", "en"). */
  locale?: string;
}

// Local alias for the shared tree node type so existing
// call sites stay legible. The implementation of the build
// itself lives in `@/lib/shared/build-tree` (one source of
// truth shared with the public reader's `ReaderSidebar`).
type SidebarNode = TreeNode<SidebarPageRow>;

// ─── Tiny client wrappers (stable references for callbacks) ─────

/**
 * Build a friendly error message from an unknown fetch
 * response. We DON'T surface the raw server payload verbatim
 * (it may carry internal reasons); we surface the status code
 * + the reason field if the body is JSON.
 */
async function safeReadError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { reason?: string };
    if (body && typeof body.reason === "string") {
      return `Riordino non riuscito (${res.status}): ${body.reason}`;
    }
  } catch {
    // intentional: fall through to the generic message
  }
  return `Riordino non riuscito (HTTP ${res.status})`;
}

// ─── Component ───────────────────────────────────────────────

export function SidebarTree({
  productId,
  pages,
  currentPageId,
  locale,
}: SidebarTreeProps) {
  const pagesKey = pages
    .map(
      (page) =>
        `${page.id}:${page.parentId ?? "x"}:${page.position}:${page.slug}:${page.status}:${page.title ?? ""}`,
    )
    .join("|");

  return (
    <SidebarTreeState
      key={pagesKey}
      productId={productId}
      pages={pages}
      currentPageId={currentPageId}
      locale={locale}
    />
  );
}

function SidebarTreeState({
  productId,
  pages,
  currentPageId,
  locale,
}: SidebarTreeProps) {
  const [optimistic, setOptimistic] = useState<SidebarPageRow[]>(pages);
  const [, startTransition] = useTransition();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tree = useMemo(() => buildTree(optimistic), [optimistic]);

  // ─── Reorder scope helper ──────────────────────────────────
  //
  // Returns the ordered sibling list for a given parent
  // scope. Used by Up/Down to identify the boundary index.
  const siblingsInScope = useCallback(
    (parentId: string | null): SidebarPageRow[] => {
      return optimistic
        .filter((p) => p.parentId === parentId)
        .slice()
        .sort((a, b) => a.position - b.position);
    },
    [optimistic],
  );

  // ─── Reorder action ────────────────────────────────────────
  //
  // Posts the FULL sibling set (the route's contraction is
  // `[1..N]` contiguous positions on the complete scope).
  // Optimistic: rewrite positions immediately, then either
  // adopt the server-canonical order OR revert.
  const reorderScope = useCallback(
    async (parentId: string | null, ordered: SidebarPageRow[]) => {
      const prev = optimistic;
      // Build the optimistic next state: keep siblings in
      // this scope with their new positions, leave siblings
      // in OTHER scopes untouched.
      const renumbered = new Map<string, number>();
      ordered.forEach((p, i) => renumbered.set(p.id, i + 1));
      const next = optimistic.map((p) => {
        const newPos = renumbered.get(p.id);
        return newPos !== undefined ? { ...p, position: newPos } : p;
      });
      setOptimistic(next);
      setError(null);
      setPending(true);

      try {
        const res = await fetch(
          `/api/creator/products/${encodeURIComponent(productId)}/pages/reorder`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              parentId,
              orderedPages: ordered.map((p, i) => ({
                pageId: p.id,
                newPosition: i + 1,
              })),
            }),
          },
        );
        if (!res.ok) {
          throw new Error(await safeReadError(res));
        }
        const data = (await res.json()) as {
          reordered?: { pageId: string; position: number }[];
        };
        const canonical = Array.isArray(data.reordered) ? data.reordered : [];
        if (canonical.length > 0) {
          // Server is the canonical source for the new
          // positions in this scope. Adopt verbatim.
          const positions = new Map(
            canonical.map((r) => [r.pageId, r.position]),
          );
          const canonicalNext = next.map((p) => {
            const pos = positions.get(p.id);
            return pos !== undefined ? { ...p, position: pos } : p;
          });
          startTransition(() => {
            setOptimistic(canonicalNext);
          });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Riordino non riuscito";
        setError(msg);
        // Revert optimistic to the captured previous state.
        startTransition(() => {
          setOptimistic(prev);
        });
      } finally {
        setPending(false);
      }
    },
    [optimistic, productId],
  );

  // ─── Up / Down affordances ─────────────────────────────────
  //
  // The buttons are SIMPLE: swap with the adjacent sibling in
  // the local scope. The POST that fires sends the FULL
  // updated sibling set, so the route's invariant check
  // (contiguous positions, full set) is satisfied without
  // the client computing anything fancy.

  const moveUp = useCallback(
    (pageId: string) => {
      const target = optimistic.find((p) => p.id === pageId);
      if (!target) return;
      const scope = siblingsInScope(target.parentId);
      const idx = scope.findIndex((p) => p.id === pageId);
      if (idx <= 0) return;
      const next = scope.slice();
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      void reorderScope(target.parentId, next);
    },
    [optimistic, siblingsInScope, reorderScope],
  );

  const moveDown = useCallback(
    (pageId: string) => {
      const target = optimistic.find((p) => p.id === pageId);
      if (!target) return;
      const scope = siblingsInScope(target.parentId);
      const idx = scope.findIndex((p) => p.id === pageId);
      if (idx < 0 || idx >= scope.length - 1) return;
      const next = scope.slice();
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      void reorderScope(target.parentId, next);
    },
    [optimistic, siblingsInScope, reorderScope],
  );

  // ─── Render ───────────────────────────────────────────────

  return (
    <aside
      data-testid="sidebar-tree"
      data-product-id={productId}
      data-current-page={currentPageId}
      className="border-r border-cream-border bg-cream-card/50 dark:border-cream-dark-border dark:bg-cream-dark-surface/40"
    >
      <header className="sticky top-0 z-10 border-b border-cream-border bg-cream-card/80 px-4 py-3 backdrop-blur dark:border-cream-dark-border dark:bg-cream-dark-surface/80">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-cream-text-soft">
          Pagine
        </h2>
        <p className="mt-0.5 text-xs text-cream-text-soft/70">
          {optimistic.length} {optimistic.length === 1 ? "pagina" : "pagine"}
        </p>
        {pending && (
          <p
            data-testid="sidebar-saving"
            className="mt-1 flex items-center gap-1 text-xs text-cream-text-soft"
            aria-live="polite"
          >
            <Loader2 size={12} className="animate-spin" aria-hidden="true" />
            Riordino in corso…
          </p>
        )}
        {error && (
          <p
            data-testid="sidebar-error"
            className="mt-1 text-xs font-medium text-cream-orange"
            role="alert"
          >
            {error}
          </p>
        )}
      </header>
      <nav className="pb-4" aria-label="Navigazione pagine prodotto">
        {tree.length === 0 ? (
          <p className="px-4 py-6 text-sm italic text-cream-text-soft">
            Nessuna pagina. Creane una per iniziare.
          </p>
        ) : (
          <TreeLevel
            nodes={tree}
            depth={0}
            currentPageId={currentPageId}
            productId={productId}
            locale={locale}
            onMoveUp={moveUp}
            onMoveDown={moveDown}
            siblings={siblingsInScope}
          />
        )}
      </nav>
    </aside>
  );
}

// ─── Tree level (recursive) ────────────────────────────────────

interface TreeLevelProps {
  nodes: SidebarNode[];
  depth: number;
  currentPageId: string;
  productId: string;
  locale?: string;
  onMoveUp: (pageId: string) => void;
  onMoveDown: (pageId: string) => void;
  siblings: (parentId: string | null) => SidebarPageRow[];
}

function TreeLevel({
  nodes,
  depth,
  currentPageId,
  productId,
  locale,
  onMoveUp,
  onMoveDown,
  siblings,
}: TreeLevelProps) {
  return (
    <ul
      className={depth === 0 ? "px-2" : "pl-3"}
      data-testid={depth === 0 ? "sidebar-root-list" : `sidebar-level-${depth}`}
    >
      {nodes.map((node) => {
        const inScope = siblings(node.row.parentId);
        const idx = inScope.findIndex((p) => p.id === node.row.id);
        const isFirst = idx === 0;
        const isLast = idx === inScope.length - 1;
        const isCurrent = node.row.id === currentPageId;
        const title = node.row.title?.trim() || node.row.slug;
        const hasChildren = node.children.length > 0;

        const href = locale
          ? `/creator/products/${encodeURIComponent(productId)}/pages/${encodeURIComponent(node.row.id)}?locale=${encodeURIComponent(locale)}`
          : `/creator/products/${encodeURIComponent(productId)}/pages/${encodeURIComponent(node.row.id)}`;

        return (
          <li
            key={node.row.id}
            data-testid={`sidebar-row-${node.row.id}`}
            data-current={isCurrent ? "true" : "false"}
            data-depth={depth}
            data-position={node.row.position}
            data-status={node.row.status}
            className="my-0.5"
          >
            <div
              className={[
                "group flex items-center gap-1 rounded-md px-2 py-1 text-sm",
                "transition-colors duration-150",
                isCurrent
                  ? "bg-cream-gold/15 text-cream-text dark:bg-cream-dark-gold/15"
                  : "text-cream-text-soft hover:bg-cream-border-soft/50 hover:text-cream-text dark:hover:bg-cream-dark-border/40",
              ].join(" ")}
            >
              <Link
                href={href}
                prefetch={false}
                className="flex flex-1 items-center gap-1.5 truncate rounded focus:outline-none focus:ring-2 focus:ring-cream-gold/60"
                data-testid={`sidebar-link-${node.row.id}`}
                aria-current={isCurrent ? "page" : undefined}
              >
                {hasChildren ? (
                  <ChevronRight
                    size={12}
                    className="shrink-0 opacity-60"
                    aria-hidden="true"
                  />
                ) : (
                  <span className="inline-block w-3 shrink-0" aria-hidden="true" />
                )}
                <FileText
                  size={12}
                  className="shrink-0 opacity-60"
                  aria-hidden="true"
                />
                <span className="truncate" title={title}>
                  {title}
                </span>
                {node.row.status === "draft" && (
                  <span
                    className="ml-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-cream-orange/70"
                    title="Bozza"
                    aria-label="Bozza"
                  />
                )}
              </Link>
              <div className="flex shrink-0 items-center opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => onMoveUp(node.row.id)}
                  disabled={isFirst}
                  aria-label="Sposta su"
                  data-testid={`sidebar-up-${node.row.id}`}
                  className="rounded p-1 text-cream-text-soft hover:bg-cream-border-soft/60 hover:text-cream-text focus:outline-none focus:ring-2 focus:ring-cream-gold/60 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-cream-dark-border/40"
                >
                  <ChevronUp size={12} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => onMoveDown(node.row.id)}
                  disabled={isLast}
                  aria-label="Sposta giù"
                  data-testid={`sidebar-down-${node.row.id}`}
                  className="rounded p-1 text-cream-text-soft hover:bg-cream-border-soft/60 hover:text-cream-text focus:outline-none focus:ring-2 focus:ring-cream-gold/60 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-cream-dark-border/40"
                >
                  <ChevronDown size={12} aria-hidden="true" />
                </button>
              </div>
            </div>
            {hasChildren && (
              <div
                data-testid={`sidebar-children-${node.row.id}`}
                className="ml-3 border-l border-cream-border/60 pl-0 dark:border-cream-dark-border/60"
              >
                <div className="flex items-center gap-1 px-2 py-1 text-[11px] uppercase tracking-wider text-cream-text-soft/70">
                  <Folder size={10} aria-hidden="true" />
                  Sottopagine ({node.children.length})
                </div>
                <TreeLevel
                  nodes={node.children}
                  depth={depth + 1}
                  currentPageId={currentPageId}
                  productId={productId}
                  locale={locale}
                  onMoveUp={onMoveUp}
                  onMoveDown={onMoveDown}
                  siblings={siblings}
                />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
