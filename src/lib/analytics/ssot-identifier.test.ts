/**
 * Tests for src/lib/analytics/ssot-identifier.ts (MCR Step 11).
 *
 * Lock in the `isCuidShape` predicate behavior so the analytics
 * identifier convention (AnalyticEvent.productId = Product.slug,
 * NOT cuid) is enforceable at every read site.
 *
 * Coverage:
 *   - Real cuid patterns are detected as cuid → rejected
 *   - Real Product.slug patterns are NOT detected as cuid → allowed
 *   - Empty / null / undefined inputs → false (safe default)
 *   - Edge case: pure-alphanumeric slug starting with 'c' (theoretical
 *     false positive risk per the docstring) is documented but still
 *     classified as cuid; future callers who allow such slugs must
 *     switch to a different check.
 */

import { describe, it, expect } from "vitest";
import { isCuidShape } from "./ssot-identifier";

describe("isCuidShape", () => {
  describe("real cuid patterns are detected", () => {
    it("matches a canonical cuid v1 (c + 24 alphanumerics)", () => {
      // Length 25: 'c' + 24 alphanumeric chars.
      expect(isCuidShape("clxyz1234567890abcdefghij")).toBe(true);
    });

    it("matches cuid-like patterns with mixed case", () => {
      // The regex is case-insensitive (the /i flag). Real cuids are
      // lowercase, but a mixed case "cuid" should still be flagged so
      // we don't let legacy data sneak through.
      expect(isCuidShape("cLXYZ1234567890ABCDEFGHIJ")).toBe(true);
    });

    it("matches cuid-like patterns at exactly the lower bound (21 chars total)", () => {
      // 'c' + 20 alphanumeric chars = 21 total. CUID v1 is 25 chars,
      // but we accept anything ≥ 21 to catch v2 / future variants.
      expect(isCuidShape("caaaaaaaaaaaaaaaaaaaaaa")).toBe(true);
    });

    it("matches cuid-like patterns much longer than cuid v1", () => {
      // Some cuid libs generate 28+ chars. The heuristic is open-ended.
      expect(isCuidShape("caaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")).toBe(true);
    });
  });

  describe("Product.slug patterns are NOT misclassified", () => {
    it("a short kebab-case slug is allowed", () => {
      expect(isCuidShape("lumio")).toBe(false);
    });

    it("a typical multi-word kebab-case slug is allowed", () => {
      expect(isCuidShape("test-course")).toBe(false);
    });

    it("a long kebab-case slug is allowed", () => {
      expect(isCuidShape("course-on-modern-web-development-2026")).toBe(false);
    });

    it("a numeric-starting slug is allowed", () => {
      expect(isCuidShape("2026-course")).toBe(false);
    });

    it("a mixed-case slug (uppercase letters) is allowed", () => {
      // The regex is /i so uppercase letters in the alphanumeric run
      // could match; but the slug here also has hyphens, which
      // disqualifies it.
      expect(isCuidShape("H612-Pro")).toBe(false);
    });

    it("extension-only slugs without hyphens but with the wrong start char are allowed", () => {
      // Starts with 'h', not 'c'. Passes through.
      expect(isCuidShape("horizon2026catalogpage")).toBe(false);
    });
  });

  describe("edge cases (safe defaults)", () => {
    it("empty string → false", () => {
      expect(isCuidShape("")).toBe(false);
    });

    it("null → false", () => {
      expect(isCuidShape(null)).toBe(false);
    });

    it("undefined → false", () => {
      expect(isCuidShape(undefined)).toBe(false);
    });

    it("non-letter-start alphanumeric string is allowed", () => {
      // Starts with a digit, not 'c'. Passes through.
      expect(isCuidShape("2026supersale25off")).toBe(false);
    });
  });

  describe("documented theoretical false-positive (kebab-case assumption)", () => {
    // This test intentionally documents the KNOWN limitation of
    // isCuidShape. If the codebase ever introduces raw-alphanumeric
    // slugs starting with 'c' and 21+ chars long, this assertion
    // will become a regression — which is the signal to switch
    // callers away from the heuristic.

    it("a pure-alphanumeric slug starting with 'c' IS currently classified as cuid (intentional)", () => {
      // Real slugs in this codebase are kebab-case. A hypothetical
      // slug "complete2026supersale25off" WOULD be rejected by any
      // guard using isCuidShape. The trust assumption is that all
      // slugs contain at least one hyphen. If they don't, callers
      // must tighten the input contract — NOT weaken isCuidShape.
      expect(isCuidShape("complete2026supersale25off")).toBe(true);
    });
  });
});
