/**
 * src/domains/catalog/blocks/extract-text.ts
 *
 * Plain-text extraction adapter for ContentDocumentV1 documents.
 *
 * Contract:
 *   - `extractBlockText(block)` → string — visible text of one block,
 *     conjoining all `InlineContent.text` runs verbatim (no mark
 *     decoration in v1 — marks like bold/italic are visual-only).
 *   - `extractDocumentText(doc)` → string — per-block text joined with
 *     `"\n\n"` separators so search tokens don't falsely merge across
 *     block boundaries (e.g. a heading's last word + next paragraph's
 *     first word).
 *
 * Use case:
 *   Populates `ContentPageTranslation.plainText` (nullable `@db.Text`)
 *   for full-text search indexing, AI summarization, SEO meta
 *   description. The DB column is denormalized from the structured
 *   document — derived lazily by a future extraction worker (Phase 2
 *   of MCR plan).
 *
 * Why per-block granularity is recoverable downstream:
 *   Search engines and AI embeddings prefer a single flat string. The
 *   block ID is recoverable via JSON.stringify(doc.blocks[i].id) — no
 *   need to pre-segment the output unless the search index needs it.
 */

import type { Block } from "./blocks";
import type { ContentDocumentV1 } from "./document";

/**
 * Per-block text extraction. For divider blocks (which have NO content
 * field per the discriminated-union design), returns the empty string.
 * The `"content" in block` narrowing is TypeScript's structural check
 * for the divider asymmetry.
 */
export function extractBlockText(block: Block): string {
  if (!("content" in block)) return "";
  // For all non-divider blocks, content is `InlineContent[]`. Each
  // entry's `.text` is a contiguous plain-text run; we conjoin them
  // verbatim. Marks (bold/italic/code/link) are visual-only and do
  // not modify the extracted text.
  return block.content.map((c) => c.text).join("");
}

/**
 * Document-level text extraction. Returns a single string with
 * per-block text joined by "\n\n". Empty blocks (e.g. a divider) are
 * reduced to an empty string and contribute a "\n\n" separator if
 * surrounded by content; downstream consumers can `.trim()` if they
 * want to strip trailing whitespace.
 */
export function extractDocumentText(doc: ContentDocumentV1): string {
  return doc.blocks.map(extractBlockText).join("\n\n");
}
