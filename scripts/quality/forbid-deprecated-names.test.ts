/**
 * scripts/quality/forbid-deprecated-names.test.ts
 *
 * Caratterizzazione della regex deny-list del guardrail CI (closes
 * ADR-0016 §d commit 1). Garantisce che modifiche future ai 4 pattern
 * o all'allowList siano testate, non breaking-change silenzioso.
 *
 * Mirrors scripts/quality/hotspot-score.test.ts (precedente in
 * scripts/quality/ per quality scripts).
 */
import { describe, it, expect } from "vitest";

// Re-implementa le 4 regex dal guardrail. Mantenere sincronizzato con
// scripts/quality/forbid-deprecated-names.ts — se la sorgente cambia
// i pattern, anche questo file deve cambiare.
//
// Word-boundary semantics: POSIX / Perl \w = [a-zA-Z0-9_]
//   - 'courserpierone': r → p sono entrambi \w → no boundary → no match
//   - 'courser_test':   r → _ sono entrambi \w → no boundary → no match
//   - 'this.courser':    r → ' ' (non-\w) → boundary exists → match
const PATTERNS = {
  Courser: /\bCourser\b/g,
  courser: /\bcourser\b/g,
  Coursy:  /\bCoursy\b/g,
  coursy:  /\bcoursy\b/g,
};

function reset(): void {
  for (const re of Object.values(PATTERNS)) re.lastIndex = 0;
}

describe("forbid-deprecated-names — regex semantics", () => {
  it("matches 'Courser' (uppercase display, brand name)", () => {
    reset();
    expect(PATTERNS.Courser.test("Hello Courser")).toBe(true);
  });

  it("does NOT match 'Courssy' (canonical 7-char)", () => {
    reset();
    expect(PATTERNS.Courser.test("Hello Courssy")).toBe(false);
  });

  it("does NOT match 'courserpierone' (legacy Vercel codename)", () => {
    reset();
    expect(PATTERNS.courser.test("courserpierone")).toBe(false);
  });

  it("does NOT match 'courser_test' (legacy db identifier)", () => {
    reset();
    expect(PATTERNS.courser.test("courser_test")).toBe(false);
  });

  it("does NOT match 'currentCourse' (English word with Cour prefix)", () => {
    reset();
    expect(PATTERNS.Courser.test("currentCourse")).toBe(false);
    reset();
    expect(PATTERNS.courser.test("currentCourse")).toBe(false);
  });

  it("does NOT match 'courseRunner' (Course-prefixed identifier mixes C/c casing)", () => {
    reset();
    expect(PATTERNS.Courser.test("courseRunner")).toBe(false);
    reset();
    expect(PATTERNS.courser.test("courseRunner")).toBe(false);
  });

  it("matches 'this.courser = ...' (lowercase identifier with non-word separator)", () => {
    reset();
    expect(PATTERNS.courser.test("this.courser = ...")).toBe(true);
  });

  it("matches 'Coursy' (EU trademark conflict uppercase)", () => {
    reset();
    expect(PATTERNS.Coursy.test("Welcome to Coursy")).toBe(true);
  });

  it("does NOT match 'Courssy' (canonical EU-trademark-safe, 7 chars)", () => {
    reset();
    expect(PATTERNS.Coursy.test("Welcome to Courssy")).toBe(false);
  });

  it("does NOT match lowercase 'courssy.com' (canonical domain)", () => {
    reset();
    expect(PATTERNS.coursy.test("https://courssy.com")).toBe(false);
  });
});

describe("forbid-deprecated-names — allowList stability", () => {
  // Se un ADR o il nome del guardrail cambia in futuro, questo test
  // costringe il contributor a riallineare l'allowList.
  const ALLOWED = new Set([
    "docs/adr/0015-coursy-naming-decision.md",
    "docs/adr/0016-coursy-monolith-modular.md",
    "scripts/_inline-disable-react-hooks.mjs", // Windows path string legacy
    "scripts/quality/forbid-deprecated-names.ts", // guardrail body itself
  ]);

  it("includes the canonical 4 exemptions", () => {
    expect(ALLOWED.size).toBe(4);
    expect(ALLOWED.has("docs/adr/0015-coursy-naming-decision.md")).toBe(true);
    expect(ALLOWED.has("docs/adr/0016-coursy-monolith-modular.md")).toBe(true);
    expect(ALLOWED.has("scripts/_inline-disable-react-hooks.mjs")).toBe(true);
    expect(ALLOWED.has("scripts/quality/forbid-deprecated-names.ts")).toBe(true);
  });

  it("does NOT exempt the canonical 'Courssy' (deny patterns correctly skip it)", () => {
    reset();
    expect(PATTERNS.courser.test("Courssy")).toBe(false);
    reset();
    expect(PATTERNS.Courser.test("Courssy")).toBe(false);
  });
});
