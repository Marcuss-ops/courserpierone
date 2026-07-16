/**
 * Hotspot Scorer — unit tests.
 *
 * Covers pure functions exported from scripts/quality/hotspot-score.ts:
 *   - computeScore (multiplicative formula)
 *   - percentile (sorted index)
 *   - classify (4 quadrants)
 *   - countComplexity (regex counter; base 1 + contributions)
 *   - isCodeFile / isDomainFile
 *
 * Does NOT exercise the IO functions (git log, madge, fs.walk) — those
 * are covered by integration via the script's own execution on the real
 * codebase. The pure logic is what we want to lock with assertions.
 */

import { describe, expect, it } from "vitest";

import {
  classify,
  computeScore,
  countComplexity,
  isCodeFile,
  isDomainFile,
  percentile,
} from "./hotspot-score";

describe("computeScore", () => {
  it("multiplies all 5 signals", () => {
    const score = computeScore({
      file: "x.ts",
      freqModifiche: 2,
      complessita: 5,
      dimensione: 100,
      nDipendenze: 3,
      nRegressioni: 1,
      isDomain: false,
    });
    expect(score).toBe(2 * 5 * 100 * 3 * 1);
  });

  it("returns 0 when any signal is 0 (zero-regression files score 0)", () => {
    const score = computeScore({
      file: "x.ts",
      freqModifiche: 10,
      complessita: 20,
      dimensione: 500,
      nDipendenze: 8,
      nRegressioni: 0,
      isDomain: false,
    });
    expect(score).toBe(0);
  });
});

describe("percentile", () => {
  it("returns 0 for empty input", () => {
    expect(percentile([], 0.75)).toBe(0);
  });

  it("returns the value at the percentile index after sorting", () => {
    expect(percentile([10, 20, 30, 40, 50], 0.5)).toBe(30);
  });

  it("clamps to the last element when p exceeds 1", () => {
    expect(percentile([1, 2, 3], 0.99)).toBe(3);
  });

  it("returns the only element for single-item arrays", () => {
    expect(percentile([42], 0.75)).toBe(42);
  });
});

describe("classify", () => {
  const thresholds = { freqP75: 10, compP75: 15 };

  it("alta freq + alta complessità → refactor_obbligatorio", () => {
    expect(classify(15, 20, thresholds)).toBe("refactor_obbligatorio");
  });

  it("bassa freq + alta complessità → non_toccare", () => {
    expect(classify(5, 20, thresholds)).toBe("non_toccare");
  });

  it("alta freq + bassa complessità → manutenzione_ordinaria", () => {
    expect(classify(15, 5, thresholds)).toBe("manutenzione_ordinaria");
  });

  it("bassa freq + bassa complessità → lasciare", () => {
    expect(classify(5, 5, thresholds)).toBe("lasciare");
  });

  it("boundary: equal to threshold counts as high", () => {
    expect(classify(10, 15, thresholds)).toBe("refactor_obbligatorio");
  });
});

describe("countComplexity", () => {
  it("returns base 1 for empty code", () => {
    expect(countComplexity("")).toBe(1);
  });

  it("counts each if/for/while/case/catch keyword", () => {
    const code = `
      if (a) { x(); }
      for (let i = 0; i < n; i++) { y(); }
      while (true) { break; }
      switch (v) { case 1: a(); break; case 2: b(); break; }
      try { c(); } catch (e) { d(); }
    `;
    // base 1 + if(1) + for(1) + while(1) + case(2) + catch(1) = 7
    expect(countComplexity(code)).toBe(7);
  });

  it("counts && and || as branches", () => {
    const code = `if (a && b || c) { x(); }`;
    // base 1 + if(1) + &&(1) + ||(1) = 4
    expect(countComplexity(code)).toBe(4);
  });

  it("strips comments and string literals before counting", () => {
    const code = `
      // if (fake) { ignore me }
      const msg = "if (fake) { ignore me too }";
      if (real) { x(); }
    `;
    // base 1 + if(real) = 2
    expect(countComplexity(code)).toBe(2);
  });

  it("handles ternary operators", () => {
    const code = `const x = a ? b : c;`;
    // base 1 + ternary(1) = 2
    expect(countComplexity(code)).toBe(2);
  });
});

describe("isCodeFile", () => {
  it("accepts .ts and .tsx", () => {
    expect(isCodeFile("foo.ts")).toBe(true);
    expect(isCodeFile("foo.tsx")).toBe(true);
  });

  it("rejects test files and .d.ts", () => {
    expect(isCodeFile("foo.test.ts")).toBe(false);
    expect(isCodeFile("foo.test.tsx")).toBe(false);
    expect(isCodeFile("foo.d.ts")).toBe(false);
  });

  it("rejects non-TypeScript extensions", () => {
    expect(isCodeFile("foo.js")).toBe(false);
    expect(isCodeFile("foo.md")).toBe(false);
    expect(isCodeFile("foo.json")).toBe(false);
  });
});

describe("isDomainFile", () => {
  it("matches files under src/domains/", () => {
    expect(isDomainFile("src/domains/feed/feed-types.ts")).toBe(true);
    expect(isDomainFile("src\\domains\\feed\\feed-types.ts")).toBe(true); // Windows path
  });

  it("does not match files outside src/domains/", () => {
    expect(isDomainFile("src/lib/foo.ts")).toBe(false);
    expect(isDomainFile("src/components/bar.tsx")).toBe(false);
    expect(isDomainFile("src/app/api/route.ts")).toBe(false);
  });

  it("does not match a file named 'domains.ts' at the root", () => {
    expect(isDomainFile("src/domains.ts")).toBe(false);
  });
});