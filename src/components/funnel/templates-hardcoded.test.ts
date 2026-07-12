import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// ─── Configuration ─────────────────────────────────────────
const TEMPLATES_DIR = __dirname;

/** Recursively collect all .tsx files under funnel/ (excludes this test file). */
function findTsxFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findTsxFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".tsx")) {
      results.push(fullPath);
    }
  }
  return results;
}

const TEMPLATE_FILES = findTsxFiles(TEMPLATES_DIR)
  .map((f) => path.relative(TEMPLATES_DIR, f))
  .filter((f) => f !== path.basename(__filename))
  .sort();

/**
 * Italian strings that should ONLY appear as fallbacks
 * (after `||` or inside `t("key", "fallback")`) with a
 * localeContent reference (`lc?.` or `t(`) on the same line
 * before the string.
 *
 * Each entry is a case-sensitive fragment to search for.
 * Only non-empty strings that visibly render on the page
 * are included — NOT CSS class names or build comments.
 */
const ITALIAN_STRINGS: string[] = [
  // ---- CTA / Offering ----
  '"Acquista Ora"',
  '"Inizia Ora"',
  '"Inizia Oggi"',
  '"Inizia Gratis"',
  '"Offerta speciale di lancio"',
  '"Offerta speciale"',
  '"Prezzo speciale di lancio"',

  // ---- Section badges ----
  '"Il Problema"',
  '"La Nostra Storia"',
  '"Testimonianze"',
  '"Cosa Imparerai"',
  '"Lezioni del Corso"',
  '"Cover del Prodotto"',

  // ---- Testimonial fallbacks ----
  '"Nome Cliente"',
  '"Ruolo, Azienda"',

  // ---- Pricing tier ----
  '"Per iniziare"',

  // ---- UI labels (EN-origin fallbacks) ----
  '"Privacy"',
  '"Terms"',
  '"Contact"',
  '"All rights reserved."',
  '"Tutti i diritti riservati."',

  // ---- Template demo text ----
  '"La storia del prodotto"',
  '"Titolo del Prodotto"',
  '"Titolo del tuo prodotto"',
  '"Sottotitolo che introduce il valore del prodotto in modo elegante e diretto."',
  '"Sottotitolo che descrive il valore del prodotto in modo chiaro e diretto."',
  '"Sottotitolo che descrive il valore del prodotto in modo chiaro."',
];

/**
 * These patterns are LINES that are known to contain Italian text
 * WITHOUT localeContent protection. They appear as safety-net
 * fallbacks for `data.xxx ?? "Italian"` — only visible when
 * product data from the DB is completely missing.
 *
 * These are allowed but should be flagged as a warning.
 * We track them separately and only warn (not fail).
 */
const ALLOWED_FALLBACK_PATTERNS: string[] = [
  // Single-line data.xxx ?? fallbacks
  'data.titolo ?? "Titolo del',
  'data.sottotitolo ?? "Sottotitolo',
  'split("\\n")[0] ?? "La storia del prodotto"',
  // Multi-line fallbacks — locale ref (lc?. / data.xxx ??) is on preceding line(s)
  '"Sottotitolo che introduce il valore del prodotto in modo elegante',
  '"Sottotitolo che descrive il valore del prodotto in modo chiaro',
  '"Acquista Ora"}',       // HorizonPricing: lc?.ui?.labels?.buy_now on prev line
  '"All rights reserved."', // horizon/index.tsx SharedFooter: lc?. refs on prev lines
  'placeholderLabel || "Cover del Prodotto"', // SharedStory: wrappers pass locale-aware prop
];

// ─── Helpers ────────────────────────────────────────────────

/**
 * Check if a line has a localeContent reference (`lc?.`, `data.localeContent?.`,
 * or `t(`) BEFORE the given position.
 */
function hasLocaleRefBefore(line: string, position: number): boolean {
  const before = line.slice(0, position);
  return before.includes('lc?.') || before.includes('data.localeContent?.') || before.includes('t(');
}

/** Check if a line has a `||` operator before the given position. */
function hasOrBefore(line: string, position: number): boolean {
  const before = line.slice(0, position);
  return before.includes('||');
}

/** Check if the line is a comment line. */
function isCommentLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*");
}

/** Check if a line is inside a `<style jsx>` block. */
function isInsideStyleBlock(lines: string[], currentIndex: number): boolean {
  for (let i = currentIndex - 1; i >= Math.max(0, currentIndex - 10); i--) {
    if (lines[i].includes("<style")) return true;
    if (lines[i].includes("</style")) return false;
  }
  return false;
}

// ─── Test ───────────────────────────────────────────────────

describe("Funnel templates — no hardcoded Italian strings", () => {
  for (const file of TEMPLATE_FILES) {
    const filePath = path.join(TEMPLATES_DIR, file);

    it(`${file} has no unprotected Italian strings`, () => {
      if (!fs.existsSync(filePath)) {
        expect(true).toBe(true);
        return;
      }

      const content = fs.readFileSync(filePath, "utf-8");
      const lines = content.split("\n");
      const violations: { line: number; text: string; detail: string }[] = [];
      const warnings: { line: number; text: string; detail: string }[] = [];

      let insideFallbackLabels = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNum = i + 1;

        // Track FALLBACK_LABELS block (book-claude only — last-resort fallback,
        // all values are accessed through the t() function)
        if (line.includes("FALLBACK_LABELS") && line.includes("{")) {
          insideFallbackLabels = true;
        }
        if (insideFallbackLabels && line.trim().startsWith("}")) {
          insideFallbackLabels = false;
        }
        if (insideFallbackLabels) continue;

        // Skip comments, empty lines, and style blocks
        if (isCommentLine(line)) continue;
        if (line.trim() === "") continue;
        if (isInsideStyleBlock(lines, i)) continue;

        // Check each known Italian string
        for (const italianStr of ITALIAN_STRINGS) {
          const pos = line.indexOf(italianStr);
          if (pos === -1) continue;

          // Skip if this is an ALLOWED pattern (data.xxx ?? "Italian" safety net)
          const isAllowed = ALLOWED_FALLBACK_PATTERNS.some((p) => line.includes(p));
          if (isAllowed) {
            warnings.push({
              line: lineNum,
              text: italianStr,
              detail: "Prodotto `data` fallback — OK (mostra solo se DB è vuoto)",
            });
            continue;
          }

          // Check if there's a localeContent reference BEFORE the Italian string
          if (!hasLocaleRefBefore(line, pos)) {
            violations.push({
              line: lineNum,
              text: italianStr,
              detail: hasOrBefore(line, pos)
                ? "`||` fallback ma senza `lc?.` o `t(` nella stessa espressione"
                : "Nessun riferimento a localeContent (lc?. / t() )",
            });
          }
        }
      }

      // Print warnings
      if (warnings.length > 0) {
        console.log(`\n⚠️  ${file} — ${warnings.length} fallback dati prodotto (warning):`);
        for (const w of warnings) {
          console.log(`   Riga ${w.line}: ${w.text.trim()} — ${w.detail}`);
        }
      }

      // Fail on violations
      if (violations.length > 0) {
        let msg = `\n❌ ${file} — ${violations.length} stringa/e italiana/e NON protetta/e da localeContent:\n`;
        for (const v of violations) {
          msg += `   Riga ${v.line}: ${v.text.trim()} — ${v.detail}\n`;
        }
        expect(violations, msg).toEqual([]);
      }
    });
  }
});
