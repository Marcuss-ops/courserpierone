/**
 * src/components/public/derive-toc.ts
 *
 * Pure helper — derives a `TableOfContents`-shaped headings
 * array from a `ContentDocumentV1`.
 *
 * Lives at the lib layer (NOT inside TableOfContents.tsx)
 * because the derivation runs on the SERVER: the Server
 * Component fetches the document, calls `deriveToc(document,
 * { locale })`, and passes the resulting array to the Client
 * Component for rendering. Keeping the derivation pure and
 * side-effect-free makes it testable in isolation.
 *
 * ─── Derivation rule ─────────────────────────────────────
 *   - Walk `doc.blocks` in order.
 *   - For each `block.type === "heading"`:
 *     - Extract the visible text from `block.props.content[]`
 *       (each inline run's `text` joined with empty string).
 *     - Lift `block.props.level` (1 | 2 | 3).
 *     - Use `block.id` as the canonical blockId (TOC uses
 *       this for anchor computation: `heading-{blockId}`).
 *   - Skip heading blocks whose text is empty after trim
 *     (these are placeholders the editor hasn't filled yet).
 *   - Skip heading blocks whose level is NOT in 1..3 (the
 *     Zod schema enforces this but the read-side is
 *     defensive — corrupted rows shouldn't crash the TOC).
 *
 * Output is a flat array; ordering is the natural document
 * order. The TOC's indent is driven by `level`, not by
 * nesting in the array.
 */

import type { Block, ContentDocumentV1 } from "@/domains/catalog/blocks";

import type { TocHeading } from "./TableOfContents";

/**
 * Extract plain text from one heading block's content array.
 * Mirrors `extractBlockText(block)` from
 * `@/domains/catalog/blocks/extract-text` but is inlined
 * to keep this helper pure-Node (no external import surface
 * for the SSR path).
 */
function headingText(block: Block): string {
  if (!("content" in block) || !Array.isArray(block.content)) return "";
  return block.content.map((c) => c.text ?? "").join("").trim();
}

/**
 * Derive TOC headings from a document. Returns a flat array
 * in document order — caller renders it with level-based
 * indentation.
 */
export function deriveToc(document: ContentDocumentV1): TocHeading[] {
  if (!document || !Array.isArray(document.blocks)) return [];

  const headings: TocHeading[] = [];
  for (const block of document.blocks) {
    if (block.type !== "heading") continue;

    const level = block.props.level;
    if (level !== 1 && level !== 2 && level !== 3) continue;

    const text = headingText(block);
    if (text === "") continue;

    headings.push({
      blockId: block.id,
      level,
      text,
    });
  }
  return headings;
}
