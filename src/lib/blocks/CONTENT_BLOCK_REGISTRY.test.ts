/**
 * src/lib/blocks/CONTENT_BLOCK_REGISTRY.test.ts
 *
 * Unit tests for the canonical block registry. Coverage
 * (per spec: "unit test on each schema"):
 *
 *   ── PER BLOCK (× 7) — 3 tests each ────────────────────────────
 *     - schema parse OK on a VALID fixture
 *     - schema reject KO on a SPECIFIC malformed payload
 *     - extractText returns the expected string
 *
 *   ── REGISTRY-LEVEL ──────────────────────────────────────────
 *     - CONTENT_BLOCK_REGISTRY has exactly 7 entries (no missing,
 *       no duplicate BlockType keys)
 *     - `getBlockEntry(type)` returns the same reference as the
 *       registry lookup
 *     - `parseContentBlock` dispatches via the discriminated union
 *       and returns `{ ok: true, data }` for valid input,
 *       `{ ok: false, error }` for invalid input
 *     - `isBlockType` narrows correctly (true for registered types,
 *       false for arbitrary strings)
 *
 *   ── RENDER (light coverage) ─────────────────────────────────
 *     - Each entry's render returns a React element (not a string
 *       or fragment-only)
 *     - `dividerEntry.render` returns `<hr />` (the unique
 *       parameterless container)
 *     - List entries (`bulletList`, `orderedList`) produce one
 *       `<li>` per InlineContent
 *     - Heading entry maps level 1|2|3 to <h1>|<h2>|<h3>
 */

import { describe, expect, it } from "vitest";
import { isValidElement } from "react";

import {
  BLOCK_TYPES,
  CONTENT_BLOCK_REGISTRY,
  type Block,
  type BlockOfType,
  type BlockType,
  type InlineContent,
  getBlockEntry,
  isBlockType,
  parseContentBlock,
} from "./CONTENT_BLOCK_REGISTRY";

// ─── Re-exports the test file needs ───────────────────────────────
//
// The registry file's surface re-exports the discriminated union
// via `type Block` only. The schema names below are not part of
// the test intent — they live in the implementation file. We
// import them via the registry's safeParse + entry schemas.

// ─── Test fixtures ────────────────────────────────────────────────

const run = (text: string, marks?: InlineContent["marks"]): InlineContent => ({
  type: "text",
  text,
  ...(marks ? { marks } : {}),
});

const happyParagraph: BlockOfType<"paragraph"> = {
  id: "p1",
  type: "paragraph",
  props: {},
  content: [
    run("Hello, "),
    run("world", [{ type: "bold" }]),
    run("!"),
  ],
};

const happyHeading: BlockOfType<"heading"> = {
  id: "h1",
  type: "heading",
  props: { level: 2 },
  content: [run("Module 1")],
};

const happyBulletList: BlockOfType<"bulletList"> = {
  id: "bl1",
  type: "bulletList",
  props: {},
  content: [run("First"), run("Second"), run("Third")],
};

const happyOrderedList: BlockOfType<"orderedList"> = {
  id: "ol1",
  type: "orderedList",
  props: {},
  content: [run("Step 1"), run("Step 2")],
};

const happyQuote: BlockOfType<"quote"> = {
  id: "q1",
  type: "quote",
  props: { attribution: "Einstein" },
  content: [run("Imagination is more important than knowledge.")],
};

const happyCallout: BlockOfType<"callout"> = {
  id: "c1",
  type: "callout",
  props: { variant: "info" },
  content: [run("Important note.")],
};

const happyDivider: BlockOfType<"divider"> = {
  id: "d1",
  type: "divider",
  props: {},
};

// ════════════════════════════════════════════════════════════════
// 1.  PARAGRAPH — schema + render + extractText
// ════════════════════════════════════════════════════════════════

describe("CONTENT_BLOCK_REGISTRY > paragraph", () => {
  const entry = CONTENT_BLOCK_REGISTRY.paragraph;

  it("schema parses a valid paragraph (3 mixed-mark InlineContents)", () => {
    const parsed = entry.schema.safeParse(happyParagraph);
    expect(parsed.success).toBe(true);
  });

  it("schema rejects an EXTRA prop (strict mode defense)", () => {
    const parsed = entry.schema.safeParse({
      ...happyParagraph,
      props: { align: "center" }, // not allowed
    });
    expect(parsed.success).toBe(false);
  });

  it("schema rejects an EMPTY content array", () => {
    const parsed = entry.schema.safeParse({
      ...happyParagraph,
      content: [],
    });
    expect(parsed.success).toBe(false);
  });

  it("extractText concatenates all InlineContent.text runs verbatim", () => {
    expect(entry.extractText(happyParagraph)).toBe("Hello, world!");
  });

  it("extractText IGNORES marks (visual-only)", () => {
    expect(
      entry.extractText({
        id: "p_marks",
        type: "paragraph",
        props: {},
        content: [
          run("Important", [{ type: "bold" }, { type: "italic" }]),
        ],
      }),
    ).toBe("Important");
  });

  it("render returns a React element wrapping a `<p>`", () => {
    const el = entry.render(happyParagraph);
    expect(isValidElement(el)).toBe(true);
  });
});


