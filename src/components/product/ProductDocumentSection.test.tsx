// @vitest-environment jsdom

/**
 * src/components/product/ProductDocumentSection.test.tsx
 *
 * Smoke + props-forwarding tests for `ProductDocumentSection`
 * (MCR Phase 2).
 *
 * ─── Test posture (minimal) ──────────────────────────────────────
 *
 *   The component's single job is: given a `ContentDocumentV1`
 *   document, dispatch each block to `BLOCK_REGISTRY[block.type]
 *   .render(...)` and wrap the produced ReactNode in the section
 *   outer `<section data-testid="product-document-section">`.
 *   The component does NOT own block DOM; the registry does.
 *
 *   Tests therefore:
 *     (a) verify the section wrapper mounts with default testid,
 *     (b) verify the wrapper respects `className` / `ariaLabel`
 *         props (forwarded verbatim),
 *     (c) verify empty document returns null,
 *     (d) verify unknown block types are silently skipped
 *         (forward-compat).
 *
 *   Tests deliberately STUB `BLOCK_REGISTRY` via `vi.mock`
 *   so the section's mapping logic (block → entry → render call)
 *   can be asserted without play-through of the actual React
 *   subtree (which would require a working jsdom rendering of
 *   the registry's components — out of scope for this MVP
 *   smoke suite; the registry has its own smoke in
 *   `src/lib/blocks/CONTENT_BLOCK_REGISTRY.test.ts`).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { ProductDocumentSection } from "./ProductDocumentSection";
import type {
  Block,
  ContentDocumentV1,
} from "@/domains/catalog/blocks";

// ─── Mocks ───────────────────────────────────────────────────────
//
// We stub BLOCK_REGISTRY so we can assert the call signature of
// `entry.render` per block type, without exercising the actual
// React sub-tree (which would require full jsdom + all registry
// renderers mounted). The registry has its own dedicated smoke
// suite in `src/lib/blocks/CONTENT_BLOCK_REGISTRY.test.ts`.
//
// `vi.hoisted` lifts the stub fn ABOVE `vi.mock`'s hoisting, so
// the mock factory doesn't suffer a TDZ violation when it tries
// to reference `stubRenderFn` during module resolution.

const { stubRenderFn, stubRender } = vi.hoisted(() => {
  // Both `stubRenderFn` and `stubRender` MUST be hoisted because
  // the `vi.mock` factory below references them at the time the
  // mocked module is evaluated. Vitest hoists `vi.mock` AND the
  // factory's referenced variables via `vi.hoisted`.
  const stubRenderFn = vi.fn();
  const stubRender = (props: { id: string; content?: unknown }): null => {
    stubRenderFn(props);
    // Return null instead of JSX — RTL doesn't need real DOM for
    // our assertions (we read the section wrapper only).
    return null;
  };
  return { stubRenderFn, stubRender };
});

vi.mock("@/lib/blocks/CONTENT_BLOCK_REGISTRY", () => ({
  BLOCK_REGISTRY: {
    paragraph: { type: "paragraph", render: stubRender },
    heading: { type: "heading", render: stubRender },
    bulletList: { type: "bulletList", render: stubRender },
    orderedList: { type: "orderedList", render: stubRender },
    quote: { type: "quote", render: stubRender },
    callout: { type: "callout", render: stubRender },
    divider: { type: "divider", render: stubRender },
  },
}));

// ─── Helpers ─────────────────────────────────────────────────────

function doc(blocks: Block[]): ContentDocumentV1 {
  return { schemaVersion: 1, blocks };
}

const HEADING_TEST_ID = "product-document-section";

// Block fixtures — content lives under `props.content` so the
// spread in the section (`{ ...block.props, id }`) feeds the
// registry's render call with `content` correctly. `as never`
// at the helper boundary bypasses the BLOCK discriminated
// union's strict per-variant typing on `props` and `content`.
// This is a workaround for a pre-existing schema mismatch
// (BLOCK schema declares top-level `content` + empty strict
// `props`; `makeBlock` ships content under `props.content`).
const paraBlock = (id: string, text: string): Block =>
  ({
    id,
    type: "paragraph",
    position: 0,
    props: { content: [{ type: "text", text }] } as never,
    content: [{ type: "text", text }],
  } as never) as Block;

const headingBlock = (id: string, text: string, level: 1 | 2 | 3): Block =>
  ({
    id,
    type: "heading",
    position: 0,
    props: {
      level,
      content: [{ type: "text", text }],
    },
    content: [{ type: "text", text }],
  } as never) as Block;

const unknownBlock = (id: string): Block =>
  ({
    id,
    type: "unknown" as never,
    position: 0,
    props: {},
    content: [],
  } as never) as Block;

beforeEach(() => {
  stubRenderFn.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─── Tests ──────────────────────────────────────────────────────

describe("ProductDocumentSection — section wrapper", () => {
  it("renders the section wrapper with default testid", () => {
    render(<ProductDocumentSection document={doc([paraBlock("p1", "hello world")])} />);
    expect(screen.getByTestId(HEADING_TEST_ID)).toBeDefined();
  });

  it("returns null for an empty document (zero blocks)", () => {
    const { container } = render(<ProductDocumentSection document={doc([])} />);
    expect(container.firstChild).toBeNull();
  });

  it("applies the optional className to the outer section", () => {
    render(
      <ProductDocumentSection
        document={doc([paraBlock("p-x", "x")])}
        className="custom-class"
      />,
    );
    expect(screen.getByTestId(HEADING_TEST_ID).className).toContain("custom-class");
  });

  it("uses ariaLabel when provided", () => {
    render(
      <ProductDocumentSection
        document={doc([paraBlock("p-y", "x")])}
        ariaLabel="Dettagli del corso"
      />,
    );
    expect(
      screen.getByTestId(HEADING_TEST_ID).getAttribute("aria-label"),
    ).toBe("Dettagli del corso");
  });
});

describe("ProductDocumentSection — registry dispatch", () => {
  it("dispatches each block to BLOCK_REGISTRY[block.type].render with id + props.content", () => {
    render(
      <ProductDocumentSection
        document={doc([
          paraBlock("p-first", "first text"),
          headingBlock("h-mid", "middle heading", 2),
          paraBlock("p-last", "last text"),
        ])}
      />,
    );
    // Three render calls — once per block, in document.blocks order.
    expect(stubRenderFn).toHaveBeenCalledTimes(3);
    // Order is preserved (first → last by blocks[].index).
    expect(stubRenderFn.mock.calls[0]?.[0]?.id).toBe("p-first");
    expect(stubRenderFn.mock.calls[1]?.[0]?.id).toBe("h-mid");
    expect(stubRenderFn.mock.calls[2]?.[0]?.id).toBe("p-last");
  });

  it("propagates `props.content` (the spread source for the registry render signature)", () => {
    render(
      <ProductDocumentSection
        document={doc([paraBlock("p1", "content under props")])}
      />,
    );
    // The registry's render signature destructures `content` from
    // the props spread. The section does `{ ...block.props, id }` —
    // `content` therefore lands at the top of the render arg.
    const propsArg = stubRenderFn.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(propsArg["id"]).toBe("p1");
    expect(propsArg["content"]).toEqual([{ type: "text", text: "content under props" }]);
  });

  it("unknown block type is silently skipped (forward-compat — no render attempt)", () => {
    render(
      <ProductDocumentSection
        document={doc([
          paraBlock("p-pre", "before unknown"),
          unknownBlock("future-type"),
          paraBlock("p-post", "after unknown"),
        ])}
      />,
    );
    // 2 render calls (only the two known types); the unknown is skipped.
    expect(stubRenderFn).toHaveBeenCalledTimes(2);
    expect(stubRenderFn.mock.calls[0]?.[0]?.id).toBe("p-pre");
    expect(stubRenderFn.mock.calls[1]?.[0]?.id).toBe("p-post");
  });
});
