#!/usr/bin/env tsx
/**
 * Hotspot Scorer (master plan §5).
 *
 * Per-file risk score combining 5 orthogonal signals:
 *
 *   Hotspot Score = freqModifiche
 *                 × complessita    (hand-rolled cyclomatic complexity)
 *                 × dimensione     (linee)
 *                 × nDipendenze    (madge --json transitive)
 *                 × nRegressioni   (git log --grep=fix count)
 *
 * Output: top-N files sorted by score, classified into the 2x2 matrix:
 *
 *   alta freq  + alta complessita   → refactor_obbligatorio (RED)
 *   bassa freq + alta complessita   → non_toccare          (YELLOW)
 *   alta freq  + bassa complessita  → manutenzione_ordinaria (BLUE)
 *   bassa freq + bassa complessita  → lasciare             (GRAY)
 *
 * Domain special-case: any file under src/domains/** that lands in
 * "refactor_obbligatorio" FAILS CI. The remaining src/** files are
 * informational (warn only).
 *
 * Thresholds: top 25% percentile of each metric = "high" (relative to
 * the current codebase state). Avoids drift as commit counts grow.
 *
 * Scope: src/ recursively (excludes .test.ts, .d.ts, node_modules).
 *
 * Per user spec, command:
 *   npm run check:hotspots
 *
 * Outputs:
 *   - stdout: ANSI-colored top-20 table + summary
 *   - hotspot-score.json: full ranked list (CI artifact)
 */

// ─── Imports ─────────────────────────────────────────────────────────────────
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { execSync } from "node:child_process";

const SCOPE = "src/";
const TOP_N = 20;
const P_HIGH = 0.75; // top 25% = high
const DOMAIN_PREFIX = `${SCOPE}domains/`;

// ─── Types ───────────────────────────────────────────────────────────────────

export type Quadrant =
  | "refactor_obbligatorio"
  | "non_toccare"
  | "manutenzione_ordinaria"
  | "lasciare";

export interface FileMetrics {
  file: string;
  freqModifiche: number;
  complessita: number;
  dimensione: number;
  nDipendenze: number;
  nRegressioni: number;
  score: number;
  isDomain: boolean;
  quadrant: Quadrant;
}

// ─── Pure helpers (exported for unit testing) ────────────────────────────────

export function computeScore(m: Omit<FileMetrics, "score" | "quadrant">): number {
  return m.freqModifiche * m.complessita * m.dimensione * m.nDipendenze * m.nRegressioni;
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx]!;
}

export function classify(
  freq: number,
  complessita: number,
  thresholds: { freqP75: number; compP75: number },
): Quadrant {
  const highFreq = freq >= thresholds.freqP75;
  const highComplexity = complessita >= thresholds.compP75;
  if (highFreq && highComplexity) return "refactor_obbligatorio";
  if (!highFreq && highComplexity) return "non_toccare";
  if (highFreq && !highComplexity) return "manutenzione_ordinaria";
  return "lasciare";
}

/**
 * Hand-rolled cyclomatic complexity counter.
 * Counts: if/for/while/case/catch keywords + &&, ||, ternary operators.
 * Strips comments + string literals first to avoid false positives.
 * Returns base 1 + each contribution (matches McCabe's original formula).
 */
