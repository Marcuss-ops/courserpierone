import {
  ChevronRight as ChevronRightIcon,
  FileText as FileTextIcon,
  Folder as FolderIcon,
} from "lucide-react";
import Link from "next/link";
import { Fragment } from "react";

import { buildTree, type TreeBuildableRow } from "@/lib/shared/build-tree";

// ─── Public surface ────────────────────────────────────────────

/**
 * Minimal shape for the sidebar. The reader only needs the
 * fields it actually renders — id + slug + title for the link,
 * parentId for tree position, position for sibling order, plus
 * any optional badge state (status: draft = pulse dot).
 */
export interface ReaderSidebarPageRow extends TreeBuildableRow {
  slug: string;
  title: string | null;
  /** Optional status badge — `null` to omit dot. */
  status?: "draft" | "published" | "archived" | null;
}

export interface ReaderSidebarProps {
  /** The product's slug — used to build the reader URL prefix. */
  productSlug: string;
  /** Locale segment — used to build the reader URL prefix. */
  locale: string;
  /** The page currently being read — highlighted in the tree. */
  currentPageSlug: string;
  /** Flat list of every published page in the product. */
  pages: ReaderSidebarPageRow[];
}

// ─── Sub-component: row (renders one line of the tree) ─────────

function SidebarRow({
  row,
  depth,
  productSlug,
  locale,
  isCurrent,
}: {
  row: ReaderSidebarPageRow;
  depth: number;
  productSlug: string;
  locale: string;
  isCurrent: boolean;
}) {
  const href = `/${encodeURIComponent(locale)}/products/${encodeURIComponent(productSlug)}/pages/${encodeURIComponent(row.slug)}`;
  const title = row.title?.trim() || row.slug;

  return (
    <li
      data-testid={`reader-sidebar-row-${row.id}`}
      data-current={isCurrent ? "true" : "false"}
      data-depth={depth}
      className="my-0.5"
    >
      <div
        className={[
          "flex items-center gap-1.5 rounded-md px-2 py-1 text-sm",
          "transition-colors duration-150",
          isCurrent
            ? "bg-cream-gold/15 font-medium text-cream-text dark:bg-cream-dark-gold/15"
            : "text-cream-text-soft hover:bg-cream-border-soft/50 hover:text-cream-text dark:hover:bg-cream-dark-border/40",
        ].join(" ")}
      >
        {DepthIndicator({ depth })}
        <Link
          href={href}
          prefetch={false}
          className="flex flex-1 items-center gap-1.5 truncate rounded focus:outline-none focus:ring-2 focus:ring-cream-gold/60"
          data-testid={`reader-sidebar-link-${row.id}`}
          aria-current={isCurrent ? "page" : undefined}
        >
          <FileTextIcon
            size={12}
            className="shrink-0 opacity-60"
            aria-hidden="true"
          />
          <span className="truncate" title={title}>
            {title}
          </span>
          {row.status === "draft" && (
            <span
              className="ml-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-cream-orange/70"
              title="Bozza"
              aria-label="Bozza"
            />
          )}
        </Link>
      </div>
    </li>
  );
}

// ─── Utility: visual depth indicator ───────────────────────────

function DepthIndicator({ depth }: { depth: number }) {
  if (depth === 0) {
    return <span className="inline-block w-3 shrink-0" aria-hidden="true" />;
  }
  return (
    <ChevronRightIcon
      size={10}
      className="shrink-0 text-cream-text-soft/60"
      aria-hidden="true"
    />
  );
}

// ─── Component ───────────────────────────────────────────────

/**
 * Read-only sidebar for the public reader surface.
 *
 * Architecture choices:
 *   - Server Component — no client state needed (no reorder).
 *   - Pure-function tree via the shared `buildTree` utility.
 *   - Each row renders an indented list item; children
 *     appear in a nested `<ul>` with their parent's chevron +
 *     a small "Sottopagine (n)" header for visual grouping.
 *
 * Why no client-side JS: the read-only sidebar needs no
 * reactive state. The current-page highlight is decided at
 * render time (purely based on the `currentPageSlug` prop),
 * so a Server Component is the smallest surface that delivers
 * the right pixels.
 */
export function ReaderSidebar({
  productSlug,
  locale,
  currentPageSlug,
  pages,
}: ReaderSidebarProps) {
  // Build the nested forest once per render. Empty list
  // surfaces the "empty state" affordance below.
  const tree = buildTree(pages);

  if (tree.length === 0) {
    return (
      <aside
        data-testid="reader-sidebar"
        data-product-slug={productSlug}
        className="border-r border-cream-border bg-cream-card/40 px-4 py-6 text-sm italic text-cream-text-soft dark:border-cream-dark-border dark:bg-cream-dark-surface/40"
      >
        Nessuna pagina pubblicata.
      </aside>
    );
  }

  return (
    <aside
      data-testid="reader-sidebar"
      data-product-slug={productSlug}
      data-current-page-slug={currentPageSlug}
      className="border-r border-cream-border bg-cream-card/40 dark:border-cream-dark-border dark:bg-cream-dark-surface/40"
    >
      <nav
        aria-label="Navigazione pagine prodotto"
        className="px-3 py-4"
      >
        <ul
          className="px-1"
          data-testid="reader-sidebar-root-list"
        >
          {tree.map((node) => (
            <ReaderSidebarBranch
              key={node.row.id}
              node={node}
              depth={0}
              productSlug={productSlug}
              locale={locale}
              currentPageSlug={currentPageSlug}
            />
          ))}
        </ul>
      </nav>
    </aside>
  );
}

// ─── Sub-component: branch (recursive) ─────────────────────────

function ReaderSidebarBranch({
  node,
  depth,
  productSlug,
  locale,
  currentPageSlug,
}: {
  node: ReturnType<typeof buildTree<ReaderSidebarPageRow>>[number];
  depth: number;
  productSlug: string;
  locale: string;
  currentPageSlug: string;
}) {
  const isCurrent = node.row.slug === currentPageSlug;
  const hasChildren = node.children.length > 0;

  return (
    <Fragment>
      <SidebarRow
        row={node.row}
        depth={depth}
        productSlug={productSlug}
        locale={locale}
        isCurrent={isCurrent}
      />
      {hasChildren && (
        <li
          data-testid={`reader-sidebar-children-${node.row.id}`}
          className="ml-3 border-l border-cream-border/60 pl-0 dark:border-cream-dark-border/60"
          aria-label={`Sottopagine di ${node.row.title ?? node.row.slug}`}
        >
          <div className="flex items-center gap-1 px-2 py-1 text-[11px] uppercase tracking-wider text-cream-text-soft/70">
            <FolderIcon size={10} aria-hidden="true" />
            Sottopagine ({node.children.length})
          </div>
          <ul
            className="pl-1"
            data-testid={`reader-sidebar-level-${depth + 1}`}
          >
            {node.children.map((child) => (
              <ReaderSidebarBranch
                key={child.row.id}
                node={child}
                depth={depth + 1}
                productSlug={productSlug}
                locale={locale}
                currentPageSlug={currentPageSlug}
              />
            ))}
          </ul>
        </li>
      )}
    </Fragment>
  );
}
