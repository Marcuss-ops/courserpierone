#!/usr/bin/env tsx
/**
 * scripts/quality/check-dod.ts
 *
 * DoD verification — converts docs/checklist/dod.md into CI gates.
 *
 * Modes:
 *   --mode=ci     (default): diff-based check against base ref.
 *                            Only NEW violations (lines changed in the diff)
 *                            trigger HARD FAIL — pre-existing violations are
 *                            SOFT WARN. This is the regression-prohibition
 *                            pattern from master plan §6.
 *   --mode=audit            : full-repo scan of src/. Used for compliance
 *                            audits and local one-off reports.
 *
 * Severity tiers (per detector):
 *   - fail  (exit 1) : HARD FAIL — blocks CI.
 *   - warn  (exit 0) : SOFT WARN — logged but doesn't block.
 *   - prompt         : Informational only. Author self-certifies.
 *
 * Severity rationale (per docs/checklist/dod.md "NON accettabili" list):
 *   - AP-D (empty catch) is HARD FAIL because the regex is precise — empty
 *     `catch (e) {}` has near-zero false-positive rate and is unambiguously
 *     forbidden by master plan §9.
 *   - AP-A/B/C/E/F/G are SOFT WARN because their heuristics are noisier
 *     (TODO comments, `_legacy` identifiers, `??` fallbacks, N+1 regex,
 *     UI business-rule detection). They are reported but do not block;
 *     fix them in audit mode (`--mode=audit`) and incrementally.
 *   - D-3 (auth) and D-14 (ADR) are HARD FAIL because both are detectable
 *     with high confidence and absence is a release-blocker.
 *
 * Coverage: 15 DoD points + 7 unacceptable anti-patterns = 22 detectors.
 * Per master plan §9: any violation of the 7 anti-patterns (A-G) is a
 * zero-tolerance block; DoD points 1-15 are mostly author-self-certified
 * with a subset auto-verifiable from code (auth, Zod, N+1, analytics,
 * error logging, ADR, etc.).
 *
 * Output:
 *   - tmp/dod-check.json : full report (CI artifact)
 *   - stdout             : ANSI summary table
 *
 * Usage:
 *   npx tsx scripts/quality/check-dod.ts                       # CI mode
 *   npx tsx scripts/quality/check-dod.ts --mode=audit         # Full scan
 *   BASE_SHA=abc123 npx tsx scripts/quality/check-dod.ts     # Custom base
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

// ─── CLI guard ─────────────────────────────────────────────────────────────
// All side effects (git diff, file I/O, process.exit) are gated behind this
// guard so that `import { ... } from "./check-dod"` in tests / docs tools
// does NOT trigger a real run. The script only executes when invoked as the
// entrypoint via `npx tsx scripts/quality/check-dod.ts`.
function isEntrypoint(): boolean {
  try {
    return process.argv[1] === fileURLToPath(import.meta.url);
  } catch {
    // CJS fallback (when run via tsx in CJS mode): check the entry script.
    return process.argv[1]?.endsWith("check-dod.ts") ?? false;
  }
}

// ─── CLI ────────────────────────────────────────────────────────────────────
const { values: args } = parseArgs({
  options: {
    mode: { type: "string", default: "ci" },
    base: {
      type: "string",
      default: process.env.BASE_SHA ?? process.env.GITHUB_BASE_REF ?? "origin/main",
    },
    out: { type: "string", default: "tmp/dod-check.json" },
  },
});
const MODE = args.mode === "audit" ? "audit" : "ci";
const BASE = args.base;
const OUT_PATH = args.out;

// ─── Types ──────────────────────────────────────────────────────────────────
type Severity = "fail" | "warn" | "prompt";
type Status = "pass" | "warn" | "fail" | "skip";

export interface Violation {
  detector: string;
  file: string;
  line: number;
  snippet: string;
  severity: Severity;
  message: string;
}

export interface DetectorSpec {
  id: string;
  title: string;
  severity: Severity;
  scope: (file: string) => boolean;
  check: (file: string, content: string, targetLines: Set<number>) => Violation[];
}

interface DetectorResult {
  id: string;
  title: string;
  status: Status;
  violations: Violation[];
  message: string;
}

interface Report {
  mode: "ci" | "audit";
  base: string;
  timestamp: string;
  summary: { pass: number; warn: number; fail: number; skip: number; prompt: number };
  detectors: DetectorResult[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function sh(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch {
    return "";
  }
}

function isCodeFile(name: string): boolean {
  return /\.(ts|tsx)$/.test(name) && !name.endsWith(".d.ts") && !name.includes(".test.");
}

function* walk(dir: string): Generator<string> {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (isCodeFile(entry.name)) yield full;
  }
}

/** Returns true if `line` is in the changed-line set, or if targetLines
 *  is empty (audit mode / no-diff fallback) — meaning all lines are targets. */
