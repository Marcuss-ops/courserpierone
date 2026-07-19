/**
 * src/components/product/ProductDocumentSection.tsx
 *
 * Renders a `ContentDocumentV1` document for the public product
 * landing page (long-form Notion-like description).
 *
 * ─── Why "use client" ────────────────────────────────────────────
 *
 * The product landing page composes sections inside funnel
 * orchestrators (`src/components/funnel/{lumio,h612,horizon}/`),
 * which are client components (`"use client"` directive).
 * Importing a module without `"use client"` from a client
 * component is invalid in Next.js App Router — the import
 * boundary breaks. So this module declares `"use client"` to
 * satisfy the boundary contract, even though the renderer is
 * PURE (no hooks, no state, no effects) and could trivially
 * run server-side too.
 *
 * Server-side rendering is preserved end-to-end: the route
 * page (Server Component) fetches the document, then renders
 * `<ProductDocumentSection document={doc} />`. The component
 * itself is included in the client bundle for the funnel,
 * but the FIRST paint on first request is server-rendered
 * (Next.js renders client components server-side too — they
 * hydrate on the client afterwards).
 *
 * ─── Architectural alignment with public-reader ───────────────────
 *
 * The canonical block renderer is `src/components/public/ReaderContent.tsx`
 * (mirrors Phase 1 work). This section component matches that
 * pattern verbatim:
 *   - Loops over `document.blocks`, dispatches to
 *     `BLOCK_REGISTRY[block.type].render(...)`.
 *   - Returns `null` early for empty documents (zero blocks).
 *   - Wraps each block in a `Fragment` keyed by `block.id`
 *     (key requirement) — NO extra wrapper `<div>` (the
 *     registry's render output owns the DOM).
 *   - Unknown block types are silently skipped (forward-compat
 *     for future block types not yet registered).
 *
 * The `id` prop is the RAW block id from the document; the
 * registry's `HeadingBlock` prepends `heading-` to form the
 * DOM id (mirror of the public-reader heading anchor
 * convention in `src/components/public/TableOfContents.tsx`).
 *
 * ─── Reading `document.blocks` contract ───────────────────────────
 *
 * The document is validated at WRITЕ by `parseContentDocumentV1`
 * (defined in `src/domains/catalog/blocks/document.ts`), which
 * enforces `schemaVersion: 1` + every block matches `blockSchema`.
 * At READ time we TRUST the schema; if a row is somehow corrupted
 * (manual DB mutation, legacy import, migration bug), the adapter
 * surfaces `document: null` and the use case collapses to
 * `not_found`. So at this rendering boundary, we never see a
 * malformed document.
 *
 * ─── Import path note ────────────────────────────────────────────
 *
 * `BLOCK_REGISTRY` lives in `CONTENT_BLOCK_REGISTRY.tsx` (the
 * React-aware file). The sibling `.ts` file exports the older
 * `CONTENT_BLOCK_REGISTRY` (a non-React TS-only registry). The
 * suffix-explicit import below is unambiguous regardless of
 * tsconfig `moduleResolution` (bundler/node) — `.tsx` wins,
 * the React render fns are imported, the prop shapes are typed
 * with React node returns.
 */

"use client";

import { Fragment } from "react";

import type { ContentDocumentV1 } from "@/domains/catalog/blocks/document";
import { BLOCK_REGISTRY } from "@/lib/blocks/CONTENT_BLOCK_REGISTRY";

export interface ProductDocumentSectionProps {
  /** The ContentDocumentV1 to render. */
  document: ContentDocumentV1;
  /**
   * Optional className applied to the outer section. Forwarded
   * by the funnel orchestrator for layout alignment with the
   * surrounding template.
   */
  className?: string;
  /**
   * Optional aria-label for the section. Useful when the page
   * has multiple `<ProductDocumentSection>` instances.
   */
  ariaLabel?: string;
}

/**
 * Render a `ContentDocumentV1` document as a sequence of blocks.
 *
 * Pure functional component. Returns `null` for an empty document
 * (zero blocks) — the wrapping section's padding is the caller's
 * responsibility (omit the section entirely when null).
 */
export function ProductDocumentSection({
  document,
  className,
  ariaLabel,
}: ProductDocumentSectionProps) {
  if (!document.blocks.length) return null;

  return (
    <section
      aria-label={ariaLabel ?? "Long-form product description"}
      className={className ?? "mx-auto max-w-3xl px-6 py-12 space-y-6"}
      data-testid="product-document-section"
    >
      {document.blocks.map((block) => {
        const entry = BLOCK_REGISTRY[block.type];
        if (!entry) {
          // Forward-compat: a block type registered in a future
          // commit may exist in the document before the registry
          // is updated. Skip silently rather than crashing —
          // the page's other sections still render, and a future
          // migration job can backfill / re-render lost blocks.
          //
          // No `console.warn` here on purpose:
          //   1. `BlockType` is exhaustively typed, so this branch
          //      is unreachable in production unless the document
          //      was hand-corrupted. WARN would be noise.
          //   2. `process.env.NODE_ENV !== "production"` checks
          //      pollute vitest output (NODE_ENV = "test" in vitest).
          //   3. Use `findInvalidBlocks()` from the registry at
          //      WRITE-time to catch this — read is best-effort.
          return null;
        }
        // `id` is RAW (registry's HeadingBlock prepends "heading-").
        const props = { ...(block.props ?? {}), id: block.id } as Record<
          string,
          unknown
        >;
        return (
          <Fragment key={block.id}>{entry.render(props as never)}</Fragment>
        );
      })}
    </section>
  );
}
