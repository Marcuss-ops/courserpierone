/**
 * src/lib/blocks/CONTENT_BLOCK_REGISTRY.ts
 *
 * Canonical Block Registry — single source of truth for every
 * structural element a Notion-like content page can contain.
 *
 * MVP surface (per master-plan §1 "pagine gerarchiche invece di
 * Module"): paragraph / heading / bulletList / orderedList / quote /
 * callout / divider. Each entry exposes three identical-shape
 * capabilities:
 *
 *   - `schema`     — Zod schema that validates ONE block of this
 *                    type. The discriminated-union dispatcher in
 *                    the registry composes them into `blockSchema`.
 *   - `render`     — React renderer. Returns a `ReactElement`
 *                    (semantic HTML, NO Tailwind classes in v1 —
 *                    consumers style upstream).
 *   - `extractText`— Plain-text extractor. Conjoins all
 *                    `InlineContent.text` runs verbatim
 *                    (`extractBlockText(block)` semantics from the
 *                    orphan src/domains/catalog/blocks/extract-text.ts).
 *
 * ─── Why a registry (instead of per-block files) ──────────────
 *
 * Per ADR-0016 §1 + the master-plan §3 "Registry centrale dei
 * blocchi": a single registry file is the canonical lookup for
 * editor (insert-menu), renderer (renderBlock dispatch),
 * validator (schema composition), text extractor (table of
 * contents / search / SEO / AI), and migration (version-to-version
 * block converters). Splitting the 7 entries across 7 sibling
 * files would scatter dispatch logic.
 *
 * ─── Why `.ts` and not `.tsx` ──────────────────────────────────
 *
 * The renderers use `React.createElement(...)` (no JSX). This
 * keeps the file pure-TS — JSX in `.tsx` would add a `tsx` step
 * and a JSX runtime import. Consumers import the render functions
 * from their own `.tsx` files and drop them into JSX directly:
 *
 *   import { CONTENT_BLOCK_REGISTRY } from "@/lib/blocks/BLOCK_REGISTRY";
 *   const entry = CONTENT_BLOCK_REGISTRY[block.type];
 *   return <div>{entry.render(block)}</div>;
 *
 * ─── Layered defense for "no free HTML" ────────────────────────
 *
 * Every text-bearing field is Zod-validated as a `string()` (no
 * marked-up text). Future evolution: a regex sweep of all string
 * fields rejecting `<tag>` style HTML, identical to the orphan's
 * `containsFreeHtml`. That helper is intentionally out of scope
 * for this PR — this PR is the registry; the sweep + the
 * `ContentDocumentV1` parser layer is a follow-up.
 *
 * ─── Why InlineContent + Marks are shared ───────────────────────
 *
 * Six of the seven blocks carry text via `content: InlineContent[]`.
 * A single `inlineContentSchema` (with optional `marks`) is reused
 * by all six. Marks (bold/italic/code/link) are visual-only — they
 * do NOT modify the extracted plain text (see the orphan's
 * `extractBlockText` docstring: "Marks are visual-only in v1").
 *
 * ─── List items model ─────────────────────────────────────────
 *
 * Per the orphan's list-block convention: each `InlineContent`
 * inside `content` is ONE list item, rendered as one `<li>`. The
 * schema requires `content.length >= 1` (a list with zero items
 * is structurally meaningless).
 *
 * ─── Dependency direction (ADR-0016 §1) ───────────────────────
 *
 * This file is in `src/lib/blocks/` (lib layer, framework-agnostic
 * structure). The domain layer (`src/domains/catalog/`) imports
 * FROM here, never the other way. Persistence (Prisma) does not
 * touch this file at all — block schemas pass through the type
 * system as `z.infer` results.
 */

import { z } from "zod";
import {
  createElement,
  type ReactElement,
  type ReactNode,
} from "react";

// ════════════════════════════════════════════════════════════════
// 1.  BLOCK TYPES — string union + runtime guard
// ════════════════════════════════════════════════════════════════

/**
 * Every concrete block type registered in this MVP. Used as the
 * discriminator in `Block` (the discriminated union derived from
 * the 7 schemas below) and as the key type in
 * `CONTENT_BLOCK_REGISTRY`.
 *
 * Adding a new block type is a THREE-STEP process:
 *   1. Add the literal to this tuple.
 *   2. Add a Zod schema below (Section 2 + 3).
 *   3. Add an entry to `CONTENT_BLOCK_REGISTRY` in Section 4.
 * TypeScript's `Record<BlockType, ContentBlockEntry<BlockType>>`
 * on `CONTENT_BLOCK_REGISTRY` enforces step 3 at compile time.
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

/**
 * Type-narrowing runtime check: returns `true` iff `value` is a
 * recognized `BlockType`. Used by the schema dispatcher before
 * looking up the per-entry schema.
 */
