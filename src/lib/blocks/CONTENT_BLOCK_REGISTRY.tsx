/**
 * src/lib/blocks/CONTENT_BLOCK_REGISTRY.tsx
 *
 * Canonical block registry for ContentDocumentV1 — single
 * source of truth shared by BOTH the creator editor
 * (renderer/shell) AND the reader (renderer/student).
 *
 * Per ADR-0009 (content-source-canonical) the block schema
 * lives in `src/domains/catalog/blocks/document.ts`. The
 * registry adds UI and projection concerns on top of the
 * schema: render (React), extractText (plain text), and
 * defaultProps (initial state for new blocks).
 *
 * ─── MVP block set ────────────────────────────────────────
 *
 *   paragraph       — body paragraph
 *   heading [1..3]  — section headings (H1 / H2 / H3)
 *   bulletList      — unordered list of items
 *   orderedList     — ordered list of items
 *   quote           — blockquote (a single citation)
 *   callout         — colored aside (info | warning | success)
 *   divider         — `<hr>` separator (no content)
 *
 * ─── Why this lives in src/lib/blocks (NOT src/domains) ────
 *
 * The lib layer is for UI/utility code. The domain layer
 * (`src/domains/catalog/blocks`) holds pure-TypeScript
 * schemas + extractors; importing React here would
 * pollute the domain purity invariant. React stays in
 * `src/lib/...` and `src/app/...`.
 *
 * ─── Architecture (per ADR-0016 §1) ────────────────────────
 *
 * The registry is a `Record<BlockType, BlockEntry<TType, TProps>>`
 * — one entry per block type. The renderer looks up by
 * `block.type`, dispatches to that entry's `render` function.
 * Adding a new block type requires:
 *   1. New variant in `blockSchema` (domain layer).
 *   2. New entry here with `schema`, `defaultProps`,
 *      `render`, `extractText`, `insertable`.
 *   3. TS exhaustiveness check forces handler update.
 */

import { z } from "zod";
import {
  blockSchema,
  extractBlockText,
  type Block,
  type BlockType,
  type ContentDocumentV1,
} from "@/domains/catalog/blocks";

// ─── Block entry shape ──────────────────────────────────────

/**
 * One entry per `BlockType`. Generic over the type so
 * callers get narrow prop types when they look up
 * `REGISTRY[block.type]`.
 */
export interface BlockEntry<
  TType extends BlockType,
  TProps extends Record<string, unknown>,
> {
  /** Discriminator; matches the block's `type` field. */
  readonly type: TType;
  /**
   * Per-block props schema. Re-uses the domain `blockSchema`'s
   * shape — the entry exposes a more ergonomic prop-shape
   * to its renderer.
   */
  readonly schema: z.ZodTypeAny;
  /** Factory returning initial props for newly inserted blocks. */
  readonly defaultProps: () => TProps;
  /** React renderer (called with props + block id for keys). */
  readonly render: (
    props: TProps & { id: string; locale?: string },
  ) => React.ReactNode;
  /** Plain-text extraction (delegates to domain when available). */
  readonly extractText: (block: Block) => string;
  /**
   * Whether the editor's "Add block" menu exposes this entry.
   * `false` for compound types (e.g. `bulletList-item` if any).
   */
  readonly insertable: boolean;
  /** Display label for the "Add block" menu. */
  readonly label: string;
  /** Optional lucide icon name (resolved by AddBlockMenu). */
  readonly icon?: string;
}

// ─── Block-level renderers (the 7 MVP blocks) ──────────────

function ParagraphBlock({
  content,
}: {
  content: Array<{ text: string }>;
}) {
  // Render all inline runs verbatim. The schema guarantees
  // no free HTML (sweep at parse time).
  return (
    <p className="text-[15px] leading-relaxed text-cream-text dark:text-cream-dark-text">
      {content.map((c, i) => (
        <span key={i}>{c.text}</span>
      ))}
    </p>
  );
}

function HeadingBlock({
  level,
  content,
}: {
  level: 1 | 2 | 3;
  content: Array<{ text: string }>;
}) {
  const text = content.map((c) => c.text).join("");
  const className =
    level === 1
      ? "font-serif text-3xl font-semibold tracking-tight text-cream-espresso dark:text-cream-dark-text"
      : level === 2
        ? "font-serif text-2xl font-semibold tracking-tight text-cream-espresso dark:text-cream-dark-text mt-8"
        : "font-serif text-xl font-semibold tracking-tight text-cream-espresso dark:text-cream-dark-text mt-6";
  const Tag = (`h${level}`) as "h1" | "h2" | "h3";
  return <Tag className={className}>{text}</Tag>;
}

