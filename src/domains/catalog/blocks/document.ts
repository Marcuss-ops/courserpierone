/**
 * src/domains/catalog/blocks/document.ts
 *
 * ContentDocumentV1 — the canonical document shape stored in
 * `ContentPageTranslation.document` (PG JSONB column, NOT NULL).
 *
 * Layered defense for the "no free HTML" guarantee:
 *   1. Schema-level: every structural element MUST round-trip through
 *      one of the typed blocks (paragraph / heading / lists / quote /
 *      callout / divider). Text fields are Zod-validated strings; no
 *      string-typed field accepts arbitrary markup.
 *   2. Runtime sweep: `containsFreeHtml(doc)` walks all string fields
 *      (content[].text + every string-typed prop on every block) and
 *      rejects documents whose strings contain a `<tag>...</tag>`-style
 *      HTML tag. This catches accidental paste-from-Word / Markdown-
 *      with-raw-HTML / `<script>` XSS payloads that the Zod schema
 *      can't see (they're just text strings).
 *
 * Schema version policy:
 *   - `schemaVersion: z.literal(1)` — strict. v2 (or any other version)
 *     is rejected at parse time. Future versions land via a new
 *     `contentDocumentV2Schema` + a dispatcher `parseContentDocumentAuto`
 *     that inspects the JSON `schemaVersion` field and picks the
 *     correct schema. v1 documents stay on v1 forever — no silent
 *     auto-migration.
 */

import { z } from "zod";
import { blockSchema, type Block } from "./blocks";

// ─── Free-HTML detection (regex sweep) ────────────────────────────
//
// Greedy match for an opening HTML tag. Catches `<script>`, `<img>`,
// `<iframe>`, `<a href>`, etc. We don't try to close-tag match — the
// presence of any opening tag is enough to reject the document; the
// renderer + DB never see it.
//
// Limitation: this is a heuristic, not a parser. Math expressions like
// `<3` (3 is not a letter) won't match; `<hello>` (not a real HTML tag)
// WILL match. False positives are fine for v1 (legitimate content never
// contains `<` followed by a letter in plain prose). If the future
// requires literal `<letter` substrings, we can add a denylist of
// known-safe exceptions.
const FREE_HTML_PATTERN = /<[a-z][\s\S]*>/i;

function collectStringFields(block: Block): string[] {
  const strings: string[] = [];
  // Walk InlineContent[].text if present (all blocks except divider).
  // The `"content" in block` check is the canonical narrowing for the
  // DividerBlock asymmetry.
  if ("content" in block && Array.isArray(block.content)) {
    for (const inline of block.content) {
      if (typeof inline.text === "string") strings.push(inline.text);
    }
  }
  // Walk every string-typed prop. Object.values on the typed props
  // surfaces only the values (not the keys); typeof filter rejects
  // numbers / booleans / undefined without runtime errors.
  for (const value of Object.values(block.props ?? {})) {
    if (typeof value === "string") strings.push(value);
  }
  return strings;
}

export function containsFreeHtml(doc: ContentDocumentV1): boolean {
  return doc.blocks.some((block) =>
    collectStringFields(block).some((s) => FREE_HTML_PATTERN.test(s)),
  );
}

// ─── Top-level document schema ────────────────────────────────────

export const contentDocumentV1Schema = z.object({
  schemaVersion: z.literal(1),
  blocks: z.array(blockSchema),
});

export type ContentDocumentV1 = z.infer<typeof contentDocumentV1Schema>;

// ─── Runtime helpers (mirror content-type-registry pattern) ──────

/**
 * Strict parse: throws ZodError on schema mismatch OR when the document
 * contains free HTML. Use this at the trust boundary (creator-side
 * route handler writing to ContentPageTranslation.document).
 */
export function parseContentDocumentV1(value: unknown): ContentDocumentV1 {
  const doc = contentDocumentV1Schema.parse(value);
  if (containsFreeHtml(doc)) {
    throw new Error(
      "Free HTML detected in structured document text. " +
        "Every structural element must round-trip through a typed block; " +
        "raw HTML in text strings is rejected.",
    );
  }
  return doc;
}

/**
 * Type-narrowing check: returns true iff `value` is a valid
 * ContentDocumentV1 (schemaVersion 1, structurally valid, no free HTML).
 * Use this for read-side consumer narrowing.
 */
export function isContentDocumentV1(value: unknown): value is ContentDocumentV1 {
  const result = contentDocumentV1Schema.safeParse(value);
  if (!result.success) return false;
  return !containsFreeHtml(result.data);
}

/**
 * Safe-parse variant: returns a discriminated result `{ ok: true, data }
 * | { ok: false, error }` instead of throwing. Useful for UI
 * validation messages that need the Zod issue list.
 */
export type SafeParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: z.ZodError };

export function safeParseContentDocumentV1(value: unknown): SafeParseResult<ContentDocumentV1> {
  const result = contentDocumentV1Schema.safeParse(value);
  if (!result.success) return { ok: false, error: result.error };
  if (containsFreeHtml(result.data)) {
    return {
      ok: false,
      error: new z.ZodError([
        {
          code: z.ZodIssueCode.custom,
          path: ["blocks"],
          message:
            "Free HTML detected in structured document text. Use typed blocks instead.",
        },
      ]),
    };
  }
  return { ok: true, data: result.data };
}