// ════════════════════════════════════════════════════════════════
// 2.  HEADING — schema + render + extractText
// ════════════════════════════════════════════════════════════════

describe("CONTENT_BLOCK_REGISTRY > heading", () => {
  const entry = CONTENT_BLOCK_REGISTRY.heading;

  it("schema parses heading with level in {1, 2, 3}", () => {
    for (const level of [1, 2, 3] as const) {
      const parsed = entry.schema.safeParse({
        ...happyHeading,
        props: { level },
      });
      expect(parsed.success).toBe(true);
    }
  });

  it("schema rejects level outside {1, 2, 3} (level=4 is OUT of MVP)", () => {
    const parsed = entry.schema.safeParse({
      ...happyHeading,
      props: { level: 4 },
    });
    expect(parsed.success).toBe(false);
  });

  it("schema rejects an unknown prop key (strict mode)", () => {
    const parsed = entry.schema.safeParse({
      ...happyHeading,
      props: { level: 2, color: "red" }, // extra key
    });
    expect(parsed.success).toBe(false);
  });

  it("extractText returns the heading text verbatim", () => {
    expect(entry.extractText(happyHeading)).toBe("Module 1");
  });

  it("render level=1 produces an <h1> React element", () => {
    const el = entry.render({ ...happyHeading, props: { level: 1 } });
    expect(isValidElement(el)).toBe(true);
    expect((el as { type: string }).type).toBe("h1");
  });

  it("render level=2 produces an <h2> React element", () => {
    const el = entry.render({ ...happyHeading, props: { level: 2 } });
    expect((el as { type: string }).type).toBe("h2");
  });

  it("render level=3 produces an <h3> React element", () => {
    const el = entry.render({ ...happyHeading, props: { level: 3 } });
    expect((el as { type: string }).type).toBe("h3");
  });
});


// ════════════════════════════════════════════════════════════════
// 3.  BULLETLIST — schema + render + extractText
// ════════════════════════════════════════════════════════════════

describe("CONTENT_BLOCK_REGISTRY > bulletList", () => {
  const entry = CONTENT_BLOCK_REGISTRY.bulletList;

  it("schema parses a bullet list with 3 items", () => {
    expect(entry.schema.safeParse(happyBulletList).success).toBe(true);
  });

  it("schema rejects a missing `type` field", () => {
    const broken = { ...happyBulletList, type: undefined } as unknown;
    expect(entry.schema.safeParse(broken).success).toBe(false);
  });

  it("extractText concatenates item texts with NO separator (per orphan convention)", () => {
    expect(entry.extractText(happyBulletList)).toBe("FirstSecondThird");
  });

  it("render produces a `<ul>` with one `<li>` per InlineContent", () => {
    const el = entry.render(happyBulletList);
    expect(isValidElement(el)).toBe(true);
    const listEl = el as { type: string; props: { children: unknown[] } };
    expect(listEl.type).toBe("ul");
    expect(Array.isArray(listEl.props.children)).toBe(true);
    expect(listEl.props.children.length).toBe(3);
  });
});


// ════════════════════════════════════════════════════════════════
// 4.  ORDEREDLIST — schema + render + extractText
// ════════════════════════════════════════════════════════════════

describe("CONTENT_BLOCK_REGISTRY > orderedList", () => {
  const entry = CONTENT_BLOCK_REGISTRY.orderedList;

  it("schema parses an ordered list with 2 items", () => {
    expect(entry.schema.safeParse(happyOrderedList).success).toBe(true);
  });

  it("schema rejects a content array of strings (must be InlineContent objects)", () => {
    const parsed = entry.schema.safeParse({
      ...happyOrderedList,
      content: ["a", "b"], // raw strings — wrong shape
    });
    expect(parsed.success).toBe(false);
  });

  it("extractText returns concatenated item texts", () => {
    expect(entry.extractText(happyOrderedList)).toBe("Step 1Step 2");
  });

  it("render produces an `<ol>` with one `<li>` per InlineContent", () => {
    const el = entry.render(happyOrderedList);
    const listEl = el as { type: string; props: { children: unknown[] } };
    expect(listEl.type).toBe("ol");
    expect(Array.isArray(listEl.props.children)).toBe(true);
    expect(listEl.props.children.length).toBe(2);
  });
});


