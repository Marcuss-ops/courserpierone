/**
 * src/domains/catalog/blocks/blocks.ts
 *
 * Per-block Zod schemas + TypeScript types for the canonical
 * ContentDocumentV1 document shape. MCR Phase 1.5 (this PR).
 *
 * Shape contract (locked in here, validated by Zod, referenced
 * from `document.ts` and the future server-side renderer):
 *
 *   Block = ParagraphBlock
 *         | HeadingBlock            // props.level: 1|2|3
 *         | BulletListBlock         // flat list (no nesting in v1)
 *         | OrderedListBlock        // flat list
 *         | QuoteBlock              // optional attribution in props
 *         | CalloutBlock            // props.variant: info|warning|success|danger
 *         | DividerBlock            // NO content (intentional asymmetry)
 *
 * All non-divider blocks share:
 *   - `id`: kebab-case alphanumeric, 1–64 chars (matches
 *     CONTENT_SLUG_PATTERN in src/domains/catalog/content-type-registry.ts)
 *   - `type`: discriminant
 *   - `props`: typed per-block (strict z.object prevents accidental
 *     field-bag growth; future props must be added explicitly)
 *   - `content`: InlineContent[] (runs of plain text with optional marks)
 *
 * The `content` field is intentionally NOT present on `DividerBlock`:
 * dividers are pure typographic separators with no text payload.
 * The `BaseBlock` generic + `Omit<...,"content">` lets TS narrow
 * correctly downstream (e.g. `extractBlockText` checks `"content" in block`).
 */

import { z } from "zod";

// ─── Inline content + marks ───────────────────────────────────────

/**
 * The 4 supported inline marks. Adding more requires a discriminator
 * entry here + (for visual marks) a renderer entry. URL-only marks
 * (link) carry a payload.
 */
export const markSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("bold") }),
  z.object({ type: z.literal("italic") }),
  z.object({ type: z.literal("code") }),
  z.object({
    type: z.literal("link"),
    href: z
      .string()
      .url("Link mark href must be a valid URL (http/https/mailto)"),
  }),
]);
export type Mark = z.infer<typeof markSchema>;

export const inlineContentSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
  // marks are optional so a plain text run serializes cleanly:
  //   { type: "text", text: "Hello" }   ← valid, no marks
  //   { type: "text", text: "Hello", marks: [{ type: "bold" }] }   ← also valid
  marks: z.array(markSchema).optional(),
});
export type InlineContent = z.infer<typeof inlineContentSchema>;

// ─── Block ID validation (shared across all block variants) ──────
//
// Mirrors `CONTENT_SLUG_PATTERN` (a-z, 0-9, dashes) but additionally
// allows uppercase + underscores so block IDs survive codemods and
// copy-paste from coding tools (e.g. `block_intro`, `Block_001`).
export const BLOCK_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
export const blockIdSchema = z
  .string()
  .min(1, "Block id must not be empty")
  .max(64, "Block id must not exceed 64 characters")
  .regex(BLOCK_ID_PATTERN, "Block id must be alphanumeric kebab/snake case");

// ─── Per-block schemas ────────────────────────────────────────────

const emptyPropsSchema = z
  .object({})
  .strict()
  // z.object({}).strict() makes the props field a literal empty
  // object — this is intentional. Future block-specific props
  // (e.g. paragraph.dropCap) must be added explicitly here, never
  // silently accepted via a passthrough bag.
  .describe("intentionally empty; future props must be added explicitly") as z.ZodType<
    Record<never, never>
  >;

const paragraphBlockSchema = z
  .object({
    id: blockIdSchema,
    type: z.literal("paragraph"),
    props: emptyPropsSchema,
    content: z.array(inlineContentSchema),
    position: z.number().int().nonnegative().optional(),
  })
  // .strict() on the outer object rejects unknown keys — without
  // this, a paragraph block with a stray `children`/`url`/`image`
  // would silently parse instead of failing the parse. This is the
  // mirror of the per-block inner-prop strict mode and enforces
  // the discriminated-union contract end-to-end (a divider with
  // `content` is rejected at parse time, not silently stripped).
  .strict();
export type ParagraphBlock = z.infer<typeof paragraphBlockSchema>;

