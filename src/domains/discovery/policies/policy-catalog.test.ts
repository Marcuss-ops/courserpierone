/**
 * src/domains/discovery/policies/policy-catalog.test.ts
 *
 * Unit tests for the Recommendation Policy Catalog metadata layer.
 *
 * Coverage:
 *   - module load: POLICY_CATALOG parses cleanly (self-validation
 *     passed at import time \u2014 if this test runs, the import succeeded)
 *   - count: exactly 6 entries (matching the 6 default policies)
 *   - kind coverage: 4 boost + 1 filter + 1 sort
 *   - unique names: no duplicates
 *   - lookup helpers: by name and by kind return expected entries
 *   - filter/sort entries: do NOT carry scoreHint (boost-only field)
 *   - file paths: each catalog file matches a sibling rank-* or
 *     exclude-* / free-before-* pattern (sanity check via filename)
 */

import { describe, it, expect } from "vitest";

import {
  POLICY_CATALOG,
  POLICY_COUNT,
  getCatalogEntriesByKind,
  getCatalogEntry,
  policyCatalogEntrySchema,
} from "./policy-catalog";

describe("POLICY_CATALOG \u2014 module-level integrity", () => {
  it("contains exactly 6 entries (matching 6 default RankingPolicies)", () => {
    expect(POLICY_CATALOG.length).toBe(6);
    expect(POLICY_COUNT).toBe(6);
  });

  it("covers 4 boost + 1 filter + 1 sort (matching policy-registry.ts RANKING_POLICIES shape)", () => {
    const kinds = POLICY_CATALOG.map((e) => e.kind);
    expect(kinds.filter((k) => k === "boost")).toHaveLength(4);
    expect(kinds.filter((k) => k === "filter")).toHaveLength(1);
    expect(kinds.filter((k) => k === "sort")).toHaveLength(1);
  });

  it("all entry names are unique", () => {
    const names = POLICY_CATALOG.map((e) => e.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("all entry file paths are unique", () => {
    const files = POLICY_CATALOG.map((e) => e.file);
    expect(new Set(files).size).toBe(files.length);
  });

  it("all 6 names match the 6 default policies shipped in policy-registry.ts", () => {
    const expected = [
      "rank-by-course-progress",
      "rank-by-language-compat",
      "rank-by-same-creator",
      "rank-by-same-topic",
      "exclude-already-purchased",
      "free-before-upsell",
    ];
    expect(POLICY_CATALOG.map((e) => e.name).sort()).toEqual(
      expected.sort(),
    );
  });
});

describe("policyCatalogEntrySchema \u2014 Zod validation", () => {
  it("accepts a complete valid entry", () => {
    const result = policyCatalogEntrySchema.safeParse({
      name: "test-policy",
      kind: "boost",
      file: "./test-policy",
      description: "Test policy for schema validation",
      scoreHint: 42,
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = policyCatalogEntrySchema.safeParse({
      name: "",
      kind: "boost",
      file: "./x",
      description: "x",
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown kind", () => {
    const result = policyCatalogEntrySchema.safeParse({
      name: "x",
      kind: "boost-extra", // not in enum
      file: "./x",
      description: "x",
    });
    expect(result.success).toBe(false);
  });

  it("accepts entries without scoreHint (filter/sort may omit it)", () => {
    const result = policyCatalogEntrySchema.safeParse({
      name: "no-hint-policy",
      kind: "filter",
      file: "./filter",
      description: "Filter policy without scoreHint",
    });
    expect(result.success).toBe(true);
  });
});

describe("POLICY_CATALOG \u2014 scoreHint presence", () => {
  it("boost entries carry a scoreHint", () => {
    const boosts = POLICY_CATALOG.filter((e) => e.kind === "boost");
    for (const b of boosts) {
      expect(b.scoreHint).toBeDefined();
      expect(typeof b.scoreHint).toBe("number");
    }
  });

  it("filter entry does NOT carry a scoreHint", () => {
    const filter = POLICY_CATALOG.find((e) => e.kind === "filter");
    expect(filter).toBeDefined();
    expect(filter?.scoreHint).toBeUndefined();
  });

  it("sort entry does NOT carry a scoreHint", () => {
    const sort = POLICY_CATALOG.find((e) => e.kind === "sort");
    expect(sort).toBeDefined();
    expect(sort?.scoreHint).toBeUndefined();
  });
});

describe("POLICY_CATALOG \u2014 file path conventions", () => {
  it("every file path starts with ./ (relative to sibling folder)", () => {
    for (const e of POLICY_CATALOG) {
      expect(e.file.startsWith("./")).toBe(true);
    }
  });
});

describe("lookup helpers", () => {
  it("getCatalogEntry returns the entry for a known name", () => {
    const entry = getCatalogEntry("rank-by-course-progress");
    expect(entry).toBeDefined();
    expect(entry?.kind).toBe("boost");
    expect(entry?.file).toBe("./rank-by-course-progress");
  });

  it("getCatalogEntry returns undefined for unknown name", () => {
    expect(getCatalogEntry("nope")).toBeUndefined();
  });

  it("getCatalogEntriesByKind returns all entries of the given kind", () => {
    const boosts = getCatalogEntriesByKind("boost");
    expect(boosts.length).toBe(4);
    for (const b of boosts) expect(b.kind).toBe("boost");

    const filters = getCatalogEntriesByKind("filter");
    expect(filters.length).toBe(1);
    expect(filters[0]?.name).toBe("exclude-already-purchased");

    const sorts = getCatalogEntriesByKind("sort");
    expect(sorts.length).toBe(1);
    expect(sorts[0]?.name).toBe("free-before-upsell");
  });
});
