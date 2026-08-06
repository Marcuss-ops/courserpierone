import { describe, it, expect } from "vitest";
import { isCuidShape } from "./ssot-identifier";

describe("isCuidShape compatibility helper", () => {
  it("recognizes a Prisma cuid-shaped internal product ID", () => {
    expect(isCuidShape("clxyz1234567890abcdefghij")).toBe(true);
  });

  it("does not classify normal public product slugs as internal IDs", () => {
    expect(isCuidShape("test-course")).toBe(false);
    expect(isCuidShape("2026-course")).toBe(false);
  });

  it("uses safe false defaults for missing values", () => {
    expect(isCuidShape("")).toBe(false);
    expect(isCuidShape(null)).toBe(false);
    expect(isCuidShape(undefined)).toBe(false);
  });
});