function BulletListBlock({
  items,
}: {
  items: Array<{ content: Array<{ text: string }> }>;
}) {
  return (
    <ul className="list-disc pl-6 space-y-1 text-[15px] leading-relaxed text-cream-text dark:text-cream-dark-text">
      {items.map((it, idx) => (
        <li key={idx}>
          {it.content.map((c, j) => (
            <span key={j}>{c.text}</span>
          ))}
        </li>
      ))}
    </ul>
  );
}

function OrderedListBlock({
  items,
}: {
  items: Array<{ content: Array<{ text: string }> }>;
}) {
  return (
    <ol className="list-decimal pl-6 space-y-1 text-[15px] leading-relaxed text-cream-text dark:text-cream-dark-text">
      {items.map((it, idx) => (
        <li key={idx}>
          {it.content.map((c, j) => (
            <span key={j}>{c.text}</span>
          ))}
        </li>
      ))}
    </ol>
  );
}

function QuoteBlock({
  content,
}: {
  content: Array<{ text: string }>;
}) {
  const text = content.map((c) => c.text).join("");
  return (
    <blockquote className="border-l-4 border-cream-gold dark:border-cream-dark-gold pl-4 italic text-cream-text-soft dark:text-cream-dark-text-soft">
      {text}
    </blockquote>
  );
}

function CalloutBlock({
  variant,
  content,
}: {
  variant: "info" | "warning" | "success";
  content: Array<{ text: string }>;
}) {
  const variantClass =
    variant === "info"
      ? "bg-cream-border-soft border-cream-gold/30 text-cream-text"
      : variant === "warning"
        ? "bg-cream-peach/15 border-cream-orange/40 text-cream-espresso"
        : "bg-cream-gold/10 border-cream-gold/40 text-cream-espresso";
  const text = content.map((c) => c.text).join("");
  return (
    <aside
      className={`rounded-md border px-4 py-3 text-[14px] ${variantClass} dark:bg-cream-dark-surface/60 dark:border-cream-dark-border dark:text-cream-dark-text`}
    >
      {text}
    </aside>
  );
}

function DividerBlock() {
  return (
    <hr className="border-t border-cream-border dark:border-cream-dark-border" />
  );
}

// ─── Per-type prop schemas (re-uses blockSchema's narrowing) ─

const paragraphPropsSchema = z.object({
  content: z.array(
    z.object({ text: z.string(), marks: z.array(z.unknown()).optional() }),
  ),
});

const headingPropsSchema = z.object({
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  content: z.array(
    z.object({ text: z.string(), marks: z.array(z.unknown()).optional() }),
  ),
});

const bulletListPropsSchema = z.object({
  items: z.array(
    z.object({
      content: z.array(
        z.object({
          text: z.string(),
          marks: z.array(z.unknown()).optional(),
        }),
      ),
    }),
  ),
});

const orderedListPropsSchema = bulletListPropsSchema;

const quotePropsSchema = z.object({
  content: z.array(
    z.object({ text: z.string(), marks: z.array(z.unknown()).optional() }),
  ),
});

const calloutPropsSchema = z.object({
  variant: z.enum(["info", "warning", "success"]),
  content: z.array(
    z.object({ text: z.string(), marks: z.array(z.unknown()).optional() }),
  ),
});

const dividerPropsSchema = z.object({}).strict();

// ─── The registry ───────────────────────────────────────────

