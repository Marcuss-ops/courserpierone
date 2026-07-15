/**
 * Contrast text color for accent backgrounds.
 *
 * Production feedback (2026-07-15): the previous CTA implementation
 * hardcoded `color: "#0a0a0a"` (near-black) on every accent background.
 * That worked for light/medium accents (e.g. `#C9840D` amber → 6.8:1)
 * but FAILED for dark accents (e.g. `#1E40AF` blue → black gives 2.4:1,
 * below the WCAG AA 4.5:1 threshold — text was unreadable). White on the
 * same blue gives 8.7:1. The hardcoded value was always suboptimal;
 * the right text color depends on the accent's luminance.
 *
 * This module centralises the choice using **WCAG 2.1 relative
 * luminance** (the standard accessibility formula) and returns either
 * `#000000` or `#ffffff` based on which has the higher contrast ratio
 * against the input. The picked color is guaranteed to be >= 4.5:1
 * for any parseable hex input (mathematical property: for any color,
 * at least one of black/white is above the threshold).
 *
 * References:
 *   - WCAG 2.1 §1.4.3 (Contrast Minimum)
 *   - https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */

const BLACK = "#000000";
const WHITE = "#ffffff";

/** Strip a leading `#` and normalise to lowercase. */
function stripHash(input: string): string {
  return input.trim().toLowerCase().replace(/^#/, "");
}

/**
 * Parse a 3- or 6-digit hex color into RGB channels (0-255).
 * Returns `null` on invalid input so callers can fall back gracefully.
 */
export function parseHexColor(
  color: string,
): { r: number; g: number; b: number } | null {
  if (typeof color !== "string") return null;
  const raw = stripHash(color);
  let hex: string;
  if (raw.length === 3) {
    // Expand `#fff` → `#ffffff`
    hex = raw
      .split("")
      .map((c) => c + c)
      .join("");
  } else if (raw.length === 6) {
    hex = raw;
  } else if (raw.length === 8) {
    // Strip alpha channel (we don't need it for text-color decisions)
    hex = raw.slice(0, 6);
  } else {
    return null;
  }
  if (!/^[0-9a-f]{6}$/.test(hex)) return null;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
  return { r, g, b };
}

/**
 * Convert an 8-bit sRGB channel to its linear value (WCAG 2.1).
 *
 *   c_lin = c/12.92                       if c/255 <= 0.03928
 *   c_lin = ((c/255 + 0.055) / 1.055)^2.4 otherwise
 */
function srgbToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * WCAG 2.1 relative luminance for a color.
 *
 *   L = 0.2126 * R_lin + 0.7152 * G_lin + 0.0722 * B_lin
 */
export function relativeLuminance(color: string): number | null {
  const rgb = parseHexColor(color);
  if (!rgb) return null;
  const r = srgbToLinear(rgb.r);
  const g = srgbToLinear(rgb.g);
  const b = srgbToLinear(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * WCAG 2.1 contrast ratio between two colors.
 * Returns a number in [1, 21]. `null` if either color is invalid.
 */
export function contrastRatio(a: string, b: string): number | null {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  if (la === null || lb === null) return null;
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Pick black or white text for a given accent background.
 *
 * Returns whichever (black or white) has the **higher contrast ratio**
 * against `accentColor`. Falls back to black for unparseable input
 * (matches the previous hardcoded behaviour, so a regression in
 * upstream data doesn't break the CTA).
 *
 * @example
 *   getContrastTextColor("#C9840D") // → "#000000" (amber, dark enough)
 *   getContrastTextColor("#FFFFFF") // → "#000000" (pure white, white text would vanish)
 *   getContrastTextColor("#0A0A0A") // → "#ffffff" (near-black, black text would vanish)
 *   getContrastTextColor("not-a-color") // → "#000000" (graceful fallback)
 */
export function getContrastTextColor(accentColor: string): string {
  const blackRatio = contrastRatio(accentColor, BLACK);
  const whiteRatio = contrastRatio(accentColor, WHITE);
  // If we can't parse the input, fall back to the previous hardcoded value
  if (blackRatio === null || whiteRatio === null) return BLACK;
  return blackRatio >= whiteRatio ? BLACK : WHITE;
}