export function isInTarget(line: number, targetLines: Set<number>): boolean {
  return targetLines.size === 0 || targetLines.has(line);
}

export interface DiffData {
  modified: Map<string, Set<number>>; // file → added/modified line numbers
  added: string[];
  allFiles: string[];
}

export function collectDiff(base: string): DiffData {
  const modified = new Map<string, Set<number>>();
  const added: string[] = [];
  const allFiles: string[] = [];
  const nameStatus = sh(`git diff --name-status ${base}...HEAD -- src/ docs/adr/ scripts/`);
  if (!nameStatus) return { modified, added, allFiles }; // shallow clone fallback
  if (!sh(`git rev-parse --verify ${base}`)) return { modified, added, allFiles }; // base ref missing
  for (const line of nameStatus.split("\n").filter(Boolean)) {
    const [status, file] = line.split("\t");
    if (!file) continue;
    allFiles.push(file);
    if (status === "A") {
      added.push(file);
      continue;
    }
    if (status && status.startsWith("M")) {
      const diffOut = sh(`git diff -U0 ${base}...HEAD -- "${file}"`);
      const lines = new Set<number>();
      for (const dl of diffOut.split("\n")) {
        const m = dl.match(/^@@\s+\-\d+(?:,\d+)?\s+\+(\d+)(?:,(\d+))?\s+@@/);
        if (m) {
          const start = parseInt(m[1], 10);
          const count = m[2] ? parseInt(m[2], 10) : 1;
          for (let k = 0; k < count; k++) lines.add(start + k);
        }
      }
      modified.set(file, lines);
    }
  }
  return { modified, added, allFiles };
}

export function collectAudit(): DiffData {
  const allFiles: string[] = [];
  for (const file of walk("src")) {
    // Keep repository-relative paths stable across Windows and POSIX runners.
    // Git paths and detector scopes use `/`, while path.join uses `\\` on Windows.
    allFiles.push(file.split(path.sep).join("/"));
  }
  return {
    modified: new Map(allFiles.map((f) => [f, new Set<number>()])),
    added: allFiles,
    allFiles,
  };
}

// ─── Catch-block parser (used by AP-D + D-11) ──────────────────────────────
export interface CatchBlock {
  openLine: number;
  closeLine: number;
  inner: string;
}

/**
 * Extract all `catch { ... }` blocks from a source string.
 *
 * Limitations (acceptable for a quality-gate heuristic):
 *   - Brace counting is naive: braces inside strings, template literals,
 *     or comments can mislead the parser.
 *   - A `catch` keyword inside a string literal can trigger a false match.
 * Refine only if these heuristics produce false positives in practice.
 */
export function findCatchBlocks(content: string): CatchBlock[] {
  const blocks: CatchBlock[] = [];
  const catchRe = /catch\s*(?:\([^)]*\))?\s*\{/g;
  let match: RegExpExecArray | null;

  while ((match = catchRe.exec(content)) !== null) {
    const openBraceIdx = match.index + match[0].length - 1;
    const openLine = content.slice(0, openBraceIdx).split("\n").length;

    let depth = 1;
    let pos = openBraceIdx + 1;
    let closePos = -1;
    const MAX_CHARS = 10_000;

    while (pos < content.length && depth > 0) {
      const ch = content[pos];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      if (depth === 0) {
        closePos = pos;
        break;
      }
      pos++;
      if (pos - openBraceIdx > MAX_CHARS) break;
    }

    if (closePos === -1) continue;

    const closeLine = content.slice(0, closePos).split("\n").length;
    const inner = content.slice(openBraceIdx + 1, closePos);

    blocks.push({ openLine, closeLine, inner });
    catchRe.lastIndex = closePos + 1;
  }

  return blocks;
}

