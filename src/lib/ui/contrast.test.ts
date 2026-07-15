import { describe, it, expect } from "vitest";
import {
  parseHexColor,
  relativeLuminance,
  contrastRatio,
  getContrastTextColor,
} from "./contrast";

describe("parseHexColor", () => {
  it("parses 6-digit hex with hash", () => {
    expect(parseHexColor("#FFC882")).toEqual({ r: 255, g: 200, b: 130 });
    expect(parseHexColor("#C9840D")).toEqual({ r: 201, g: 132, b: 13 });
  });

  it("parses 6-digit hex without hash", () => {
    expect(parseHexColor("FFC882")).toEqual({ r: 255, g: 200, b: 130 });
  });

  it("parses 3-digit hex (expanded)", () => {
    expect(parseHexColor("#fff")).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseHexColor("#000")).toEqual({ r: 0, g: 0, b: 0 });
    expect(parseHexColor("#abc")).toEqual({ r: 170, g: 187, b: 204 });
  });

  it("strips alpha channel from 8-digit hex", () => {
    expect(parseHexColor("#FFC88280")).toEqual({ r: 255, g: 200, b: 130 });
  });

  it("normalises uppercase to lowercase", () => {
    expect(parseHexColor("#FFc882")).toEqual({ r: 255, g: 200, b: 130 });
  });

  it("trims whitespace", () => {
    expect(parseHexColor("  #FFC882  ")).toEqual({ r: 255, g: 200, b: 130 });
  });

  it("returns null for invalid input", () => {
    expect(parseHexColor("not-a-color")).toBeNull();
    expect(parseHexColor("")).toBeNull();
    expect(parseHexColor("#GGG")).toBeNull();
    expect(parseHexColor("#12345")).toBeNull(); // 5 chars
    expect(parseHexColor("#1234567")).toBeNull(); // 7 chars
  });

  it("returns null for non-string input", () => {
    // @ts-expect-error testing runtime guard
    expect(parseHexColor(null)).toBeNull();
    // @ts-expect-error testing runtime guard
    expect(parseHexColor(undefined)).toBeNull();
    // @ts-expect-error testing runtime guard
    expect(parseHexColor(0xffc882)).toBeNull();
  });
});

describe("relativeLuminance", () => {
  it("returns 0 for pure black", () => {
    expect(relativeLuminance("#000000")).toBe(0);
  });

  it("returns 1 for pure white", () => {
    expect(relativeLuminance("#FFFFFF")).toBeCloseTo(1, 5);
  });

  it("returns null for invalid input", () => {
    expect(relativeLuminance("not-a-color")).toBeNull();
  });

  it("computes correct luminance for known colors", () => {
    // Reference values from the WCAG 2.1 spec
    // https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
    // #808080 → 0.2159 (mid-grey)
    expect(relativeLuminance("#808080")).toBeCloseTo(0.2159, 3);
    // #FF0000 → 0.2126
    expect(relativeLuminance("#FF0000")).toBeCloseTo(0.2126, 3);
  });
});

describe("contrastRatio", () => {
  it("returns 21 for pure black vs pure white", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 0);
  });

  it("returns 1 for same color", () => {
    expect(contrastRatio("#C9840D", "#C9840D")).toBeCloseTo(1, 5);
  });

  it("returns null if either color is invalid", () => {
    expect(contrastRatio("invalid", "#FFFFFF")).toBeNull();
    expect(contrastRatio("#000000", "invalid")).toBeNull();
  });

  it("is symmetric (order doesn't matter)", () => {
    const a = contrastRatio("#FFC882", "#000000");
    const b = contrastRatio("#000000", "#FFC882");
    expect(a).toBe(b);
  });
});

describe("getContrastTextColor", () => {
  it("returns black on a dark amber accent", () => {
    // #C9840D → amber, mid-dark. Black has ~6.82 ratio, white has ~3.08.
    expect(getContrastTextColor("#C9840D")).toBe("#000000");
  });

  it("returns black on light peach gold", () => {
    // #FFC882 → light. Black has ~13.9 ratio, white has ~1.51.
    expect(getContrastTextColor("#FFC882")).toBe("#000000");
  });

  it("returns white on near-black backgrounds", () => {
    expect(getContrastTextColor("#0A0A0A")).toBe("#ffffff");
    expect(getContrastTextColor("#1A1A2E")).toBe("#ffffff");
  });

  it("returns black on pure white (vanishing white text)", () => {
    expect(getContrastTextColor("#FFFFFF")).toBe("#000000");
  });

  it("returns white on pure black (vanishing black text)", () => {
    expect(getContrastTextColor("#000000")).toBe("#ffffff");
  });

  it("falls back to black on unparseable input", () => {
    // Matches previous hardcoded behaviour so a bad accent doesn't
    // break the CTA downstream.
    expect(getContrastTextColor("not-a-color")).toBe("#000000");
    expect(getContrastTextColor("")).toBe("#000000");
  });

  it("handles real production accent colors", () => {
    // Course accent presets from the codebase. These expectations are
    // derived from the WCAG 2.1 contrast ratios below — not from visual
    // brightness. WCAG weights green (0.7152) much higher than red
    // (0.2126), so colors that LOOK mid-bright (red, green, purple)
    // can still have higher black contrast than white.
    //
    // #C9840D amber: black 6.82 vs white 3.08 → black
    expect(getContrastTextColor("#C9840D")).toBe("#000000");
    // #E63946 red:   black 5.03 vs white 4.18 → black
    expect(getContrastTextColor("#E63946")).toBe("#000000");
    // #06B6D4 cyan:  black 8.76 vs white 2.40 → black
    expect(getContrastTextColor("#06B6D4")).toBe("#000000");
    // #1E40AF blue:  black 2.43 vs white 8.65 → white
    expect(getContrastTextColor("#1E40AF")).toBe("#ffffff");
    // #16A34A green: black 6.44 vs white 3.26 → black
    expect(getContrastTextColor("#16A34A")).toBe("#000000");
    // #A855F7 purple: black 5.32 vs white 3.95 → black
    expect(getContrastTextColor("#A855F7")).toBe("#000000");
  });

  it("handles 3-digit hex shorthand", () => {
    expect(getContrastTextColor("#fff")).toBe("#000000");
    expect(getContrastTextColor("#000")).toBe("#ffffff");
  });

  it("handles alpha channel (8-digit hex)", () => {
    // Same as #FFC882, alpha is ignored
    expect(getContrastTextColor("#FFC88280")).toBe("#000000");
  });

  it("produces WCAG AA contrast (>= 4.5:1) for real production colors", () => {
    // WCAG 2.1 §1.4.3 requires at least 4.5:1 for normal text. The
    // helper MUST pick the higher-contrast option (black or white) so
    // the chosen text is always above the threshold. This is a more
    // durable invariant than the hardcoded color→text expectations
    // above — if the algorithm regresses, this catches it regardless
    // of which text color the algorithm picks.
    const accents = [
      "#C9840D", // amber
      "#E63946", // red
      "#06B6D4", // cyan
      "#1E40AF", // blue
      "#16A34A", // green
      "#A855F7", // purple
      "#FFC882", // peach gold (the case the user reported)
      "#0A0A0A", // near-black
      "#FFFFFF", // pure white
      "#000000", // pure black
    ];
    for (const accent of accents) {
      const text = getContrastTextColor(accent);
      const ratio = contrastRatio(accent, text);
      expect(ratio, `accent ${accent} (text ${text})`).toBeGreaterThanOrEqual(
        4.5,
      );
    }
  });
});