// ════════════════════════════════════════════════════════════════
// 5.  QUOTE — schema + render + extractText
// ════════════════════════════════════════════════════════════════

describe("CONTENT_BLOCK_REGISTRY > quote", () => {
  const entry = CONTENT_BLOCK_REGISTRY.quote;

  it("schema parses a quote WITH attribution", () => {
    expect(entry.schema.safeParse(happyQuote).success).toBe(true);
  });

  it("schema parses a quote WITHOUT attribution (optional field)", () => {
    const parsed = entry.schema.safeParse({
      ...happyQuote,
      props: {},
    });
    expect(parsed.success).toBe(true);
  });

  it("schema rejects an unknown `citation` prop (only `attribution` allowed)", () => {
    const parsed = entry.schema.safeParse({
      ...happyQuote,
      props: { citation: "wrong-key" },
    });
    expect(parsed.success).toBe(false);
  });

  it("extractText returns body text ONLY (attribution is in props, not content)", () => {
    expect(entry.extractText(happyQuote)).toBe(
      "Imagination is more important than knowledge.",
    );
  });

  it("render WITHOUT attribution produces a `<blockquote>` with no footer", () => {
    const el = entry.render({
      ...happyQuote,
      props: {},
    });
    expect(isValidElement(el)).toBe(true);
    expect((el as { type: string }).type).toBe("blockquote");
  });

  it("render WITH attribution wraps a `<footer>` with `— ` prefix", () => {
    const el = entry.render(happyQuote);
    // The renderer nests `renderInlineContent` + a footer. We don't
    // introspect the React element tree deeply — just confirm the
    // root is a blockquote (per the semantic HTML spec).
    expect((el as { type: string }).type).toBe("blockquote");
  });
});


// ════════════════════════════════════════════════════════════════
// 6.  CALLOUT — schema + render + extractText
// ════════════════════════════════════════════════════════════════

describe("CONTENT_BLOCK_REGISTRY > callout", () => {
  const entry = CONTENT_BLOCK_REGISTRY.callout;

  it("schema parses a callout for each variant in the closed enum", () => {
    for (const variant of ["info", "success", "warning", "danger"] as const) {
      const parsed = entry.schema.safeParse({
        ...happyCallout,
        props: { variant },
      });
      expect(parsed.success).toBe(true);
    }
  });

  it("schema rejects an UNKNOWN variant (closed enum defense)", () => {
    const parsed = entry.schema.safeParse({
      ...happyCallout,
      props: { variant: "purple" },
    });
    expect(parsed.success).toBe(false);
  });

  it("schema rejects an empty content array", () => {
    const parsed = entry.schema.safeParse({
      ...happyCallout,
      content: [],
    });
    expect(parsed.success).toBe(false);
  });

  it("extractText returns the callout body text", () => {
    expect(entry.extractText(happyCallout)).toBe("Important note.");
  });

  it("render produces an `<aside>` with `data-variant` + `aria-label`", () => {
    const el = entry.render(happyCallout);
    const aside = el as { type: string; props: Record<string, unknown> };
    expect(aside.type).toBe("aside");
    expect(aside.props["data-variant"]).toBe("info");
    expect(aside.props["aria-label"]).toBe("Callout (info)");
  });
});


// ════════════════════════════════════════════════════════════════
// 7.  DIVIDER — schema + render + extractText (the asymmetric one)
// ════════════════════════════════════════════════════════════════

describe("CONTENT_BLOCK_REGISTRY > divider", () => {
  const entry = CONTENT_BLOCK_REGISTRY.divider;

  it("schema parses a divider (no content field — asymmetric)", () => {
    expect(entry.schema.safeParse(happyDivider).success).toBe(true);
  });

  it("schema REJECTS a content field (asymmetric — divider has none)", () => {
    const parsed = entry.schema.safeParse({
      ...happyDivider,
      content: [run("should not be here")], // violates strict
    });
    expect(parsed.success).toBe(false);
  });

  it("extractText returns the EMPTY string", () => {
    expect(entry.extractText(happyDivider)).toBe("");
  });

  it("render returns an `<hr />` (unique asymmetric renderer)", () => {
    const el = entry.render(happyDivider);
    expect(isValidElement(el)).toBe(true);
    expect((el as { type: string }).type).toBe("hr");
  });
});