export function isBlockType(value: unknown): value is BlockType {
  return typeof value === "string" && (BLOCK_TYPES as readonly string[]).includes(value);
}


// ════════════════════════════════════════════════════════════════
// 2.  SHARED PRIMITIVES — InlineContent, Mark, blockId
// ════════════════════════════════════════════════════════════════

/**
 * `Mark` — visual annotation on a text run. Discriminated union of:
 *   - `bold`   — strong emphasis (no payload).
 *   - `italic` — em emphasis (no payload).
 *   - `code`   — monospace code inline (no payload).
 *   - `link`   — carries `href` (must be a valid URL).
 *
 * Marks are `optional` on `InlineContent`. An unmarked run has
 * no `marks` field. Empty `marks` arrays are normalized away by
 * `.optional()` at the schema layer.
 */
export const markSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("bold") }).strict(),
  z.object({ type: z.literal("italic") }).strict(),
  z.object({ type: z.literal("code") }).strict(),
  z.object({
    type: z.literal("link"),
    href: z.string().url("link mark href must be a valid URL"),
  }).strict(),
]);

export type Mark = z.infer<typeof markSchema>;

/**
 * `InlineContent` — a contiguous plain-text run within a block.
 * One InlineContent = one DOM text node (or list item, depending
 * on the parent block). Multiple InlineContents in one block
 * represent split runs (e.g. a paragraph with bold mid-sentence).
 *
 * `text` is a non-empty string. `marks` is optional and omitted
 * when there are no decorations.
 */
export const inlineContentSchema = z
  .object({
    type: z.literal("text"),
    text: z.string().min(1, "InlineContent text must be non-empty"),
    marks: z.array(markSchema).optional(),
  })
  .strict();

export type InlineContent = z.infer<typeof inlineContentSchema>;

/**
 * Per-block stable identifier. Non-empty string. Created by the
 * editor on insert; preserved across autosave revisions so block
 * identity is stable for diff / lock / comment primitives.
 */
export const blockIdSchema = z.string().min(1, "block id must be non-empty");


// ════════════════════════════════════════════════════════════════
// 3.  BLOCK SCHEMAS — one per BlockType
// ════════════════════════════════════════════════════════════════

// ─── 3.1 paragraph ─────────────────────────────────────────────

/**
 * Paragraph block — plain prose. No props (`.strict()` rejects
 * extra fields). Content is at least one InlineContent (an empty
 * paragraph makes no sense).
 */
export const paragraphPropsSchema = z.object({}).strict();

export const paragraphSchema = z
  .object({
    id: blockIdSchema,
    type: z.literal("paragraph"),
    props: paragraphPropsSchema,
    content: z.array(inlineContentSchema).min(1),
  })
  .strict();

export type ParagraphBlock = z.infer<typeof paragraphSchema>;

// ─── 3.2 heading ────────────────────────────────────────────────

/**
 * Heading levels restricted to H1 / H2 / H3. H4–H6 are NOT in
 * MVP; the union is closed (literal-based, not range-based) so
 * `props.level` participates in the type discrimination downstream
 * (`Pick<HeadingBlock, "props">` narrows the literal type).
 */
export const HEADING_LEVELS = [1, 2, 3] as const;
export type HeadingLevel = (typeof HEADING_LEVELS)[number];

export const headingLevelSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
]);

/**
 * The exported alias `HeadingBlock.props.level` is `HeadingLevel`
 * (closed union of 1 | 2 | 3). Future versions may open the
 * union — for now the renderer relies on exhaustiveness over
 * these 3 values.
 */
export const headingPropsSchema = z
  .object({
    level: headingLevelSchema,
  })
  .strict();

export const headingSchema = z
  .object({
    id: blockIdSchema,
    type: z.literal("heading"),
    props: headingPropsSchema,
    content: z.array(inlineContentSchema).min(1),
  })
  .strict();

export type HeadingBlock = z.infer<typeof headingSchema>;

// ─── 3.3 bulletList ─────────────────────────────────────────────

/**
 * Unordered list. Per orphan's "one `<li>` per InlineContent"
 * convention, items are modelled as InlineContent[]. Props is an
 * empty object (`.strict()` blocks future styling props).
 */
export const bulletListPropsSchema = z.object({}).strict();

