/**
 * src/components/public/derive-toc.test.ts
 *
 * Unit tests for the TOC derivation helper. Pure functions
 * — no React, no fetch, no Prisma.
 *
 * Coverage:
 *   - empty list → empty array
 *   - all-headings preserved in document order
 *   - non-heading blocks filtered out
 *   - headings with empty text filtered out
 *   - headings with level outside {1|2|3} filtered out
 *   - block.id round-trip preserved
 */

import { describe, expect, it } from "vitest";

import type { Block } from "@/domains/catalog/blocks";

import { deriveToc } from "./derive-toc";

function doc(blocks: Block[]) {
  return { schemaVersion: 1 as const, blocks };
}

function heading(id: string, level: 1 | 2 | 3, text: string): Block {
  return {
    id,
    type: "heading",
    props: { level, content: [{ text }] },
    position: 0,
  };
}

function paragraph(id: string, text: string): Block {
  return {
    id,
    type: "paragraph",
    props: { content: [{ text }] },
    position: 0,
  };
}

describe("deriveToc — input invariants", () => {
  it("returns empty array when document has zero blocks", () => {
    expect(deriveToc(doc([]))).toEqual([]);
  });

  it("returns empty array when document has only non-heading blocks", () => {
    expect(
      deriveToc(doc([paragraph("p1", "Hello"), paragraph("p2", "World")])),
    ).toEqual([]);
  });
});

describe("deriveToc — heading preservation", () => {
  it("preserves heading order from document", () => {
    const headings = deriveToc(
      doc([
        heading("h1", 1, "Introduction"),
        heading("h2", 2, "Concepts"),
        heading("h3", 3, "Subconcept"),
      ]),
    );
    expect(headings.map((h) => h.blockId)).toEqual(["h1", "h2", "h3"]);
    expect(headings.map((h) => h.level)).toEqual([1, 2, 3]);
    expect(headings.map((h) => h.text)).toEqual([
      "Introduction",
      "Concepts",
      "Subconcept",
    ]);
  });

  it("skips empty-text headings (placeholder editor blocks)", () => {
    expect(
      deriveToc(
        doc([
          heading("h1", 1, "Intro"),
          heading("h-empty", 2, "   "),
          heading("h2", 3, "Done"),
        ]),
      ).map((h) => h.blockId),
    ).toEqual(["h1", "h2"]);
  });

  it("skips headings with level outside {1|2|3}", () => {
    const block4: Block = {
      id: "h4",
      type: "heading",
      props: { level: 4 as unknown as 2, content: [{ text: "x" }] },
      position: 0,
    };
    expect(
      deriveToc(doc([heading("h1", 1, "A"), block4, heading("h2", 2, "B")]))
        .map((h) => h.blockId),
    ).toEqual(["h1", "h2"]);
  });

  it("interleaves non-heading blocks WITHOUT including them", () => {
    expect(
      deriveToc(
        doc([
          heading("h1", 1, "Intro"),
          paragraph("p1", "body"),
          heading("h2", 2, "Concepts"),
          paragraph("p2", "more body"),
          heading("h3", 3, "Sub"),
        ]),
      ).map((h) => h.blockId),
    ).toEqual(["h1", "h2", "h3"]);
  });
});
