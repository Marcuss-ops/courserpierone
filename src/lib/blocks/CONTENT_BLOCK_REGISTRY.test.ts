import { describe, expect, it } from "vitest";
import type { ContentDocumentV1 } from "@/domains/catalog/blocks";

import {
  BLOCK_REGISTRY,
  INSERTABLE_BLOCKS,
  findInvalidBlocks,
  getBlockEntry,
  makeBlock,
} from "@/lib/blocks/BLOCK_REGISTRY";

// ─── Schema coverage (the 7 MVP blocks) ─────────────────────

describe("CONTENT_BLOCK_REGISTRY — schema coverage", () => {
  it("paragraph: rejects empty content array", () => {
    const r = BLOCK_REGISTRY.paragraph.schema.safeParse({ content: [] });
    expect(r.success).toBe(false);
  });

  it("paragraph: accepts single empty inline text", () => {
    const r = BLOCK_REGISTRY.paragraph.schema.safeParse({
      content: [{ text: "" }],
    });
    expect(r.success).toBe(true);
  });

  it("heading: rejects level=4 (out of range 1-3)", () => {
    const r = BLOCK_REGISTRY.heading.schema.safeParse({
      level: 4,
      content: [{ text: "H4" }],
    });
    expect(r.success).toBe(false);
  });

  it("heading: accepts all three levels (1, 2, 3)", () => {
    for (const level of [1, 2, 3] as const) {
      const r = BLOCK_REGISTRY.heading.schema.safeParse({
        level,
        content: [{ text: `H${level}` }],
      });
      expect(r.success).toBe(true);
    }
  });

  it("bulletList: rejects items not an array", () => {
    const r = BLOCK_REGISTRY.bulletList.schema.safeParse({ items: "nope" });
    expect(r.success).toBe(false);
  });

  it("bulletList: accepts single empty item", () => {
    const r = BLOCK_REGISTRY.bulletList.schema.safeParse({
      items: [{ content: [{ text: "" }] }],
    });
    expect(r.success).toBe(true);
  });

  it("orderedList: reuses bulletList schema (parity)", () => {
    const ok = BLOCK_REGISTRY.orderedList.schema.safeParse({
      items: [{ content: [{ text: "1st" }] }],
    });
    expect(ok.success).toBe(true);
  });

  it("quote: rejects non-string content", () => {
    const r = BLOCK_REGISTRY.quote.schema.safeParse({
      content: [{ text: 42 }],
    });
    expect(r.success).toBe(false);
  });

  it("callout: rejects unknown variant", () => {
    const r = BLOCK_REGISTRY.callout.schema.safeParse({
      variant: "panic",
      content: [{ text: "" }],
    });
    expect(r.success).toBe(false);
  });

  it("callout: accepts all three variants (info, warning, success)", () => {
    for (const variant of ["info", "warning", "success"] as const) {
      const r = BLOCK_REGISTRY.callout.schema.safeParse({
        variant,
        content: [{ text: "" }],
      });
      expect(r.success).toBe(true);
    }
  });

  it("divider: accepts empty props (`{}`)", () => {
    const r = BLOCK_REGISTRY.divider.schema.safeParse({});
    expect(r.success).toBe(true);
  });

  it("divider: rejects extra unknown props (.strict())", () => {
    const r = BLOCK_REGISTRY.divider.schema.safeParse({
      extra: "not-allowed",
    });
    expect(r.success).toBe(false);
  });
});

// ─── Registry integrity ──────────────────────────────────────

describe("CONTENT_BLOCK_REGISTRY — registry integrity", () => {
  it("all 7 MVP block types are present", () => {
    expect(Object.keys(BLOCK_REGISTRY).sort()).toEqual(
      [
        "bulletList",
        "callout",
        "divider",
        "heading",
        "orderedList",
        "paragraph",
        "quote",
      ].sort(),
    );
  });

  it("every entry has a non-empty `label`", () => {
    for (const entry of INSERTABLE_BLOCKS) {
      expect(entry.label.length).toBeGreaterThan(0);
    }
  });

  it("every entry has a `render` function", () => {
    for (const entry of INSERTABLE_BLOCKS) {
      expect(typeof entry.render).toBe("function");
    }
  });

  it("every entry has a `defaultProps` factory", () => {
    for (const entry of INSERTABLE_BLOCKS) {
      expect(typeof entry.defaultProps).toBe("function");
      expect(entry.defaultProps()).toBeTypeOf("object");
    }
  });
});

// ─── getBlockEntry ───────────────────────────────────────────

describe("CONTENT_BLOCK_REGISTRY — getBlockEntry", () => {
  it("returns the matching entry for known types", () => {
    expect(getBlockEntry("paragraph").type).toBe("paragraph");
    expect(getBlockEntry("heading").type).toBe("heading");
    expect(getBlockEntry("divider").type).toBe("divider");
  });

  it("throws on unknown type (exhaustiveness check)", () => {
    expect(() =>
      getBlockEntry("unknown-type" as unknown as "paragraph"),
    ).toThrow();
  });
});

// ─── findInvalidBlocks ──────────────────────────────────────

describe("CONTENT_BLOCK_REGISTRY — findInvalidBlocks", () => {
  it("returns empty list for a fully valid document", () => {
    const doc = {
      schemaVersion: 1 as const,
      blocks: [
        {
          id: "b1",
          type: "paragraph",
          props: {},
          content: [{ type: "text", text: "hello" }],
          position: 0,
        },
      ],
    };
    expect(findInvalidBlocks(doc as unknown as ContentDocumentV1)).toEqual([]);
  });

  it("returns block id for a document with one invalid block", () => {
    const doc = {
      schemaVersion: 1 as const,
      blocks: [
        {
          id: "b_bad",
          type: "paragraph",
          props: {},
          content: "should-be-array",
          position: 0,
        },
      ],
    };
    expect(findInvalidBlocks(doc as unknown as ContentDocumentV1)).toEqual([
      "b_bad",
    ]);
  });
});

// ─── makeBlock ───────────────────────────────────────────────

describe("CONTENT_BLOCK_REGISTRY — makeBlock", () => {
  it("creates a block with default props + generated id", () => {
    const block = makeBlock("heading");
    expect(block.id).toBeTruthy();
    expect(block.type).toBe("heading");
    expect((block.props as { level: number }).level).toBe(2);
  });

  it("respects explicit position argument", () => {
    const block = makeBlock("divider", 7);
    expect(block.position).toBe(7);
  });
});