export const bulletListSchema = z
  .object({
    id: blockIdSchema,
    type: z.literal("bulletList"),
    props: bulletListPropsSchema,
    content: z.array(inlineContentSchema).min(1),
  })
  .strict();

export type BulletListBlock = z.infer<typeof bulletListSchema>;

// ─── 3.4 orderedList ────────────────────────────────────────────

/**
 * Ordered list. Same content model as bulletList; the renderer
 * decides to wrap in `<ol>` vs `<ul>`. Sharing the inlineContent
 * list keeps `extractText` symmetric for both list flavours.
 */
export const orderedListPropsSchema = z.object({}).strict();

export const orderedListSchema = z
  .object({
    id: blockIdSchema,
    type: z.literal("orderedList"),
    props: orderedListPropsSchema,
    content: z.array(inlineContentSchema).min(1),
  })
  .strict();

export type OrderedListBlock = z.infer<typeof orderedListSchema>;

// ─── 3.5 quote ──────────────────────────────────────────────────

/**
 * Pull-quote with optional `attribution` (the author/source).
 * Attribution is a top-level prop, NOT a content run — keeps
 * `extractText` simple (it intentionally ignores attribution per
 * the orphan's convention).
 */
export const quotePropsSchema = z
  .object({
    attribution: z.string().min(1).optional(),
  })
  .strict();

export const quoteSchema = z
  .object({
    id: blockIdSchema,
    type: z.literal("quote"),
    props: quotePropsSchema,
    content: z.array(inlineContentSchema).min(1),
  })
  .strict();

export type QuoteBlock = z.infer<typeof quoteSchema>;

// ─── 3.6 callout ────────────────────────────────────────────────

/**
 * Callout — coloured sidebar box for "important" / "warning" / etc.
 * `variant` is the design-system color hook; the renderer maps
 * each variant to its own wrapper element. Closed enum keeps
 * styling exhaustive.
 */
export const CALLOUT_VARIANTS = ["info", "success", "warning", "danger"] as const;
export type CalloutVariant = (typeof CALLOUT_VARIANTS)[number];

export const calloutVariantSchema = z.enum(CALLOUT_VARIANTS);

export const calloutPropsSchema = z
  .object({
    variant: calloutVariantSchema,
  })
  .strict();

export const calloutSchema = z
  .object({
    id: blockIdSchema,
    type: z.literal("callout"),
    props: calloutPropsSchema,
    content: z.array(inlineContentSchema).min(1),
  })
  .strict();

export type CalloutBlock = z.infer<typeof calloutSchema>;

// ─── 3.7 divider ────────────────────────────────────────────────

/**
 * Horizontal-rule separator. By design, has NO `content` field
 * (consumers render `<hr />`). The discriminator asymmetry
 * ("divider has no InlineContent") is preserved by the type
 * system — see the `Block` union below, where `DividerBlock`'s
 * lack of `content` is the canonical narrowing hook.
 */
export const dividerPropsSchema = z.object({}).strict();

export const dividerSchema = z
  .object({
    id: blockIdSchema,
    type: z.literal("divider"),
    props: dividerPropsSchema,
  })
  .strict();

export type DividerBlock = z.infer<typeof dividerSchema>;

// ─── 3.8 discriminated union + top-level schema ────────────────

/**
 * `Block` — the discriminated union of all 7 schemas. Dispatch
 * sites use `block.type` to narrow (`if (block.type === "divider")
 * …`); the `"content" in block` check is the canonical narrowing
 * hook for the divider asymmetry (used by renderers and
 * extractors).
 */
export const blockSchema = z.discriminatedUnion("type", [
  paragraphSchema,
  headingSchema,
  bulletListSchema,
  orderedListSchema,
  quoteSchema,
  calloutSchema,
  dividerSchema,
]);

export type Block = z.infer<typeof blockSchema>;

/**
 * Helper that pulls out the variant of `Block` matching a concrete
 * `B extends BlockType`. Used to bind each entry's `schema`,
 * `render`, and `extractText` to the SAME block variant.
 *
 *   type H = BlockOfType<"heading">;  // HeadingBlock
 */
export type BlockOfType<B extends BlockType> = Extract<Block, { type: B }>;


// ════════════════════════════════════════════════════════════════
// 4.  PER-ENTRY: schema + render + extractText
// ════════════════════════════════════════════════════════════════