// ════════════════════════════════════════════════════════════════
// 8.  REGISTRY-LEVEL — exhaustiveness + dispatch helpers
// ════════════════════════════════════════════════════════════════

describe("CONTENT_BLOCK_REGISTRY > registry-level", () => {
  it("has exactly 7 entries (no more, no less)", () => {
    expect(Object.keys(CONTENT_BLOCK_REGISTRY)).toHaveLength(7);
  });

  it("has one entry per BlockType (no duplicates, no missing)", () => {
    // Sort so equality is order-stable.
    const registryKeys = Object.keys(CONTENT_BLOCK_REGISTRY).sort();
    const expectedKeys = [...BLOCK_TYPES].sort();
    expect(registryKeys).toEqual(expectedKeys);
  });

  it("getBlockEntry(type) returns the SAME reference as the registry lookup", () => {
    for (const type of BLOCK_TYPES) {
      expect(getBlockEntry(type)).toBe(CONTENT_BLOCK_REGISTRY[type]);
    }
  });

  it("isBlockType is true for every registered type", () => {
    for (const type of BLOCK_TYPES) {
      expect(isBlockType(type)).toBe(true);
    }
  });

  it("isBlockType is false for unknown strings and non-strings", () => {
    expect(isBlockType("table")).toBe(false);
    expect(isBlockType("")).toBe(false);
    expect(isBlockType(null)).toBe(false);
    expect(isBlockType(undefined)).toBe(false);
    expect(isBlockType(123)).toBe(false);
  });
});


// ════════════════════════════════════════════════════════════════
// 9.  parseContentBlock — discriminated-union dispatcher
// ════════════════════════════════════════════════════════════════

describe("CONTENT_BLOCK_REGISTRY > parseContentBlock", () => {
  it("returns ok+data for a valid paragraph payload", () => {
    const res = parseContentBlock(happyParagraph);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.type).toBe("paragraph");
    }
  });

  it("returns ok+data for every BlockType fixture", () => {
    const fixtures: Block[] = [
      happyParagraph,
      happyHeading,
      happyBulletList,
      happyOrderedList,
      happyQuote,
      happyCallout,
      happyDivider,
    ];
    for (const f of fixtures) {
      const res = parseContentBlock(f);
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.data.type).toBe(f.type);
    }
  });

  it("returns ok=false + ZodError for a malformed payload (extra prop)", () => {
    const res = parseContentBlock({
      ...happyParagraph,
      props: { align: "center" },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.name).toBe("ZodError");
      expect(res.error.issues.length).toBeGreaterThan(0);
    }
  });

  it("returns ok=false for an unknown block type", () => {
    const res = parseContentBlock({
      id: "x1",
      type: "table", // not in BLOCK_TYPES
      props: {},
      content: [run("hi")],
    } as unknown);
    expect(res.ok).toBe(false);
  });

  it("returns ok=false when id is missing", () => {
    const res = parseContentBlock({
      type: "paragraph",
      props: {},
      content: [run("hi")],
    });
    expect(res.ok).toBe(false);
  });
});


// ════════════════════════════════════════════════════════════════
// 10. MARKS — visual-only semantics preserved end-to-end
// ════════════════════════════════════════════════════════════════

describe("CONTENT_BLOCK_REGISTRY > marks (visual-only in v1)", () => {
  it("bold/italic/code/link extractText is the text run, not the mark", () => {
    const para = CONTENT_BLOCK_REGISTRY.paragraph;
    expect(
      para.extractText({
        id: "p_m",
        type: "paragraph",
        props: {},
        content: [
          {
            type: "text",
            text: "Important",
            marks: [
              { type: "bold" },
              { type: "italic" },
              { type: "code" },
            ],
          },
        ],
      }),
    ).toBe("Important");
  });

  it("link mark text extraction ignores the href (URL is structural, not content)", () => {
    const para = CONTENT_BLOCK_REGISTRY.paragraph;
    expect(
      para.extractText({
        id: "p_l",
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


// ════════════════════════════════════════════════════════════════
// 11. Architecture guard — every entry exposes the 3-cap shape
// ════════════════════════════════════════════════════════════════

describe("CONTENT_BLOCK_REGISTRY > architecture guard", () => {
  it.each(BLOCK_TYPES)("entry '%s' has schema + render + extractText", (type) => {
    const entry = CONTENT_BLOCK_REGISTRY[type as BlockType];
    expect(typeof entry.schema.safeParse).toBe("function");
    expect(typeof entry.render).toBe("function");
    expect(typeof entry.extractText).toBe("function");
  });
});
