/**
 * src/domains/catalog/blocks/extract-text.test.ts
 *
 * Plain-text extraction tests for ContentDocumentV1.
 *
 * Coverage:
 *   - Per-block extraction for each of the 7 block types.
 *   - Document-level concatenation with "\n\n" separator.
 *   - divider: returns "" (no content).
 *   - Empty document: returns "".
 *   - Marks (bold/italic/code/link) do NOT modify the extracted text
 *     (they're visual-only in v1 — flagged in extract-text.ts docstring).
 */

import { describe, it, expect } from "vitest";
import type { ContentDocumentV1 } from "./document";
import { extractBlockText, extractDocumentText } from "./extract-text";

// ─── Per-block extraction ─────────────────────────────────────────

describe("extractBlockText — per-block coverage", () => {
  it("paragraph: joins all InlineContent.text runs verbatim", () => {
    expect(
      extractBlockText({
        id: "p1",
        type: "paragraph",
        props: {},
        content: [
          { type: "text", text: "Hello, " },
          { type: "text", text: "world!" },
        ],
      }),
    ).toBe("Hello, world!");
  });

  it("heading: extracts the heading text", () => {
    expect(
      extractBlockText({
        id: "h1",
        type: "heading",
        props: { level: 1 },
        content: [{ type: "text", text: "Module 1: Foundations" }],
      }),
    ).toBe("Module 1: Foundations");
  });

  it("bulletList: joins all items verbatim (one per InlineContent)", () => {
    expect(
      extractBlockText({
        id: "bl1",
        type: "bulletList",
        props: {},
        content: [
          { type: "text", text: "First item" },
          { type: "text", text: "Second item" },
          { type: "text", text: "Third item" },
        ],
      }),
    ).toBe("First itemSecond itemThird item");
    // Note: no separator between items in extractBlockText — the
    // document-level separator is `\n\n` between BLOCKS, not items.
    // Item separation is the renderer's job (one <li> per InlineContent).
  });

  it("orderedList: same as bulletList for text extraction", () => {
    expect(
      extractBlockText({
        id: "ol1",
        type: "orderedList",
        props: {},
        content: [{ type: "text", text: "Step 1" }],
      }),
    ).toBe("Step 1");
  });

  it("quote: extracts the body text (attribution is in props, not content)", () => {
    expect(
      extractBlockText({
        id: "q1",
        type: "quote",
        props: { attribution: "Einstein" },
        content: [
          { type: "text", text: "Imagination is more important than knowledge." },
        ],
      }),
    ).toBe("Imagination is more important than knowledge.");
    // The attribution is in props, NOT content — extractBlockText
    // intentionally ignores it. A higher-level helper can join
    // attribution + body if needed (out of scope for v1).
  });

  it("callout: extracts the body text", () => {
    expect(
      extractBlockText({
        id: "c1",
        type: "callout",
        props: { variant: "info" },
        content: [{ type: "text", text: "This is important." }],
      }),
    ).toBe("This is important.");
  });

  it("divider: returns empty string (no content field by design)", () => {
    expect(
      extractBlockText({
        id: "d1",
        type: "divider",
        props: {},
      }),
    ).toBe("");
  });
});

// ─── Marks don't change the extracted text ───────────────────────

describe("extractBlockText — marks are visual-only", () => {
  it("ignores bold / italic / code marks", () => {
    expect(
      extractBlockText({
        id: "p_marks",
        type: "paragraph",
        props: {},
        content: [
          {
            type: "text",
            text: "Important",
            marks: [{ type: "bold" }, { type: "italic" }, { type: "code" }],
          },
        ],
      }),
    ).toBe("Important");
  });

  it("ignores link marks (the URL is structural, not text content)", () => {
    expect(
      extractBlockText({
        id: "p_link",
        type: "paragraph",
        props: {},
        content: [
          {
            type: "text",
            text: "Read more",
            marks: [{ type: "link", href: "https://example.com" }],
          },
        ],
      }),
    ).toBe("Read more");
  });
});

// ─── Document-level extraction ────────────────────────────────────

describe("extractDocumentText — document-level coverage", () => {
  it("joins per-block text with double-newline separator", () => {
    const doc: ContentDocumentV1 = {
      schemaVersion: 1,
      blocks: [
        {
          id: "h1",
          type: "heading",
          props: { level: 1 },
          content: [{ type: "text", text: "Title" }],
        },
        {
          id: "p1",
          type: "paragraph",
          props: {},
          content: [{ type: "text", text: "Body." }],
        },
      ],
    };
    expect(extractDocumentText(doc)).toBe("Title\n\nBody.");
  });

  it("returns empty string for an empty document", () => {
    expect(extractDocumentText({ schemaVersion: 1, blocks: [] })).toBe("");
  });

  it("treats dividers as empty blocks (still respects the separator rule)", () => {
    const doc: ContentDocumentV1 = {
      schemaVersion: 1,
      blocks: [
        {
          id: "p1",
          type: "paragraph",
          props: {},
          content: [{ type: "text", text: "Before" }],
        },
        { id: "d1", type: "divider", props: {} },
        {
          id: "p2",
          type: "paragraph",
          props: {},
          content: [{ type: "text", text: "After" }],
        },
      ],
    };
    expect(extractDocumentText(doc)).toBe("Before\n\n\n\nAfter");
    // Two \n\n separators because the divider block extracts to "".
    // The exact format is "Before" + "\n\n" + "" + "\n\n" + "After".
    // Downstream consumers can .trim() or normalize whitespace.
  });

  it("handles a doc with only a divider (returns empty after trim)", () => {
    const doc: ContentDocumentV1 = {
      schemaVersion: 1,
      blocks: [{ id: "d1", type: "divider", props: {} }],
    };
    expect(extractDocumentText(doc)).toBe("");
  });

  it("captures multi-block content in document order", () => {
    const doc: ContentDocumentV1 = {
      schemaVersion: 1,
      blocks: [
        {
          id: "p1",
          type: "paragraph",
          props: {},
          content: [{ type: "text", text: "Alpha" }],
        },
        {
          id: "q1",
          type: "quote",
          props: {},
          content: [{ type: "text", text: "Bravo" }],
        },
        {
          id: "c1",
          type: "callout",
          props: { variant: "success" },
          content: [{ type: "text", text: "Charlie" }],
        },
      ],
    };
    expect(extractDocumentText(doc)).toBe("Alpha\n\nBravo\n\nCharlie");
  });

  it("preserves a long document verbatim (round-trip semantics)", () => {
    const doc: ContentDocumentV1 = {
      schemaVersion: 1,
      blocks: [
        {
          id: "p_intro",
          type: "paragraph",
          props: {},
          content: [
            { type: "text", text: "Welcome to " },
            { type: "text", text: "the course", marks: [{ type: "bold" }] },
            { type: "text", text: "." },
          ],
        },
        {
          id: "h_agenda",
          type: "heading",
          props: { level: 2 },
          content: [{ type: "text", text: "Agenda" }],
        },
        {
          id: "bl_agenda",
          type: "bulletList",
          props: {},
          content: [
            { type: "text", text: "Foundations" },
            { type: "text", text: "Deep dive" },
            { type: "text", text: "Wrap-up" },
          ],
        },
      ],
    };
    expect(extractDocumentText(doc)).toBe(
      "Welcome to the course.\n\nAgenda\n\nFoundationsDeep diveWrap-up",
    );
  });
});