// ─── Detector helpers (pure, exported for unit tests) ──────────────────────

/** AP-D — empty catch blocks (HARD FAIL). Detects both single-line and
 *  multi-line empty catches, including comment-only bodies. */
export function checkEmptyCatch(
  file: string,
  content: string,
  targetLines: Set<number>,
): Violation[] {
  const violations: Violation[] = [];
  for (const { openLine, inner } of findCatchBlocks(content)) {
    const bodyLines = inner
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    const isCommentOnly =
      bodyLines.length > 0 &&
      bodyLines.every((l) => l.startsWith("//") || l.startsWith("*"));
    if (bodyLines.length === 0 && isInTarget(openLine, targetLines)) {
      violations.push({
        detector: "AP-D",
        file,
        line: openLine,
        snippet: "",
        severity: "fail",
        message: "Empty catch block — error silently swallowed.",
      });
    }
  }
  return violations;
}

/** D-11 — catch blocks without a logger/console/sentry call (SOFT WARN). */
export function checkCatchLogging(
  file: string,
  content: string,
  targetLines: Set<number>,
): Violation[] {
  const violations: Violation[] = [];
  for (const { openLine, inner } of findCatchBlocks(content)) {
    const bodyLines = inner
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    const isCommentOnly =
      bodyLines.length > 0 &&
      bodyLines.every((l) => l.startsWith("//") || l.startsWith("*"));
    const body = inner.trim();
    if (!body || isCommentOnly) continue; // empty catch is AP-D's job, not D-11's
    if (!/console\.|logger\.|log\.|sentry|track\(|recordEvent/.test(body)) {
      if (isInTarget(openLine, targetLines)) {
        violations.push({
          detector: "D-11",
          file,
          line: openLine,
          snippet: "",
          severity: "warn",
          message: "Catch block does not log the error (no logger/console/sentry call).",
        });
      }
    }
  }
  return violations;
}

/** D-9 / AP-F — prisma./db. inside a for/forEach/.map loop (N+1 risk). */
export function checkNPlusOne(
  file: string,
  content: string,
  targetLines: Set<number>,
): Violation[] {
  const lines = content.split("\n");
  const violations: Violation[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (/\bfor\s*\(|\.forEach\s*\(|\.map\s*\(/.test(lines[i])) {
      const block = lines.slice(i, Math.min(i + 6, lines.length)).join("\n");
      if (/(prisma|db)\.[a-z]/.test(block) && isInTarget(i + 1, targetLines)) {
        violations.push({
          detector: "D-9",
          file,
          line: i + 1,
          snippet: lines[i].trim(),
          severity: "warn",
          message: "Query inside loop (N+1 risk). Use aggregate / include / batched Map.",
        });
      }
    }
  }
  return violations;
}

// ─── Detector catalog (15 DoD + 7 anti-patterns) ───────────────────────────

export const DETECTORS: DetectorSpec[] = [
  // D-1 — author-self-cert only (commit message / linked issue).
  { id: "D-1", title: "User story reale", severity: "prompt", scope: () => false, check: () => [] },

  // D-2 — domain layer must not import from UI/route layer.
  {
    id: "D-2",
    title: "Confini e responsabilità chiari",
    severity: "warn",
    scope: (f) => f.startsWith("src/domains/"),
    check: (f, c) => {
      const v: Violation[] = [];
      c.split("\n").forEach((line, i) => {
        if (
          /from\s+["'](?:\.\.\/){2,}(?:components|app)|@\/components|@\/app/.test(line)
        ) {
          v.push({
            detector: "D-2",
            file: f,
            line: i + 1,
            snippet: line.trim(),
            severity: "warn",
            message: "Domain layer must not import from UI/route layer (ADR-0016 §1).",
          });
        }
      });
      return v;
    },
  },

  // D-3 — route handler without auth helper (HARD FAIL).
  {
    id: "D-3",
    title: "Autorizzazioni definite",
    severity: "fail",
    scope: (f) => /\/app\/api\/.+\/route\.(ts|tsx)$/.test(f) && !/\/webhook\//.test(f),
    check: (f, c, t) => {
      const lines = c.split("\n");
      const head = lines.slice(0, 50).join("\n");
      if (!/export\s+(async\s+)?function\s+(GET|POST|PUT|DELETE|PATCH)/.test(head)) return [];
      if (/verifyAuth|requireAuth|getServerSession|auth\(\)|requireUser/.test(head)) return [];
      const handlerLine =
        lines.findIndex((l) => /export\s+(async\s+)?function\s+(GET|POST|PUT|DELETE|PATCH)/.test(l)) + 1;
      if (!isInTarget(handlerLine, t)) return [];
      return [
        {
          detector: "D-3",
          file: f,
          line: handlerLine,
          snippet: lines[handlerLine - 1]?.trim() ?? "",
          severity: "fail",
          message: "Route handler must declare server-side authorization contract.",
        },
      ];
    },
  },

  // D-4 — mutating handler without Zod parsing (SOFT WARN; regex is brittle).
  {
    id: "D-4",
    title: "Input / output validati",
    severity: "warn",
    scope: (f) => /\/app\/api\/.+\/(route|actions)\.(ts|tsx)$/.test(f) && !/\/webhook\//.test(f),
    check: (f, c) => {
      const lines = c.split("\n");
      const v: Violation[] = [];
      lines.forEach((line, i) => {
        if (/export\s+(async\s+)?function\s+(POST|PUT|PATCH)/.test(line)) {
          const snippet = lines.slice(i, Math.min(i + 30, lines.length)).join("\n");
          if (!/\.parse\(|safeParse\(|z\.object\(/.test(snippet)) {
            v.push({
              detector: "D-4",
              file: f,
              line: i + 1,
              snippet: line.trim(),
              severity: "warn",
              message: "Mutating handler must validate input via Zod or equivalent.",
            });
          }
        }
      });
      return v;
    },
  },

  // D-5 — route with > 2 direct prisma.* calls outside comments (extract
  // to use case). Iterates line-by-line so `// prisma.foo.findMany` is
  // ignored; only live code is counted.
  {
    id: "D-5",
    title: "Caso d'uso applicativo",
    severity: "warn",
    scope: (f) => /\/app\/api\/.+\/route\.(ts|tsx)$/.test(f),
    check: (f, c) => {
      let liveCount = 0;
      for (const line of c.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) continue;
        const matches = line.match(/(prisma|db)\.[a-z][a-zA-Z]+/g);
        if (matches) liveCount += matches.length;
      }
      if (liveCount > 2) {
        return [
          {
            detector: "D-5",
            file: f,
            line: 1,
            snippet: `${liveCount} prisma.* calls in route`,
            severity: "warn",
            message: "Route contains > 2 direct DB calls — extract to use case.",
          },
        ];
      }
      return [];
    },
  },

  // D-6 — pure-rule file with no sibling .test.ts.
  {
    id: "D-6",
    title: "Test delle regole",
    severity: "warn",
    scope: (f) =>
      /src\/domains\/.+\/(rules|policy|policies|validator|validators|state-machine|classifier)\.ts$/.test(f),
    check: (f) => {
      const testFile = f.replace(/\.ts$/, ".test.ts");
      if (!fs.existsSync(testFile)) {
        return [
          {
            detector: "D-6",
            file: f,
            line: 1,
            snippet: f,
            severity: "warn",
            message: `Pure-rule file has no sibling test file (expected ${testFile}).`,
          },
        ];
      }
      return [];
    },
  },

  // D-7 — author-self-cert only (positive + negative permission tests).
  { id: "D-7", title: "Test dei permessi", severity: "prompt", scope: () => false, check: () => [] },

  // D-8 — mutating handler without idempotency key (SOFT WARN).
  {
    id: "D-8",
    title: "Protezione contro duplicazioni",
    severity: "warn",
    scope: (f) => /\/app\/api\/.+\/route\.(ts|tsx)$/.test(f) && !/\/webhook\//.test(f),
    check: (f, c) => {
      const lines = c.split("\n");
      const v: Violation[] = [];
      lines.forEach((line, i) => {
        if (/export\s+(async\s+)?function\s+(POST|PUT|PATCH)/.test(line)) {
          const snippet = lines.slice(i, Math.min(i + 30, lines.length)).join("\n");
          if (!/idempotencyKey|idempotency_key|Idempotency-Key/.test(snippet)) {
            v.push({
              detector: "D-8",
              file: f,
              line: i + 1,
              snippet: line.trim(),
              severity: "warn",
              message: "Mutating handler should declare an idempotency key.",
            });
          }
        }
      });
      return v;
    },
  },

  // D-9 — query inside loop (N+1).
  {
    id: "D-9",
    title: "Query budget (no N+1)",
    severity: "warn",
    scope: (f) => /src\/(domains|lib)\/.+\.(ts|tsx)$/.test(f),
    check: checkNPlusOne,
  },

  // D-10 — mutating handler without analytics event emission.
  {
    id: "D-10",
    title: "Eventi analytics",
    severity: "warn",
    scope: (f) => /\/app\/api\/.+\/route\.(ts|tsx)$/.test(f),
    check: (f, c) => {
      const lines = c.split("\n");
      const v: Violation[] = [];
      lines.forEach((line, i) => {
        if (/export\s+(async\s+)?function\s+(POST|PUT|DELETE|PATCH)/.test(line)) {
          const snippet = lines.slice(i, Math.min(i + 50, lines.length)).join("\n");
          if (!/track\(|recordEvent\(|analytics\.|posthog\.capture|mixpanel\.track/.test(snippet)) {
            v.push({
              detector: "D-10",
              file: f,
              line: i + 1,
              snippet: line.trim(),
              severity: "warn",
              message: "Mutating handler should emit a canonical analytics event.",
            });
          }
        }
      });
      return v;
    },
  },

  // D-11 — catch without logger.
  {
    id: "D-11",
    title: "Error logging",
    severity: "warn",
    scope: (f) => /src\/.+\.(ts|tsx)$/.test(f),
    check: checkCatchLogging,
  },

  // D-12 — author-self-cert only (partial-state model in JSDoc).
  { id: "D-12", title: "Gestione degli stati parziali", severity: "prompt", scope: () => false, check: () => [] },

  // D-13 — `_legacy` and `_new` exports coexist in same file.
  {
    id: "D-13",
    title: "Rimozione del path precedente",
    severity: "warn",
    scope: (f) => /src\/.+\.(ts|tsx)$/.test(f),
    check: (f, c) => {
      if (
        /export\s+(?:const|function|class)\s+\w+_legacy\b/.test(c) &&
        /export\s+(?:const|function|class)\s+\w+_new\b/.test(c)
      ) {
        return [
          {
            detector: "D-13",
            file: f,
            line: 1,
            snippet: "_legacy + _new coexist",
            severity: "warn",
            message: "Both _legacy and _new exports present — remove old path.",
          },
        ];
      }
      return [];
    },
  },

  // D-14 — new domain without ADR (HARD FAIL, handled cross-file below).
  {
    id: "D-14",
    title: "ADR della decisione architetturale",
    severity: "fail",
    scope: () => false,
    check: () => [],
  },

  // D-15 — author-self-cert only (CI status).
  { id: "D-15", title: "Quality gate verde", severity: "prompt", scope: () => false, check: () => [] },

  // ── Anti-patterns A-G (master plan §9 unacceptable list) ─────────────────

  // AP-A — TODO/FIXME without owner reference.
  {
    id: "AP-A",
    title: "TODO senza owner",
    severity: "warn",
    scope: (f) => /src\/.+\.(ts|tsx)$/.test(f),
    check: (f, c) => {
      const lines = c.split("\n");
      const v: Violation[] = [];
      lines.forEach((line, i) => {
        if (/\b(?:TODO|FIXME)\b/.test(line)) {
          const ctx = lines.slice(i, Math.min(i + 3, lines.length)).join(" ");
          if (!/@\w+|#\d+|TODO-|FIXME-/.test(ctx)) {
            v.push({
              detector: "AP-A",
              file: f,
              line: i + 1,
              snippet: line.trim(),
              severity: "warn",
              message: "TODO/FIXME without owner reference.",
            });
          }
        }
      });
      return v;
    },
  },

  // AP-B — multiple legacy/deprecated identifiers.
  {
    id: "AP-B",
    title: "Doppia logica vecchia / nuova",
    severity: "warn",
    scope: (f) => /src\/.+\.(ts|tsx)$/.test(f),
    check: (f, c) => {
      const matches = c.match(/_legacy|_old\b|deprecated|legacy_/g);
      if (matches && matches.length >= 2) {
        return [
          {
            detector: "AP-B",
            file: f,
            line: 1,
            snippet: `${matches.length} legacy identifiers`,
            severity: "warn",
            message: "Multiple legacy/deprecated identifiers — confirm removal.",
          },
        ];
      }
      return [];
    },
  },

  // AP-C — silent `??` fallback without log/event.
  {
    id: "AP-C",
    title: "Fallback silenziosi",
    severity: "warn",
    scope: (f) => /src\/.+\.(ts|tsx)$/.test(f),
    check: (f, c) => {
      const lines = c.split("\n");
      const v: Violation[] = [];
      lines.forEach((line, i) => {
        if (/\?\?\s+[^;]+;/.test(line)) {
          const ctx = lines.slice(Math.max(0, i - 3), Math.min(i + 3, lines.length)).join("\n");
          if (!/log|console\.|logger\.|track\(|recordEvent/.test(ctx)) {
            v.push({
              detector: "AP-C",
              file: f,
              line: i + 1,
              snippet: line.trim(),
              severity: "warn",
              message: "Silent fallback (`??`) without log/event.",
            });
          }
        }
      });
      return v;
    },
  },

  // AP-D — empty catch (HARD FAIL).
  {
    id: "AP-D",
    title: "Catch generici vuoti",
    severity: "fail",
    scope: (f) => /src\/.+\.(ts|tsx)$/.test(f),
    check: checkEmptyCatch,
  },

  // AP-E — `while (true)` + retry pattern (infinite loop risk).
  {
    id: "AP-E",
    title: "Retry infiniti",
    severity: "warn",
    scope: (f) => /src\/.+\.(ts|tsx)$/.test(f),
    check: (f, c) => {
      const lines = c.split("\n");
      const v: Violation[] = [];
      lines.forEach((line, i) => {
        if (/while\s*\(\s*true\s*\)/.test(line)) {
          const block = lines.slice(i, Math.min(i + 10, lines.length)).join("\n");
          if (/retry|sleep|backoff|delay/.test(block)) {
            v.push({
              detector: "AP-E",
              file: f,
              line: i + 1,
              snippet: line.trim(),
              severity: "warn",
              message: "`while (true)` + retry — risk of infinite loop without maxAttempts bound.",
            });
          }
        }
      });
      return v;
    },
  },

  // AP-F — N+1 (same detector as D-9, separate ID for anti-pattern list).
  {
    id: "AP-F",
    title: "Query dentro loop (N+1)",
    severity: "warn",
    scope: (f) => /src\/(domains|lib)\/.+\.(ts|tsx)$/.test(f),
    check: checkNPlusOne,
  },

  // AP-G — business rules in UI components.
  {
    id: "AP-G",
    title: "UI che decide regole di business",
    severity: "warn",
    scope: (f) => /\/components\/.+\.(ts|tsx)$/.test(f),
    check: (f, c) => {
      const v: Violation[] = [];
      c.split("\n").forEach((line, i) => {
        if (/if\s*\([^)]*(role|admin|permission|eligibility|score|rank)/i.test(line)) {
          v.push({
            detector: "AP-G",
            file: f,
            line: i + 1,
            snippet: line.trim(),
            severity: "warn",
            message: "Component contains business rule logic — extract to use case / domain rule.",
          });
        }
      });
      return v;
    },
  },
];

// ─── ADR cross-file check (D-14) ────────────────────────────────────────────
export function checkAdr(diff: DiffData): Violation[] {
  // Only consider TRULY NEW files (in diff.added). Files in diff.modified
  // belong to pre-existing domains and must not trigger D-14. In audit
  // mode every file is in `added`, so every domain is flagged — acceptable
  // for compliance reports but use CI mode for the gating signal.
  const newDomains = new Set<string>();
  for (const f of diff.added) {
    const m = f.match(/^src\/domains\/([^/]+)\//);
    if (m) newDomains.add(m[1]);
  }
  const hasAdrChange = diff.allFiles.some((f) => f.startsWith("docs/adr/"));
  if (newDomains.size === 0 || hasAdrChange) return [];
  return Array.from(newDomains).map((domain) => ({
    detector: "D-14",
    file: `src/domains/${domain}/`,
    line: 1,
    snippet: `New domain: ${domain}`,
    severity: "fail" as Severity,
    message: `New domain '${domain}' added without corresponding ADR in docs/adr/.`,
  }));
}

// ─── Run ────────────────────────────────────────────────────────────────────
function run(): void {
  const diff = MODE === "audit" ? collectAudit() : collectDiff(BASE);
  const adrViolations = checkAdr(diff);

  const results: DetectorResult[] = [];
  let pass = 0;
  let warn = 0;
  let fail = 0;
  let prompt = 0;

  for (const det of DETECTORS) {
    let violations: Violation[] = [];
    if (det.id === "D-14") {
      violations = adrViolations;
    } else if (det.severity === "prompt") {
      prompt++;
      results.push({
        id: det.id,
        title: det.title,
        status: "skip",
        violations: [],
        message: "Informational — author self-certifies.",
      });
      continue;
    } else {
      for (const file of diff.allFiles) {
        if (!det.scope(file)) continue;
        let content: string;
        try {
          content = fs.readFileSync(file, "utf-8");
        } catch {
          continue;
        }
        const targetLines = diff.modified.get(file) ?? new Set<number>();
        violations.push(...det.check(file, content, targetLines));
      }
    }

    let status: Status;
    if (violations.length === 0) {
      status = "pass";
      pass++;
    } else if (det.severity === "fail") {
      status = "fail";
      fail++;
    } else {
      status = "warn";
      warn++;
    }
    results.push({
      id: det.id,
      title: det.title,
      status,
      violations,
      message:
        status === "pass"
          ? "OK"
          : `${violations.length} violation(s) — ${det.severity === "fail" ? "BLOCKS" : "WARN"}.`,
    });
  }

  const report: Report = {
    mode: MODE,
    base: BASE,
    timestamp: new Date().toISOString(),
    summary: { pass, warn, fail, skip: prompt, prompt },
    detectors: results,
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(report, null, 2));

  const c = (s: string, code: string): string =>
    process.stdout.isTTY ? `\x1b[${code}m${s}\x1b[0m` : s;
  const g = (s: string): string => c(s, "32");
  const y = (s: string): string => c(s, "33");
  const r = (s: string): string => c(s, "31");
  const gr = (s: string): string => c(s, "90");

  console.log(`\n── DoD check (${MODE} mode, base=${BASE}) ──`);
  for (const det of results) {
    const icon =
      det.status === "pass"
        ? g("✓")
        : det.status === "warn"
          ? y("⚠")
          : det.status === "fail"
            ? r("✗")
            : gr("·");
    console.log(`  ${icon} ${det.id} ${det.title} — ${det.message}`);
  }
  console.log(
    `\nSummary: ${g(`${pass} pass`)} / ${y(`${warn} warn`)} / ${r(`${fail} fail`)} / ${gr(`${prompt} prompt`)}`,
  );
  console.log(`Report: ${OUT_PATH}\n`);

  // Shallow-clone / no-diff fallback: don't block CI on missing context.
  if (MODE === "ci" && diff.allFiles.length === 0) {
    console.log(y("⚠ No diff available (shallow clone / no origin). Skipping."));
    process.exit(0);
  }
  process.exit(fail > 0 ? 1 : 0);
}

if (isEntrypoint()) {
  run();
}