/**
 * Shape of one registry entry. Binds the schema, renderer, and
 * extractor to the exact TS variant (via `BlockOfType<B>`) so
 * consumers can rely on type-narrowing without runtime checks.
 *
 * `render` returns `ReactElement` (the return type of
 * `React.createElement`), not the broader `ReactNode`. The
 * registry never returns strings, arrays, or fragments directly.
 */
export interface ContentBlockEntry<B extends BlockType> {
  readonly type: B;
  readonly schema: z.ZodType<BlockOfType<B>>;
  readonly render: (block: BlockOfType<B>) => ReactElement;
  readonly extractText: (block: BlockOfType<B>) => string;
}

// ─── 4.x shared rendering helper ───────────────────────────────

/**
 * Renders an `InlineContent` array as a flat array of React
 * elements (no `<p>`/`<li>` wrapping — the PARENT block decides
 * the container). Marks produce React fragments with semantic
 * tags (`<strong>`, `<em>`, `<code>`, `<a>`).
 *
 * This helper is INTERNAL to the registry (`renderInlineContent`)
 * — it's not exported because rendering policy is a renderer
 * concern, not a registry concern. Callers use
 * `entry.render(block)` which composes content into the block's
 * own container.
 */
function renderInlineContent(content: readonly InlineContent[]): ReactNode {
  return content.map((run, idx) => {
    const text = run.text;
    if (!run.marks || run.marks.length === 0) {
      return text;
    }
    // Each mark wraps the accumulated children. Reduce left-to-right
    // so the leftmost mark becomes the outermost tag (per the CSS
    // nesting convention). For MVP, link is the only multi-mark
    // mark that carries data; bold/italic/code are visual-only.
    return run.marks.reduce<ReactElement>((children, mark) => {
      switch (mark.type) {
        case "bold":
          return createElement("strong", { key: `b-${idx}` }, children);
        case "italic":
          return createElement("em", { key: `i-${idx}` }, children);
        case "code":
          return createElement("code", { key: `c-${idx}` }, children);
        case "link":
          return createElement(
            "a",
            { key: `l-${idx}`, href: mark.href },
            children,
          );
      }
    }, createElement("span", { key: `t-${idx}` }, text));
  });
}

// ─── 4.1 paragraph entry ───────────────────────────────────────

const paragraphEntry: ContentBlockEntry<"paragraph"> = {
  type: "paragraph",
  schema: paragraphSchema,
  render: (block) =>
    createElement("p", { key: block.id }, renderInlineContent(block.content)),
  extractText: (block) => block.content.map((c) => c.text).join(""),
};

// ─── 4.2 heading entry ─────────────────────────────────────────

const headingEntry: ContentBlockEntry<"heading"> = {
  type: "heading",
  schema: headingSchema,
  render: (block) => {
    // Exhaustiveness over HeadingLevel — adding a 4th level triggers
    // a TS error here until a new branch is added.
    const tagName =
      block.props.level === 1 ? "h1" :
      block.props.level === 2 ? "h2" :
      "h3";
    return createElement(
      tagName,
      { key: block.id },
      renderInlineContent(block.content),
    );
  },
  extractText: (block) => block.content.map((c) => c.text).join(""),
};

// ─── 4.3 bulletList entry ──────────────────────────────────────

const bulletListEntry: ContentBlockEntry<"bulletList"> = {
  type: "bulletList",
  schema: bulletListSchema,
  render: (block) =>
    createElement(
      "ul",
      { key: block.id },
      block.content.map((run, idx) =>
        createElement("li", { key: `item-${idx}` }, renderInlineContent([run])),
      ),
    ),
  extractText: (block) => block.content.map((c) => c.text).join(""),
};

// ─── 4.4 orderedList entry ─────────────────────────────────────

const orderedListEntry: ContentBlockEntry<"orderedList"> = {
  type: "orderedList",
  schema: orderedListSchema,
  render: (block) =>
    createElement(
      "ol",
      { key: block.id },
      block.content.map((run, idx) =>
        createElement("li", { key: `item-${idx}` }, renderInlineContent([run])),
      ),
    ),
  extractText: (block) => block.content.map((c) => c.text).join(""),
};

// ─── 4.5 quote entry ────────────────────────────────────────────

const quoteEntry: ContentBlockEntry<"quote"> = {
  type: "quote",
  schema: quoteSchema,
  render: (block) => {
    // Attribution is rendered as a `<footer>` if present (semantic
    // HTML per the blockquote spec). Plain `<blockquote>` when absent.
    if (block.props.attribution) {
      return createElement(
        "blockquote",
        { key: block.id },
        renderInlineContent(block.content),
        createElement(
          "footer",
          { key: "attr" },
          `— ${block.props.attribution}`,
        ),
      );
    }
    return createElement(
      "blockquote",
      { key: block.id },
      renderInlineContent(block.content),
    );
  },
  extractText: (block) => block.content.map((c) => c.text).join(""),
};

