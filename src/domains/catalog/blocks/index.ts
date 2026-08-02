/**
 * src/domains/catalog/blocks/index.ts
 *
 * Public surface re-exports for the ContentDocumentV1 block registry.
 *
 * Importers should pull from `@/domains/catalog/blocks` (this barrel)
 * rather than reaching into the implementation files. The barrel
 * intentionally re-exports BOTH the TypeScript types AND the runtime
 * Zod schemas / parsers / extractors so a single import suffices:
 *
 *   import {
 *     parseContentDocumentV1,
 *     extractDocumentText,
 *     type ContentDocumentV1,
 *   } from "@/domains/catalog/blocks";
 *
 * Implementation files live in `./document`, `./blocks`, `./extract-text`.
 * Tests live in `document.test.ts` and `extract-text.test.ts` co-located
 * with the implementation files for grep-discoverability.
 */

export {
  // schemas (re-exported for callers that want safeParse access)
  blockIdSchema,
  blockSchema,
  inlineContentSchema,
  markSchema,
  // types (re-exported so callers can annotate locally)
  type Block,
  type BlockType,
  type InlineContent,
  type Mark,
  BLOCK_TYPES,
  isBlockType,
} from "./blocks";

export {
  containsFreeHtml,
  contentDocumentV1Schema,
  isContentDocumentV1,
  parseContentDocumentV1,
  safeParseContentDocumentV1,
  type ContentDocumentV1,
  type SafeParseResult,
} from "./document";

export { extractBlockText, extractDocumentText } from "./extract-text";
