"use client";

/**
 * src/app/creator/products/[productId]/pages/[pageId]/EditorClient.tsx
 *
 * The Notion-like creator editor for a single
 * ContentPageTranslation's document.
 *
 * Responsibilities:
 *   1. Hold the editable block list (state).
 *   2. Wire the autosave hook (debounced PUT to the
 *      SaveContentDocument endpoint).
 *   3. Provide "Add block" menu (insertable registry entries).
 *   4. Render `SortableBlockList` with delete / duplicate
 *      / reorder callbacks.
 *   5. Surface SaveStatusBadge (Saving / Saved / Error / ...).
 *
 * Mutations (delete/duplicate/reorder/insert) all update the
 * local state, then call `triggerSave(nextDocument)`. The
 * debounce coalesces rapid successive edits into a single
 * network request.
 *
 * Shape contract with the server component (page.tsx):
 *   - Receives `page`, `translation`, `defaultLocale`,
 *     `expectedRevision` (initial).
 *   - PUTs to `/api/creator/pages/{pageId}/translations/{locale}`
 *     with `{ document, expectedRevision }`.
 *   - The endpoint returns the new revision on success;
 *     the next debounce window's expectedRevision is updated.
 */

import { Plus } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import type { ContentDocumentV1, Block } from "@/domains/catalog/blocks";

import {
  BLOCK_REGISTRY,
  INSERTABLE_BLOCKS,
  makeBlock,
  type BlockType,
} from "@/lib/blocks/CONTENT_BLOCK_REGISTRY";
import { SortableBlockList } from "@/components/editor/SortableBlockList";
import { useAutosave } from "@/components/editor/use-autosave";

// ─── Server → Client props ─────────────────────────────────

export interface EditorClientProps {
  pageId: string;
  productId: string;
  locale: string;
  initialDocument: ContentDocumentV1;
  initialRevision: number;
  saveEndpoint: string;
}

// ─── Component ─────────────────────────────────────────────

