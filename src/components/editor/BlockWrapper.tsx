"use client";

/**
 * src/components/editor/BlockWrapper.tsx
 *
 * The per-block chrome: hover state, focus ring, drag handle,
 * and the action row (delete + duplicate).
 *
 * Wraps `useSortable` from `@dnd-kit/sortable` so a parent
 * `SortableBlockList` can reposition each block via drag.
 *
 * Visual posture:
 *   - Default: block sits normally (no border).
 *   - Hover: subtle background + left-side action rail appears.
 *   - Focus-within: thicker ring (cream-gold accent) +
 *     persistent action rail.
 *
 * No new deps: `lucide-react` (already in package.json) +
 * `@dnd-kit/sortable` (just installed).
 */

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2, Copy } from "lucide-react";
import { useState, type ReactNode } from "react";

// ─── Props ──────────────────────────────────────────────────

export interface BlockWrapperProps {
  /** Stable block id; passed to `useSortable`. */
  id: string;
  /** The block's content (rendered inside the chrome). */
  children: ReactNode;
  /** Called when the user clicks the trash icon. */
  onDelete: () => void;
  /** Called when the user clicks the duplicate icon. */
  onDuplicate: () => void;
}

// ─── Component ─────────────────────────────────────────────

export function BlockWrapper({
  id,
  children,
  onDelete,
  onDuplicate,
}: BlockWrapperProps) {
  const [isFocused, setIsFocused] = useState(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  const showRail = isFocused;

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-testid={`block-wrapper-${id}`}
      onFocus={() => setIsFocused(true)}
      onBlur={(e) => {
        // Only hide the rail when focus truly leaves the block
        // (not when it moves between sub-elements inside the block).
        if (!e.currentTarget.contains(e.relatedTarget)) {
          setIsFocused(false);
        }
      }}
      className={[
        "group relative rounded-md py-2 px-3 -mx-3 my-2",
        "transition-colors duration-150",
        "hover:bg-cream-border-soft/40 dark:hover:bg-cream-dark-surface/40",
        "focus-within:bg-cream-border-soft/40 dark:focus-within:bg-cream-dark-surface/40",
        isFocused || isDragging
          ? "ring-2 ring-cream-gold/60 dark:ring-cream-dark-gold/60"
          : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Drag handle + action rail (visible on focus / drag). */}
      <div
        className={[
          "absolute -left-10 top-1/2 -translate-y-1/2",
          "flex items-center gap-1 rounded",
          "bg-cream-card dark:bg-cream-dark-surface",
          "border border-cream-border dark:border-cream-dark-border",
          "shadow-sm",
          "transition-opacity duration-150",
          showRail ? "opacity-100" : "opacity-0 group-hover:opacity-100",
        ]
          .filter(Boolean)
          .join(" ")}
        data-testid={`block-rail-${id}`}
      >
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
          data-testid={`drag-handle-${id}`}
          className="p-1.5 cursor-grab active:cursor-grabbing text-cream-text-soft hover:text-cream-text dark:text-cream-dark-text-soft dark:hover:text-cream-dark-text focus:outline-none focus:ring-2 focus:ring-cream-gold/60"
        >
          <GripVertical size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onDuplicate}
          aria-label="Duplicate block"
          data-testid={`duplicate-${id}`}
          className="p-1.5 text-cream-text-soft hover:text-cream-text dark:text-cream-dark-text-soft dark:hover:text-cream-dark-text focus:outline-none focus:ring-2 focus:ring-cream-gold/60"
        >
          <Copy size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label="Delete block"
          data-testid={`delete-${id}`}
          className="p-1.5 text-cream-text-soft hover:text-cream-orange dark:hover:text-cream-dark-orange focus:outline-none focus:ring-2 focus:ring-cream-orange/60"
        >
          <Trash2 size={14} aria-hidden="true" />
        </button>
      </div>

      {/* The block content (whatever the registry renders). */}
      <div data-testid={`block-content-${id}`}>{children}</div>
    </div>
  );
}