export function countComplexity(content: string): number {
  const stripped = content
    .replace(/\/\*[\s\S]*?\*\//g, "") // block comments
    .replace(/\/\/[^\n]*/g, "") // line comments
    .replace(/(['"`])(?:\\.|(?!\1).)*\1/g, ""); // string literals
  let count = 1; // McCabe base
  const patterns: RegExp[] = [
    /\bif\b/g,
    /\bfor\b/g,
    /\bwhile\b/g,
    /\bcase\b/g,
    /\bcatch\b/g,
    /&&/g,
    /\|\|/g,
    /\?[^=:?]/g, // ternary (rough heuristic; excludes `?` in type annotations / optional chaining)
  ];
  for (const p of patterns) {
    const matches = stripped.match(p);
    if (matches) count += matches.length;
  }
  return count;
}

export function isCodeFile(name: string): boolean {
  if (!/\.(ts|tsx)$/.test(name)) return false;
  if (name.endsWith(".test.ts") || name.endsWith(".test.tsx")) return false;
  if (name.endsWith(".d.ts")) return false;
  return true;
}

export function isDomainFile(file: string): boolean {
  return file.replace(/\\/g, "/").includes(`/${DOMAIN_PREFIX}`);
}

// ─── IO: data collection ────────────────────────────────────────────────────

function* walk(dir: string): Generator<string> {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (isCodeFile(entry.name)) {
      yield full;
    }
  }
}

/** git log --name-only once → Map<file, commit count>. */
function getCommitCounts(): Map<string, number> {
  const counts = new Map<string, number>();
  try {
    const out = execSync(
      `git log --name-only --pretty=format: -- "${SCOPE}"`,
      { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] },
    );
    for (const line of out.split("\n")) {
      const f = line.trim();
      if (f) counts.set(f, (counts.get(f) ?? 0) + 1);
    }
  } catch {
    /* git unavailable → all zeros */
  }
  return counts;
}

/** git log --grep=fix → Map<file, fix-commit count>. */
function getFixCounts(): Map<string, number> {
  const counts = new Map<string, number>();
  try {
    const out = execSync(
      `git log --grep=fix --name-only --pretty=format: -- "${SCOPE}"`,
      { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] },
    );
    for (const line of out.split("\n")) {
      const f = line.trim();
      if (f) counts.set(f, (counts.get(f) ?? 0) + 1);
    }
  } catch {
    /* git unavailable */
  }
  return counts;
}

/** madge --json → Map<file, deps count>. */
function getMadgeDeps(): Map<string, number> {
  const deps = new Map<string, number>();
  try {
    const out = execSync(
      `npx --no-install madge --json --ts-config ./tsconfig.json --extensions ts,tsx "${SCOPE}" 2>/dev/null`,
      { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 32 * 1024 * 1024 },
    );
    const parsed: Record<string, string[]> = JSON.parse(out);
    for (const [file, depList] of Object.entries(parsed)) {
      deps.set(file, depList.length);
    }
  } catch {
    /* madge unavailable → all zeros */
  }
  return deps;
}

// ─── Output ──────────────────────────────────────────────────────────────────

const COLORS = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  gray: "\x1b[90m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
};

const QUADRANT_COLOR: Record<Quadrant, string> = {
  refactor_obbligatorio: COLORS.red,
  non_toccare: COLORS.yellow,
  manutenzione_ordinaria: COLORS.blue,
  lasciare: COLORS.gray,
};

