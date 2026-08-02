/**
 * src/components/content-block-renderer.tsx
 *
 * Generic, chrome-less React wrapper around `BLOCK_REGISTRY`
 * that renders a `ContentDocumentV1` document by dispatching
 * each block to its registered renderer.
 *
 * ─── Why this exists alongside `ProductDocumentSection` ─────────
 *
 * Two consumers need the same primitive ("for every block in the
 * document, call `BLOCK_REGISTRY[type].render(...)`") but want
 * DIFFERENT surrounding chrome:
 *
 *   - `ProductDocumentSection` (public product landing) wraps the
 *     output in `<section data-testid="...">` with funnel-aware
 *     className + aria-label.
 *   - `ReaderContent` (student reader) wraps the output in
 *     `<article data-block-count="...">` and per-block
 *     `<div data-block-id>` for analytics.
 *
 * Both wrappers used to inline the same `document.blocks.map(...)`
 * loop. To honour ADR-0016 §1 ("no duplicated logic between
 * editor, API, renderer and translator"), this component owns the
 * canonical block-dispatch loop. `ProductDocumentSection` and
 * `ReaderContent` will compose into it in a follow-up; for the
 * MVP we ship the primitive so the preview demo + future
 * consumers have a single, dependable home.
 *
 * ─── Design choices ─────────────────────────────────────────────
 *
 *   - **No outer wrapper element.** Callers own the surrounding
 *     `<section>` / `<article>` / `<div>` and pass it as the
 *     `container` slot. This keeps the renderer composable into
 *     tables-of-contents, modals, print views, etc. without
 *     duplicating chrome.
 *
 *   - **Server-renderable.** No `"use client"` directive — the
 *     registry's render functions are pure (no hooks, no state,
 *     no effects). The component is safely rendered on the
 *     server by Next.js route handlers / server components.
 *
 *   - **`Fragment` per block.** Each block is keyed by its stable
 *     `id` so React reconciliation survives reordering. No extra
 *     DOM wrapper is emitted (registry output owns the markup).
 *
 *   - **Unknown block types are silently skipped.** Forward-compat
 *     for a future block type that exists in the document but
 *     hasn't been registered yet — the page renders the known
 *     blocks, the unknown one is a no-op. Use
 *     `findInvalidBlocks()` from the registry at WRITE-time to
 *     catch this before the read path.
 *
 * ─── Reading `document.blocks` contract ─────────────────────────
 *
 * The document is validated at WRITЕ by `parseContentDocumentV1`
 * (see `src/domains/catalog/blocks/document.ts`), which enforces
 * `schemaVersion: 1` + every block matches `blockSchema`. At
 * READ time we trust the schema: a corrupted row surfaces
 * `document: null` from the adapter and the consumer collapses
 * to `not_found`. So at this rendering boundary, we never see a
 * malformed document.
 *
 * ─── `id` propagation ───────────────────────────────────────────
 *
 * The registry's `HeadingBlock` prepends `heading-` to the raw
 * block id to form the DOM id (mirror of the public-reader TOC
 * anchor convention in `src/components/public/TableOfContents.tsx`).
 * We pass the RAW block id and trust the registry to add the
 * prefix — NEVER double-prefix here.
 */

import { Fragment } from "react";

import { BLOCK_REGISTRY } from "@/lib/blocks/BLOCK_REGISTRY";
import type { ContentDocumentV1 } from "@/domains/catalog/blocks";

// ─── Public surface ────────────────────────────────────────────

export interface ContentBlockRendererProps {
  /**
   * The `ContentDocumentV1` to render. Caller is responsible for
   * narrowing (e.g. `document ?? null`) and skipping the section
   * entirely when the document is absent.
   */
  document: ContentDocumentV1;
}

// ─── Component ─────────────────────────────────────────────────

/**
 * Render a `ContentDocumentV1` document as a sequence of blocks.
 *
 * Returns `null` for an empty document (zero blocks) — the
 * caller's surrounding chrome is omitted by them, not by us.
 *
 * Pure functional component. Server-renderable. No hooks.
 */
export function ContentBlockRenderer({
  document,
}: ContentBlockRendererProps) {
  if (!document || document.blocks.length === 0) {
    return null;
  }

  return (
    <>
      {document.blocks.map((block) => {
        const entry = BLOCK_REGISTRY[block.type];
        if (!entry) {
          // See file header: unknown block types are silently
          // skipped (forward-compat for not-yet-registered types).
          return null;
        }
        // `id` is RAW (registry's HeadingBlock prepends "heading-").
        // The spread on `block.props` is the registry's expected
        // call shape — every entry destructures its specific props
        // (level, variant, items, content) from the spread arg.
        const props = {
          ...((block.props as Record<string, unknown>) ?? {}),
          ...( "content" in block ? { content: block.content } : {}),
          id: block.id,
        } as Parameters<typeof entry.render>[0];
        const render = entry.render as (value: unknown) => import("react").ReactNode;
        return <Fragment key={block.id}>{render(props)}</Fragment>;
      })}
    </>
  );
}
