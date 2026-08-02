"use client";

/**
 * src/components/editor/SortableBlockList.tsx
 *
 * Wraps the block list in `DndContext` + `SortableContext`
 * for drag-to-reorder, and maps each block through the
 * registry's renderer wrapped in a `BlockWrapper`.
 *
 * Reading vs editing:
 *   - This component is the EDITING surface. The
 *     renderer/student will use a separate, lighter
 *     `RenderBlocks` (Phase 2) that just walks the
 *     same registry without wrappers / actions.
 */

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

import {
  BLOCK_REGISTRY,
  type Block,
} from "@/lib/blocks/BLOCK_REGISTRY";

import { BlockWrapper } from "./BlockWrapper";

// ─── Props ──────────────────────────────────────────────────

export interface SortableBlockListProps {
  blocks: Block[];
  onReorder: (fromId: string, toId: string) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
}

// ─── Component ─────────────────────────────────────────────

export function SortableBlockList({
  blocks,
  onReorder,
  onDelete,
  onDuplicate,
}: SortableBlockListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Require a 6px movement to start a drag — prevents
      // accidental drags on click of the drag handle.
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    onReorder(String(active.id), String(over.id));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={blocks.map((b) => b.id)}
        strategy={verticalListSortingStrategy}
      >
        <ul
          data-testid="sortable-block-list"
          className="space-y-1 list-none p-0 m-0"
        >
          {blocks.map((block) => (
            <li key={block.id}>
              <BlockWrapper
                id={block.id}
                onDelete={() => onDelete(block.id)}
                onDuplicate={() => onDuplicate(block.id)}
              >
                <BlockSwitch block={block} />
              </BlockWrapper>
            </li>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

// ─── BlockSwitch ────────────────────────────────────────────

/**
 * Dispatch a block to its registry entry's `render`. Lifts
 * to a separate component so the registry lookup is memoized
 * per block (small perf / clarity win).
 */
function BlockSwitch({ block }: { block: Block }) {
  const entry = BLOCK_REGISTRY[block.type];
  if (!entry) {
    return (
      <div
        data-testid={`unknown-block-${block.id}`}
        className="text-cream-orange dark:text-cream-dark-orange text-sm italic"
      >
        Unknown block type: <code>{block.type}</code>
      </div>
    );
  }
  const render = entry.render as (value: unknown) => import("react").ReactNode;
  return <>{render({ id: block.id, ...(block.props), ...( "content" in block ? { content: block.content } : {}) })}</>;
}