function printTable(rows: FileMetrics[]): void {
  if (rows.length === 0) {
    console.log("(no files matched the scope)");
    return;
  }
  const header = ["RANK", "FILE", "SCORE", "FREQ", "COMP", "SIZE", "DEPS", "FIX", "TYPE"];
  const widths = [4, 60, 12, 5, 5, 6, 5, 4, 9];
  const fmtRow = (cells: string[]) =>
    cells.map((c, i) => c.padEnd(widths[i]!)).join(" ");
  console.log(COLORS.bold + fmtRow(header) + COLORS.reset);
  console.log(COLORS.dim + fmtRow(widths.map(w => "-".repeat(w))) + COLORS.reset);
  rows.forEach((r, i) => {
    const shortFile = r.file.length > 58 ? `...${r.file.slice(-57)}` : r.file;
    const cells = [
      String(i + 1),
      shortFile,
      r.score.toLocaleString(),
      String(r.freqModifiche),
      String(r.complessita),
      String(r.dimensione),
      String(r.nDipendenze),
      String(r.nRegressioni),
      r.isDomain ? "DOMAIN" : "—",
    ];
    const color = QUADRANT_COLOR[r.quadrant];
    console.log(color + fmtRow(cells) + `  ${r.quadrant}` + COLORS.reset);
  });
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main(): void {
  const commits = getCommitCounts();
  const fixes = getFixCounts();
  const deps = getMadgeDeps();

  const files = [...walk(SCOPE)].sort();
  const all: FileMetrics[] = files.map(file => {
    const content = fs.readFileSync(file, "utf-8");
    const dimensione = content.split("\n").length;
    const complessita = countComplexity(content);
    const freqModifiche = commits.get(file) ?? 0;
    const nRegressioni = fixes.get(file) ?? 0;
    const nDipendenze = deps.get(file) ?? 0;
    const isDomain = isDomainFile(file);
    const partial: Omit<FileMetrics, "score" | "quadrant"> = {
      file,
      freqModifiche,
      complessita,
      dimensione,
      nDipendenze,
      nRegressioni,
      isDomain,
    };
    const score = computeScore(partial);
    const thresholds = {
      freqP75: 0,
      compP75: 0,
    };
    return {
      ...partial,
      score,
      quadrant: classify(freqModifiche, complessita, thresholds), // patched below
    };
  });

  // Compute percentiles from the full population, then reclassify.
  const freqP75 = percentile(all.map(m => m.freqModifiche), P_HIGH);
  const compP75 = percentile(all.map(m => m.complessita), P_HIGH);
  for (const m of all) {
    m.quadrant = classify(m.freqModifiche, m.complessita, { freqP75, compP75 });
  }

  // Sort + top N
  const sorted = [...all].sort((a, b) => b.score - a.score);
  const top = sorted.slice(0, TOP_N);

  // stdout table
  console.log(
    `\n${COLORS.bold}Hotspot Scorer — top ${TOP_N} files${COLORS.reset}` +
      ` (freqP75=${freqP75}, compP75=${compP75})\n`,
  );
  printTable(top);

  // JSON artifact (for CI upload)
  // Write to tmp/hotspots/ to avoid polluting git status + allow per-run timestamps.
  fs.mkdirSync("tmp/hotspots", { recursive: true });
  fs.writeFileSync("tmp/hotspots/hotspot-score.json", JSON.stringify(sorted, null, 2));
  console.log(
    `\n${COLORS.dim}Full ranked list (${sorted.length} files) → hotspot-score.json${COLORS.reset}`,
  );

  // Summary
  const counts: Record<Quadrant, number> = {
    refactor_obbligatorio: 0,
    non_toccare: 0,
    manutenzione_ordinaria: 0,
    lasciare: 0,
  };
  for (const m of sorted) {
    counts[m.quadrant]++;
  }
  console.log(
    `\nMatrix summary: refactor=${counts.refactor_obbligatorio} non_toccare=${counts.non_toccare} ` +
      `manutenzione=${counts.manutenzione_ordinaria} lasciare=${counts.lasciare}`,
  );

  // CI gate: per master plan §5 + user spec ("severe rules anche se basso score")
  // Domain files are FAIL-CLOSED in any non-lasciare quadrant:
  //   - refactor_obbligatorio: high freq + high complexity
  //   - non_toccare:           low freq + high complexity (inherently risky)
  //   - manutenzione_ordinaria: high freq + low complexity (only WARN)
  //   - lasciare:              low freq + low complexity (pass)
  // Non-domain files are always informational (warn only).
  const DOMAIN_BLOCK_QUADRANTS: Quadrant[] = ["refactor_obbligatorio", "non_toccare"];
  const domainViolators = sorted.filter(
    m => m.isDomain && DOMAIN_BLOCK_QUADRANTS.includes(m.quadrant),
  );
  const domainWarnings = sorted.filter(
    m => m.isDomain && m.quadrant === "manutenzione_ordinaria",
  );
  if (domainViolators.length > 0) {
    const list = domainViolators
      .map(m => `  - ${m.file} (${m.quadrant}, score=${m.score})`)
      .join("\n");
    console.error(
      `\n${COLORS.red}✗ Domain file(s) in block-on-domain quadrants: ${domainViolators.length}${COLORS.reset}\n${list}\n` +
        `  Per master plan §5: refactor these files before merging.\n` +
        `  Block-on-domain quadrants: ${DOMAIN_BLOCK_QUADRANTS.join(", ")}`,
    );
    if (process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true") {
      process.exit(1);
    }
  }
  if (domainWarnings.length > 0) {
    const list = domainWarnings
      .map(m => `  - ${m.file} (manutenzione_ordinaria, score=${m.score})`)
      .join("\n");
    console.warn(
      `\n${COLORS.yellow}⚠ Domain file(s) in 'manutenzione_ordinaria' (warn-only): ${domainWarnings.length}${COLORS.reset}\n${list}`,
    );
  }
}

// Guard main() so module imports (e.g., vitest importing pure helpers)
// don't trigger the IO side effects (git log, madge, fs.walk, JSON write).
// When tsx runs the script directly, process.argv[1] equals this file's URL.
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  main();
}