/**
 * src/components/public/ReaderContent.tsx
 *
 * Public reader's content body: renders the page's
 * structured `ContentDocumentV1` blocks via the canonical
 * `BLOCK_REGISTRY` + sets DOM anchor IDs on headings that
 * the TOC navigates to.
 *
 * ─── Architecture (per ADR-0009 content-source-canonical) ────
 *
 *   - The registry's renderers are the SAME blocks used by
 *     the creator editor (`EditorClient.tsx`). Single source
 *     of truth — the public reader and the editor are kept in
 *     lockstep on every change.
 *   - For headings specifically, the registry's `HeadingBlock`
 *     sets `id="heading-{id}"` on the rendered DOM element.
 *     The reader passes the RAW `block.id` (NOT the prefixed
 *     form) and trusts the registry to add the prefix.
 *
 * ─── The `heading-` prefix convention lives in ONE place ─────
 *
 * The DOM id prefix is owned by `HeadingBlock` in the
 * registry. The TOC's `headingAnchor(blockId)` MUST mirror
 * this same prefix; both sides import a single shared
 * literal. Changing the prefix here is a coordinated change
 * in TWO files (registry + `TableOfContents.headingAnchor`)
 * — never in this file (the reader trusts the registry).
 *
 * ─── Why a thin wrapper around the registry renderers ─────
 *
 * The registry's renderers return ReactNodes that don't carry
 * a `data-block-id` (the editor wraps each block in its own
 * `BlockWrapper` for that reason). The reader doesn't need
 * the wrapper chrome (no drag/drop, no hovered action rail),
 * but it DOES need the block id for future per-block analytics +
 * a11y. We wrap each block in a tiny `<div data-block-id>` so
 * future enhancements don't require a registry change.
 */

import { Fragment } from "react";

import { BLOCK_REGISTRY } from "@/lib/blocks/CONTENT_BLOCK_REGISTRY";
import type { Block, ContentDocumentV1 } from "@/domains/catalog/blocks";

// ─── Public surface ────────────────────────────────────────────

export interface ReaderContentProps {
  document: ContentDocumentV1;
}

// ─── Component ───────────────────────────────────────────────

export function ReaderContent({ document }: ReaderContentProps) {
  if (!document || document.blocks.length === 0) {
    return (
      <p
        data-testid="reader-content-empty"
        className="italic text-cream-text-soft"
      >
        Questa pagina non ha ancora contenuti.
      </p>
    );
  }

  return (
    <article
      data-testid="reader-content"
      data-block-count={document.blocks.length}
      className="prose prose-lg mx-auto max-w-3xl font-sans text-cream-text dark:text-cream-dark-text"
    >
      {document.blocks.map((block) => (
        <BlockWrapper key={block.id} block={block} />
      ))}
    </article>
  );
}

// ─── BlockWrapper ─────────────────────────────────────────────

/**
 * Renders one block via the registry. The outer
 * `<div data-block-id>` is a per-block accessibility +
 * analytics hook (no chrome beyond a thin className).
 */
function BlockWrapper({ block }: { block: Block }) {
  return (
    <div
      data-block-id={block.id}
      data-block-type={block.type}
      className="my-4"
    >
      <BlockRenderer block={block} />
    </div>
  );
}

// ─── BlockRenderer ────────────────────────────────────────────

/**
 * Direct registry lookup by `block.type`. We DON'T wrap in
 * try/catch — the Zod schema (validated at write time)
 * guarantees `block.type` is a `BlockType`; if a corrupted
 * row slips through, the unknown-type fallback surfaces a
 * clear inline error message.
 *
 * IMPORTANT: We pass `id: block.id` (the RAW block id, NOT
 * `heading-{blockId}`). The registry's `HeadingBlock` owns
 * the `heading-` prefix; double-prefixing here would break
 * the TOC anchor targets (see file header).
 */
function BlockRenderer({ block }: { block: Block }) {
  const entry = BLOCK_REGISTRY[block.type];
  if (!entry) {
    return (
      <p className="italic text-cream-orange" data-testid="reader-unknown-block">
        Blocco non riconosciuto: {String(block.type)}
      </p>
    );
  }

  // Render through the registry. Props + id are spread;
  // the entry's `render` callback handles the per-type
  // element creation (h1/h2/h3, p, ul/ol, hr, etc.). For
  // headings, the HeadingBlock appends the `heading-` prefix
  // internally — we never duplicate that work here.
  return (
    <Fragment>
      {entry.render({
        ...((block.props as Record<string, unknown>) ?? {}),
        id: block.id,
      } as Parameters<typeof entry.render>[0])}
    </Fragment>
  );
}
