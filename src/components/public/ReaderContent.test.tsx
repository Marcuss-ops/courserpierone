// @vitest-environment jsdom
/**
 * src/components/public/ReaderContent.test.tsx
 *
 * Smoke tests for the public reader's content body.
 *
 * Coverage:
 *   - empty document renders the "nessun contenuto" empty state
 *   - each block renders inside a data-block-id wrapper
 *   - heading block sets the canonical DOM id
 *     `heading-{blockId}` on the rendered <hN> element
 *   - paragraph block renders a <p> element
 *   - divider block renders an <hr> element
 *   - multiple blocks render in document order
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Block } from "@/domains/catalog/blocks";

import { ReaderContent } from "./ReaderContent";

// The DOM-prefix literal `"heading-"` lives in the registry's
// `HeadingBlock` (single source of truth) and is mirrored by
// `TableOfContents.headingAnchor(blockId)`. ReaderContent
// passes the RAW block.id and trusts the registry to add
// the prefix. Inline this literal in tests (the test would
// break the day the registry changes the prefix; the test
// surfaces any divergence).
const HEADING_ANCHOR_PREFIX = "heading-";

function id() {
  return `block_${Math.random().toString(36).slice(2, 10)}`;
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

function divider(id: string): Block {
  return {
    id,
    type: "divider",
    props: {},
    position: 0,
  };
}

describe("ReaderContent — empty state", () => {
  it("renders the 'nessun contenuto' empty state for an empty document", () => {
    render(<ReaderContent document={{ schemaVersion: 1, blocks: [] }} />);
    expect(screen.getByTestId("reader-content-empty")).toBeTruthy();
  });

  it("renders the empty state when document is nullish", () => {
    // Cast through unknown to bypass the strict type —
    // the empty-state guard must defend against any falsy.
    render(
      <ReaderContent
        document={null as unknown as { schemaVersion: 1; blocks: Block[] }}
      />,
    );
    expect(screen.getByTestId("reader-content-empty")).toBeTruthy();
  });
});

describe("ReaderContent — block rendering", () => {
  it("wraps every block in a data-block-id container", () => {
    render(
      <ReaderContent
        document={{
          schemaVersion: 1,
          blocks: [paragraph(id(), "hello"), paragraph(id(), "world")],
        }}
      />,
    );
    const article = screen.getByTestId("reader-content");
    expect(article).toBeTruthy();
    const wrappers = article.querySelectorAll("[data-block-id]");
    expect(wrappers.length).toBe(2);
  });

  it("heading block sets the canonical DOM id `heading-{blockId}`", () => {
    const blockId = "h_block_xyz";
    render(
      <ReaderContent
        document={{
          schemaVersion: 1,
          blocks: [heading(blockId, 1, "Titolo")],
        }}
      />,
    );
    const expectedId = `${READER_HEADING_ANCHOR_PREFIX}${blockId}`;
    const headingEl = document.getElementById(expectedId);
    expect(headingEl).toBeTruthy();
    expect(headingEl?.tagName).toBe("H1");
    expect(headingEl?.textContent).toBe("Titolo");
  });

  it("paragraph block renders a <p> element", () => {
    render(
      <ReaderContent
        document={{
          schemaVersion: 1,
          blocks: [paragraph(id(), "Hello world")],
        }}
      />,
    );
    const article = screen.getByTestId("reader-content");
    const p = article.querySelector("p");
    expect(p).toBeTruthy();
    expect(p?.textContent).toContain("Hello world");
  });

  it("divider block renders an <hr> element", () => {
    render(
      <ReaderContent
        document={{ schemaVersion: 1, blocks: [divider(id())] }}
      />,
    );
    const article = screen.getByTestId("reader-content");
    const hr = article.querySelector("hr");
    expect(hr).toBeTruthy();
  });

  it("renders multiple blocks in document order", () => {
    render(
      <ReaderContent
        document={{
          schemaVersion: 1,
          blocks: [
            heading("h-titolo", 1, "Titolo"),
            paragraph("p-intro", "Intro body"),
            divider("d-1"),
            paragraph("p-rest", "Rest body"),
          ],
        }}
      />,
    );
    const article = screen.getByTestId("reader-content");
    const blockIds = Array.from(article.querySelectorAll("[data-block-id]")).map(
      (n) => n.getAttribute("data-block-id") ?? "",
    );
    expect(blockIds).toEqual(["h-titolo", "p-intro", "d-1", "p-rest"]);
  });
});