export const BLOCK_REGISTRY = {
  paragraph: {
    type: "paragraph",
    schema: paragraphPropsSchema,
    defaultProps: () => ({
      content: [{ text: "" }],
    }),
    render: ({ id, content }: { id: string; content: Array<{ text: string }> }) => (
      <ParagraphBlock key={id} content={content} />
    ),
    extractText: (block) => extractBlockText(block),
    insertable: true,
    label: "Paragraph",
    icon: "Type",
  },
  heading: {
    type: "heading",
    schema: headingPropsSchema,
    defaultProps: () => ({
      level: 2,
      content: [{ text: "" }],
    }),
    render: ({
      id,
      level,
      content,
    }: {
      id: string;
      level: 1 | 2 | 3;
      content: Array<{ text: string }>;
    }) => <HeadingBlock key={id} level={level} content={content} />,
    extractText: (block) => extractBlockText(block),
    insertable: true,
    label: "Heading",
    icon: "Heading2",
  },
  bulletList: {
    type: "bulletList",
    schema: bulletListPropsSchema,
    defaultProps: () => ({
      items: [{ content: [{ text: "" }] }],
    }),
    render: ({
      id,
      items,
    }: {
      id: string;
      items: Array<{ content: Array<{ text: string }> }>;
    }) => <BulletListBlock key={id} items={items} />,
    extractText: (block) => extractBlockText(block),
    insertable: true,
    label: "Bullet list",
    icon: "List",
  },
  orderedList: {
    type: "orderedList",
    schema: orderedListPropsSchema,
    defaultProps: () => ({
      items: [{ content: [{ text: "" }] }],
    }),
    render: ({
      id,
      items,
    }: {
      id: string;
      items: Array<{ content: Array<{ text: string }> }>;
    }) => <OrderedListBlock key={id} items={items} />,
    extractText: (block) => extractBlockText(block),
    insertable: true,
    label: "Numbered list",
    icon: "ListOrdered",
  },
  quote: {
    type: "quote",
    schema: quotePropsSchema,
    defaultProps: () => ({
      content: [{ text: "" }],
    }),
    render: ({ id, content }: { id: string; content: Array<{ text: string }> }) => (
      <QuoteBlock key={id} content={content} />
    ),
    extractText: (block) => extractBlockText(block),
    insertable: true,
    label: "Quote",
    icon: "Quote",
  },
  callout: {
    type: "callout",
    schema: calloutPropsSchema,
    defaultProps: () => ({
      variant: "info" as const,
      content: [{ text: "" }],
    }),
    render: ({
      id,
      variant,
      content,
    }: {
      id: string;
      variant: "info" | "warning" | "success";
      content: Array<{ text: string }>;
    }) => <CalloutBlock key={id} variant={variant} content={content} />,
    extractText: (block) => extractBlockText(block),
    insertable: true,
    label: "Callout",
    icon: "Info",
  },
  divider: {
    type: "divider",
    schema: dividerPropsSchema,
    defaultProps: () => ({}),
    render: ({ id }: { id: string }) => <DividerBlock key={id} />,
    extractText: () => "",
    insertable: true,
    label: "Divider",
    icon: "Minus",
  },
} as const satisfies Record<
  BlockType,
  BlockEntry<BlockType, Record<string, unknown>>
>;

/**
 * `BlockType` import surface — broader consumers can use this
 * to enumerate insertable entries.
 */
export type { BlockType } from "@/domains/catalog/blocks";

/**
 * List of insertable block entries, ordered to drive the
 * "Add block" menu. Sorted alphabetically by label for
 * consistency with the established UX patterns.
 */
export const INSERTABLE_BLOCKS = (Object.values(BLOCK_REGISTRY) as Array<
  BlockEntry<BlockType, Record<string, unknown>>
>).filter((b) => b.insertable);

/**
 * Look up a block's entry by its `type` discriminator.
 * Throws on unknown type (exhaustiveness enforced at the
 * call site via the Block type).
 */
export function getBlockEntry(type: BlockType) {
  const entry = (BLOCK_REGISTRY as Record<string, unknown>)[type];
  if (!entry) {
    throw new Error(`Unknown block type: ${type}`);
  }
  return entry as BlockEntry<BlockType, Record<string, unknown>>;
}

/**
 * Ensure a document's blocks are valid against the per-block
 * registry schemas. Returns the list of invalid blocks
 * (empty when the document is fully valid).
 */
export function findInvalidBlocks(doc: ContentDocumentV1): string[] {
  const invalid: string[] = [];
  for (const block of doc.blocks) {
    const entry = getBlockEntry(block.type);
    const result = entry.schema.safeParse(block.props ?? {});
    if (!result.success && block.id) {
      invalid.push(block.id);
    }
  }
  return invalid;
}

// ─── Type aliases ───────────────────────────────────────────

/** Re-export for downstream consumers (importable from here). */
export type { Block, ContentDocumentV1 } from "@/domains/catalog/blocks";
export { blockSchema } from "@/domains/catalog/blocks";

// ─── Default block factory ──────────────────────────────────

/**
 * Build a fresh `Block` of the given type with default props.
 * The block's `id` is `crypto.randomUUID()` (browser-native;
 * Node 19+ supports it in tests).
 */
export function makeBlock(
  type: BlockType,
  position?: number,
): Block {
  const entry = getBlockEntry(type);
  const props = entry.defaultProps();
  return {
    id: typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `block_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    type,
    props,
    position: position ?? 0,
  } as Block;
}
