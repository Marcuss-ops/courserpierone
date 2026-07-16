#!/usr/bin/env tsx
/**
 * Dead-exports gate (master plan §4).
 *
 * Uses knip (JSON reporter) to detect unused exports in src/domains/.
 * The output is normalized (sorted) before comparison with a baseline,
 * because knip does not guarantee deterministic ordering of issues.
 *
 * Usage:
 *   npm run check:dead-exports
 *   UPDATE_BASELINE=1 npm run check:dead-exports
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
// Baseline of pre-existing dead exports. This file must only shrink over
// time; new exports should be used or removed, not baselined.
const BASELINE_PATH = path.join(SCRIPT_DIR, "dead-exports-baseline.json");

interface KnipIssue {
  file: string;
  exports?: Array<{ name: string; line: number; col: number; pos: number }>;
  types?: Array<{ name: string; line: number; col: number; pos: number }>;
}

interface KnipReport {
  issues: KnipIssue[];
}

interface Finding {
  file: string;
  kind: "export" | "type";
  name: string;
  raw: string;
}

function runKnip(): Finding[] {
  let output: string;
  try {
    output = execSync("npx --no-install knip --reporter json", {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    // knip exits with a non-zero code when it finds issues, but it still
    // writes the JSON report to stdout. Re-use that output so we can diff
    // against the baseline rather than failing the gate.
    interface ExecError extends Error {
      stdout?: string | Buffer;
      stderr?: string | Buffer;
    }
    const execError = err instanceof Error ? (err as ExecError) : undefined;
    const stdout = Buffer.isBuffer(execError?.stdout)
      ? execError.stdout.toString("utf-8")
      : typeof execError?.stdout === "string"
        ? execError.stdout
        : "";
    if (stdout.trim().startsWith("{")) {
      output = stdout;
    } else {
      const stderr = execError?.stderr
        ? Buffer.isBuffer(execError.stderr)
          ? execError.stderr.toString("utf-8")
          : String(execError.stderr)
        : "";
      console.error("✗ Failed to run knip:", stderr);
      process.exit(2);
    }
  }

  let report: KnipReport;
  try {
    report = JSON.parse(output);
  } catch {
    console.error("✗ Failed to parse knip JSON output");
    process.exit(2);
  }

  const findings: Finding[] = [];
  for (const issue of report.issues ?? []) {
    for (const exp of issue.exports ?? []) {
      findings.push({
        file: issue.file,
        kind: "export",
        name: exp.name,
        raw: `${issue.file} - ${exp.name} (export)`,
      });
    }
    for (const type of issue.types ?? []) {
      findings.push({
        file: issue.file,
        kind: "type",
        name: type.name,
        raw: `${issue.file} - ${type.name} (type)`,
      });
    }
  }

  // Normalize: deterministic sort so baseline comparison is stable.
  findings.sort((a, b) => {
    if (a.file !== b.file) return a.file.localeCompare(b.file);
    if (a.name !== b.name) return a.name.localeCompare(b.name);
    return a.kind.localeCompare(b.kind);
  });

  return findings;
}

function loadBaseline(): Set<string> {
  try {
    const data = fs.readFileSync(BASELINE_PATH, "utf-8");
    return new Set(JSON.parse(data));
  } catch {
    return new Set();
  }
}

function saveBaseline(findings: Finding[]): void {
  const lines = findings.map((f) => f.raw);
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(lines, null, 2) + "\n");
}

function main(): void {
  const findings = runKnip();

  if (process.env.UPDATE_BASELINE) {
    saveBaseline(findings);
    console.log(
      `✓ Updated dead-exports baseline: ${findings.length} finding(s) at ${BASELINE_PATH}`,
    );
    process.exit(0);
  }

  const baseline = loadBaseline();
  const newFindings = findings.filter((f) => !baseline.has(f.raw));

  if (newFindings.length > 0) {
    console.error(
      `✗ ${newFindings.length} new dead export(s) detected:\n`,
    );
    for (const f of newFindings) {
      console.error(`  ${f.raw}`);
    }
    console.error(
      `\nFix by removing the export, using it, or adding it to the baseline if intentional.\n` +
        `Update the baseline with: UPDATE_BASELINE=1 npm run check:dead-exports\n`,
    );
    process.exit(1);
  }

  console.log(
    `✓ Dead-exports green: ${findings.length} baselined finding(s), 0 new.`,
  );
  process.exit(0);
}

main();
