import { describe, expect, it } from "vitest";
import { QUALITY_GATES, QUALITY_SUITES, getQualitySuite } from "./quality-gates";

describe("quality-gate registry", () => {
  it("defines non-empty suites", () => {
    for (const tasks of Object.values(QUALITY_GATES)) expect(tasks.length).toBeGreaterThan(0);
  });

  it("makes check:full a strict superset of check", () => {
    const check = new Set(QUALITY_SUITES.check);
    const full = new Set(QUALITY_SUITES.full);
    for (const task of check) expect(full.has(task)).toBe(true);
    expect(full.size).toBeGreaterThan(check.size);
  });

  it("rejects unknown suite names", () => {
    expect(() => getQualitySuite("missing")).toThrow(/Unknown quality suite/);
  });
});