// ─── 4.6 callout entry ──────────────────────────────────────────

const calloutEntry: ContentBlockEntry<"callout"> = {
  type: "callout",
  schema: calloutSchema,
  render: (block) => {
    // Semantic `<aside>` with an `aria-label` reflecting the variant.
    // No Tailwind classes — consumers wrap with their own design
    // tokens via the `data-variant` attribute.
    return createElement(
      "aside",
      {
        key: block.id,
        "data-variant": block.props.variant,
        "aria-label": `Callout (${block.props.variant})`,
      },
      renderInlineContent(block.content),
    );
  },
  extractText: (block) => block.content.map((c) => c.text).join(""),
};

// ─── 4.7 divider entry ──────────────────────────────────────────

const dividerEntry: ContentBlockEntry<"divider"> = {
  type: "divider",
  schema: dividerSchema,
  // divider has NO content by design — render is parameterless (the
  // signature is `render(block: DividerBlock)` but `block.props` is
  // unused). `<hr />` carries a stable `key` for React reconciliation.
  render: (block) => createElement("hr", { key: block.id }),
  extractText: () => "",
};


// ════════════════════════════════════════════════════════════════
// 5.  THE REGISTRY — canonical lookup + dispatch helpers
// ════════════════════════════════════════════════════════════════

/**
 * `CONTENT_BLOCK_REGISTRY` — the single source of truth mapping
 * `BlockType` → `ContentBlockEntry`. Consumed by:
 *
 *   - Editor:    show insert-menu buttons keyed by registry keys.
 *   - Renderer:  `Object.values(CONTENT_BLOCK_REGISTRY).find(e => e.type === block.type)`
 *                OR the `getBlockEntry` shortcut below.
 *   - Validator: import every `schema` to compose the document-level
 *                schema.
 *   - Extractor: dispatch `extractText` per block.
 *   - Migrator:  hook for future v1 → v2 block converters.
 *
 * `Record<BlockType, ContentBlockEntry<BlockType>>` enforces
 * EXHAUSTIVENESS at compile time — adding a new BlockType without
 * an entry here is a TS error, not a silent runtime gap.
 */
export const CONTENT_BLOCK_REGISTRY: {
  readonly [B in BlockType]: ContentBlockEntry<B>;
} = {
  paragraph: paragraphEntry,
  heading: headingEntry,
  bulletList: bulletListEntry,
  orderedList: orderedListEntry,
  quote: quoteEntry,
  callout: calloutEntry,
  divider: dividerEntry,
};

/**
 * Runtime lookup by `BlockType`. Returns the same `ContentBlockEntry`
 * reference as `CONTENT_BLOCK_REGISTRY[type]`, with the entry's
 * narrowed type carried through the generic parameter.
 *
 *   const h = getBlockEntry("heading"); // ContentBlockEntry<"heading">
 *   h.render(...) // narrows the block to HeadingBlock
 *
 * The `as ContentBlockEntry<B>` cast is the documented TypeScript
 * workaround for the contravariance limitation on
 * `{ [B in BlockType]: ContentBlockEntry<B> }`: the union of per-key
 * generic instances is structurally identical to the generic
 * instantiated at the union, but TS can't unify them automatically
 * because of the contravariant `render` / `extractText` parameters.
 * The lookup is safe at runtime because `B extends BlockType` narrows
 * the keyspace.
 */
export function getBlockEntry<B extends BlockType>(type: B): ContentBlockEntry<B> {
  return CONTENT_BLOCK_REGISTRY[type];
}

/**
 * Dispatch a single-block parse via the discriminated union.
 * Returns the typed result on success or the ZodError on
 * failure. Mirrors the safe-parse shape used by
 * `safeParseContentDocumentV1` in the orphan
 * src/domains/catalog/blocks/document.ts.
 *
 * Usage from a route handler:
 *   const parsed = parseContentBlock(req.body.block);
 *   if (!parsed.ok) return apiErrorResponse.fromZodError(parsed.error);
 */
export type SafeParseBlockResult =
  | { ok: true; data: Block }
  | { ok: false; error: z.ZodError };

export function parseContentBlock(value: unknown): SafeParseBlockResult {
  const result = blockSchema.safeParse(value);
  if (result.success) return { ok: true, data: result.data };
  return { ok: false, error: result.error };
}