const headingBlockSchema = z
  .object({
    id: blockIdSchema,
    type: z.literal("heading"),
    props: z.object({
      level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    }),
    content: z.array(inlineContentSchema),
    position: z.number().int().nonnegative().optional(),
  })
  .strict();
export type HeadingBlock = z.infer<typeof headingBlockSchema>;

const bulletListBlockSchema = z
  .object({
    id: blockIdSchema,
    type: z.literal("bulletList"),
    props: emptyPropsSchema,
    // FLAT: each array element is a single inline run, NOT a nested
    // block. The renderer draws one bullet per InlineContent item.
    // Nested lists are deferred to v2 (recursion blows up Zod
    // compile times; documented in Phase 1 plan).
    content: z.array(inlineContentSchema),
    position: z.number().int().nonnegative().optional(),
  })
  .strict();
export type BulletListBlock = z.infer<typeof bulletListBlockSchema>;

const orderedListBlockSchema = z
  .object({
    id: blockIdSchema,
    type: z.literal("orderedList"),
    props: emptyPropsSchema,
    content: z.array(inlineContentSchema),
    position: z.number().int().nonnegative().optional(),
  })
  .strict();
export type OrderedListBlock = z.infer<typeof orderedListBlockSchema>;

const quoteBlockSchema = z
  .object({
    id: blockIdSchema,
    type: z.literal("quote"),
    props: z.object({
      attribution: z
        .string()
        .max(120, "Quote attribution must not exceed 120 characters")
        .optional(),
    }),
    content: z.array(inlineContentSchema),
    position: z.number().int().nonnegative().optional(),
  })
  .strict();
export type QuoteBlock = z.infer<typeof quoteBlockSchema>;

const calloutBlockSchema = z
  .object({
    id: blockIdSchema,
    type: z.literal("callout"),
    props: z.object({
      variant: z.enum(["info", "warning", "success", "danger"]),
    }),
    content: z.array(inlineContentSchema),
    position: z.number().int().nonnegative().optional(),
  })
  .strict();
export type CalloutBlock = z.infer<typeof calloutBlockSchema>;

// Divider is the asymmetric block: NO content array. Dividers are
// pure typographic separators; a divider block with text would be a
// shape error. The .strict() on the outer object enforces this —
// without it, a divider block carrying a stray `content` field
// would silently parse (Zod strips unknown keys by default),
// breaking the discriminated-union contract downstream.
const dividerBlockSchema = z
  .object({
    id: blockIdSchema,
    type: z.literal("divider"),
    props: emptyPropsSchema,
    position: z.number().int().nonnegative().optional(),
  })
  .strict();
export type DividerBlock = z.infer<typeof dividerBlockSchema>;

// ─── Discriminated union ──────────────────────────────────────────

/**
 * The Block discriminated union, keyed by `type`. The order here
 * MUST match the runtime Zod discriminatedUnion declaration below
 * (TypeScript doesn't enforce it, but the test suite does).
 */
export type Block =
  | ParagraphBlock
  | HeadingBlock
  | BulletListBlock
  | OrderedListBlock
  | QuoteBlock
  | CalloutBlock
  | DividerBlock;

export const blockSchema = z.discriminatedUnion("type", [
  paragraphBlockSchema,
  headingBlockSchema,
  bulletListBlockSchema,
  orderedListBlockSchema,
  quoteBlockSchema,
  calloutBlockSchema,
  dividerBlockSchema,
]);

/**
 * Canonical list of block types as a const array, exported for:
 *   - runtime iteration (e.g. admin dashboard "valid block types" tooltip)
 *   - type-narrowing helper `isBlockType(value)` mirroring
 *     `isContentKind` from content-type-registry.ts
 *
 * Adding a new block type means:
 *   1. New TS interface here (extends BaseBlock or Omit)
 *   2. New z.object() schema
 *   3. Add to the discriminatedUnion literal array above
 *   4. Add to BLOCK_TYPES const tuple below
 *   5. Implement extractBlockText branch in extract-text.ts
 *   6. Implement renderer branch (separate file, post-v1)
 *   7. Add tests in document.test.ts + extract-text.test.ts
 */
export const BLOCK_TYPES = [
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "quote",
  "callout",
  "divider",
] as const;

export type BlockType = (typeof BLOCK_TYPES)[number];

export function isBlockType(value: unknown): value is BlockType {
  return typeof value === "string" && (BLOCK_TYPES as readonly string[]).includes(value);
}