export function EditorClient({
  pageId,
  productId,
  locale,
  initialDocument,
  initialRevision,
  saveEndpoint,
}: EditorClientProps) {
  void productId; // available for breadcrumbs / side nav

  const [revision, setRevision] = useState(initialRevision);
  const [blocks, setBlocks] = useState<Block[]>(
    initialDocument.blocks.slice().sort(
      (a, b) => (a.position ?? 0) - (b.position ?? 0),
    ),
  );
  const [menuOpen, setMenuOpen] = useState(false);

  const saveFn = useCallback(
    async (doc: ContentDocumentV1, signal: AbortSignal) => {
      const res = await fetch(saveEndpoint, {
        method: "PUT",
        signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document: doc,
          expectedRevision: revision,
        }),
      });
      if (res.status === 409) {
        const err = new Error("Revision conflict") as Error & {
          status: number;
        };
        err.status = 409;
        throw err;
      }
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status}`) as Error & {
          status: number;
        };
        err.status = res.status;
        throw err;
      }
      const body = (await res.json()) as { revision?: number };
      if (typeof body.revision === "number") {
        setRevision(body.revision);
      }
    },
    [saveEndpoint, revision],
  );

  const { status, error, triggerSave, reset } = useAutosave<ContentDocumentV1>({
    delay: 800,
    saveFn,
  });

  /**
   * Rebuild the document from the current block list. The
   * `position` field is rewritten to be contiguous (0..N-1)
   * so the server-side `position` field is canonical.
   */
  const buildDocument = useCallback((list: Block[]): ContentDocumentV1 => {
    return {
      schemaVersion: 1,
      blocks: list.map((b, i) => ({ ...b, position: i }) as Block),
    };
  }, []);

  // ─── CRUD ───────────────────────────────────────────────

  const onInsert = useCallback(
    (type: BlockType) => {
      setBlocks((prev) => {
        const next = [...prev, makeBlock(type, prev.length)];
        triggerSave(buildDocument(next));
        return next;
      });
      setMenuOpen(false);
    },
    [buildDocument, triggerSave],
  );

  const onDelete = useCallback(
    (id: string) => {
      setBlocks((prev) => {
        const next = prev.filter((b) => b.id !== id);
        triggerSave(buildDocument(next));
        return next;
      });
    },
    [buildDocument, triggerSave],
  );

  const onDuplicate = useCallback(
    (id: string) => {
      setBlocks((prev) => {
        const idx = prev.findIndex((b) => b.id === id);
        if (idx < 0) return prev;
        const original = prev[idx]!;
        const copy = makeBlock(original.type, prev.length);
        // Carry props over (excluding id/position which makeBlock assigns).
        const next = [...prev];
        next.splice(idx + 1, 0, {
          ...copy,
          props: original.props,
        } as Block);
        triggerSave(buildDocument(next));
        return next;
      });
    },
    [buildDocument, triggerSave],
  );

  const onReorder = useCallback(
    (fromId: string, toId: string) => {
      setBlocks((prev) => {
        const fromIdx = prev.findIndex((b) => b.id === fromId);
        const toIdx = prev.findIndex((b) => b.id === toId);
        if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return prev;
        const next = [...prev];
        const moved = next.splice(fromIdx, 1)[0]!;
        next.splice(toIdx, 0, moved);
        triggerSave(buildDocument(next));
        return next;
      });
    },
    [buildDocument, triggerSave],
  );

  // ─── Render ─────────────────────────────────────────────

  const insertable = useMemo(() => INSERTABLE_BLOCKS, []);

  return (
    <div
      data-testid="editor-root"
      data-page-id={pageId}
      data-locale={locale}
      className="mx-auto max-w-3xl px-6 py-10"
    >
      {/* Save status badge (top-right of the editor area). */}
      <div
        data-testid="save-status"
        data-status={status}
        className="sticky top-0 z-10 -mx-6 mb-6 flex items-center justify-end gap-2 bg-cream-bg/80 px-6 py-2 text-xs backdrop-blur dark:bg-cream-dark-bg/80"
        aria-live="polite"
      >
        <SaveStatusBadge status={status} error={error} onReset={reset} />
      </div>

      {/* The block list. */}
      <SortableBlockList
        blocks={blocks}
        onReorder={onReorder}
        onDelete={onDelete}
        onDuplicate={onDuplicate}
      />

      {/* Add block menu. */}
      <div className="mt-6 flex items-center gap-2">
        <button
          type="button"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          data-testid="add-block-toggle"
          onClick={() => setMenuOpen((s) => !s)}
          className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-cream-border px-3 py-2 text-sm text-cream-text-soft hover:bg-cream-border-soft/40 hover:text-cream-text focus:outline-none focus:ring-2 focus:ring-cream-gold/60 dark:border-cream-dark-border dark:text-cream-dark-text-soft dark:hover:text-cream-dark-text"
        >
          <Plus size={14} aria-hidden="true" />
          Add block
        </button>
      </div>

      {menuOpen && (
        <div
          role="menu"
          data-testid="add-block-menu"
          className="mt-2 rounded-md border border-cream-border bg-cream-card p-1 shadow-md dark:border-cream-dark-border dark:bg-cream-dark-surface"
        >
          {insertable.map((entry) => (
            <button
              key={entry.type}
              role="menuitem"
              type="button"
              data-testid={`add-block-${entry.type}`}
              onClick={() => onInsert(entry.type)}
              className="block w-full rounded px-3 py-1.5 text-left text-sm text-cream-text hover:bg-cream-border-soft/40 focus:outline-none focus:ring-2 focus:ring-cream-gold/60 dark:text-cream-dark-text dark:hover:bg-cream-dark-border/40"
            >
              {entry.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Save status badge ──────────────────────────────────────

function SaveStatusBadge({
  status,
  error,
  onReset,
}: {
  status: string;
  error: { message: string } | null;
  onReset: () => void;
}) {
  if (status === "saving") {
    return <span className="text-cream-text-soft">Saving…</span>;
  }
  if (status === "saved") {
    return <span className="text-cream-gold">✓ Saved</span>;
  }
  if (status === "conflict") {
    return (
      <button
        type="button"
        onClick={onReset}
        className="text-cream-orange underline focus:outline-none focus:ring-2 focus:ring-cream-orange/60"
      >
        Conflict — refresh to retry
      </button>
    );
  }
  if (status === "error") {
    return (
      <span className="text-cream-orange" title={error?.message}>
        Save failed
      </span>
    );
  }
  if (status === "dirty") {
    return <span className="text-cream-text-soft">Editing…</span>;
  }
  return <span className="text-cream-text-soft/60">Up to date</span>;
}

// Silences the unused import for `BLOCK_REGISTRY` reference
// (kept available for future use by sub-components).
void BLOCK_REGISTRY;
