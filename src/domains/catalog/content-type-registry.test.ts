/**
 * src/domains/catalog/content-type-registry.test.ts
 *
 * Caratterizzazione del Content Type Registry (Courssy — registries sprint).
 *
 * Coverage:
 *  - 8 spec&rsquo;d kinds: each parses cleanly + unknown values throw.
 *  - 5 spec&rsquo;d statuses: each parses cleanly + unknown values throw.
 *  - Runtime helpers isContentKind/isContentStatus: type-narrowing
 *    accept only valid values, reject undefined/null/numbers/objects.
 *  - parseContentKind / parseContentStatus: throws ZodError on invalid.
 *  - contentSlugSchema regex: low alphanumeric + dashes, length 3–64.
 *  - contentItemSchema: bundled shape validates kind+status+slug+id.
 *  - Registry integrity: zero duplicates in CONTENT_KINDS / STATUSES.
 */

import { describe, it, expect } from "vitest";

import {
  CONTENT_KINDS,
  CONTENT_STATUSES,
  contentItemSchema,
  contentKindSchema,
  contentSlugSchema,
  contentStatusSchema,
  isContentKind,
  isContentStatus,
  parseContentKind,
  parseContentStatus,
} from "./content-type-registry";

// ─── contentKind ─────────────────────────────────────────────────

describe("contentKindSchema", () => {
  it("accepts all 8 spec&rsquo;d kinds", () => {
    for (const k of CONTENT_KINDS) {
      expect(contentKindSchema.parse(k)).toBe(k);
    }

    // MCR Step 12 — `video_course` is the canonical Product.contentKind
    // default. The pattern: registry values are STRICT lowercased strings,
    // matching the Prisma @default literal so round-trip parse works.
    expect(contentKindSchema.parse("video_course")).toBe("video_course");
  });

  it("rejects unknown values", () => {
    expect(() => contentKindSchema.parse("podcast")).toThrow();
    expect(() => contentKindSchema.parse("")).toThrow();
    expect(() => contentKindSchema.parse("POST")).toThrow(); // case-sensitive
    expect(() => contentKindSchema.parse(null)).toThrow();
    expect(() => contentKindSchema.parse(undefined)).toThrow();
    expect(() => contentKindSchema.parse(42)).toThrow();
  });

  it("CONTENT_KINDS contains exactly 8 unique entries", () => {
    expect(CONTENT_KINDS.length).toBe(8);
    expect(new Set(CONTENT_KINDS).size).toBe(8);
  });
});

// ─── contentStatus ──────────────────────────────────────────────

describe("contentStatusSchema", () => {
  it("accepts all 5 spec&rsquo;d statuses", () => {
    for (const s of CONTENT_STATUSES) {
      expect(contentStatusSchema.parse(s)).toBe(s);
    }
  });

  it("rejects unknown statuses", () => {
    expect(() => contentStatusSchema.parse("approved")).toThrow();
    expect(() => contentStatusSchema.parse("PENDING")).toThrow();
    expect(() => contentStatusSchema.parse(undefined)).toThrow();
    expect(() => contentStatusSchema.parse("")).toThrow();
  });

  it("CONTENT_STATUSES contains exactly 5 unique entries", () => {
    expect(CONTENT_STATUSES.length).toBe(5);
    expect(new Set(CONTENT_STATUSES).size).toBe(5);
  });
});

// ─── runtime helpers ─────────────────────────────────────────────

describe("isContentKind", () => {
  it("returns true for each spec&rsquo;d kind", () => {
    for (const k of CONTENT_KINDS) expect(isContentKind(k)).toBe(true);
  });

  it("returns false for unknown strings + non-string values", () => {
    expect(isContentKind("podcast")).toBe(false);
    expect(isContentKind("")).toBe(false);
    expect(isContentKind("POST")).toBe(false);
    expect(isContentKind(undefined)).toBe(false);
    expect(isContentKind(null)).toBe(false);
    expect(isContentKind(42)).toBe(false);
    expect(isContentKind({})).toBe(false);
  });
});

describe("parseContentKind", () => {
  it("returns a typed ContentKind", () => {
    expect(parseContentKind("post")).toBe("post");
    expect(parseContentKind("offer_card")).toBe("offer_card");
  });

  it("throws ZodError on invalid", () => {
    expect(() => parseContentKind("bad")).toThrow();
  });
});

describe("isContentStatus", () => {
  it("returns true for each spec&rsquo;d status", () => {
    for (const s of CONTENT_STATUSES) expect(isContentStatus(s)).toBe(true);
  });

  it("returns false for non-status inputs", () => {
    expect(isContentStatus("approved")).toBe(false);
    expect(isContentStatus(undefined)).toBe(false);
    expect(isContentStatus(42)).toBe(false);
  });
});

describe("parseContentStatus", () => {
  it("returns a typed ContentStatus", () => {
    expect(parseContentStatus("published")).toBe("published");
  });

  it("throws on invalid", () => {
    expect(() => parseContentStatus("bad")).toThrow();
  });
});

// ─── contentSlugSchema ──────────────────────────────────────────

describe("contentSlugSchema", () => {
  it("accepts valid slugs", () => {
    expect(contentSlugSchema.parse("hello-world")).toBe("hello-world");
    expect(contentSlugSchema.parse("a-b-c")).toBe("a-b-c");
    expect(contentSlugSchema.parse("course-101")).toBe("course-101");
    expect(contentSlugSchema.parse("x")).toBe("x");
  });

  it("rejects uppercase", () => {
    expect(() => contentSlugSchema.parse("Hello-World")).toThrow();
    expect(() => contentSlugSchema.parse("ABC")).toThrow();
  });

  it("rejects whitespace", () => {
    expect(() => contentSlugSchema.parse("hello world")).toThrow();
  });

  it("rejects empty", () => {
    expect(() => contentSlugSchema.parse("")).toThrow();
  });

  it("rejects leading dash", () => {
    expect(() => contentSlugSchema.parse("-hello")).toThrow();
  });

  it("rejects too long (>64 chars)", () => {
    const long = "a".repeat(65);
    expect(() => contentSlugSchema.parse(long)).toThrow();
  });
});

// ─── contentItemSchema (bundled) ────────────────────────────────

describe("contentItemSchema", () => {
  it("accepts valid items", () => {
    expect(
      contentItemSchema.parse({
        id: "c1",
        kind: "post",
        status: "published",
        slug: "first-post",
      }),
    ).toEqual({
      id: "c1",
      kind: "post",
      status: "published",
      slug: "first-post",
    });
  });

  it("rejects invalid kind in bundled context", () => {
    expect(() =>
      contentItemSchema.parse({
        id: "c1",
        kind: "podcast",
        status: "published",
        slug: "x",
      }),
    ).toThrow();
  });

  it("rejects invalid status in bundled context", () => {
    expect(() =>
      contentItemSchema.parse({
        id: "c1",
        kind: "lesson",
        status: "approved",
        slug: "x",
      }),
    ).toThrow();
  });
});

// ─── registry integrity (no silent drift) ────────────────────────

describe("registry integrity", () => {
  it("CONTENT_KINDS has zero duplicates", () => {
    expect(new Set(CONTENT_KINDS).size).toBe(CONTENT_KINDS.length);
  });

  it("CONTENT_STATUSES has zero duplicates", () => {
    expect(new Set(CONTENT_STATUSES).size).toBe(CONTENT_STATUSES.length);
  });
});
