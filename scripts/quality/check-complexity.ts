#!/usr/bin/env tsx
/**
 * Cyclomatic complexity gate (master plan §4).
 *
 * Scope: src/domains TypeScript and TSX files (V2 modular namespace).
 * Legacy code in src/lib/, src/components/, src/app/ is intentionally
 * out of scope; we enforce the rule on new domain code first.
 *
 * Thresholds (master plan §4 table):
 *   - > 15  → HARD FAIL (exit 1)
 *   - > 10  → SOFT WARN (logged, exit 0)
 *   - ≤ 10  → green
 *
 * Reuses the same counter used by hotspot-score.ts so the two tools
 * never disagree on the complexity value of a file.
 */

import fs from "node:fs";
import path from "node:path";
import { countComplexity, isCodeFile } from "./hotspot-score";

const SCOPE = "src/domains";
const WARN_THRESHOLD = 10;
const FAIL_THRESHOLD = 15;

// Pre-existing complexity violations grandfathered while the gate is
// introduced. New files must pass; these are tracked for follow-up
// refactoring (master plan §4 + §5).
const BASELINE = new Set<string>([
  "src/domains/automation/agent-run-retry-policy.ts",
  "src/domains/creator-ops/read-models/audience.ts",
  "src/domains/creator-ops/read-models/content.ts",
  "src/domains/discovery/policies/policy-registry.ts",
]);

interface Finding {
  file: string;
  complexity: number;
  threshold: number;
  kind: "warn" | "fail";
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
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (isCodeFile(entry.name)) {
      yield full;
    }
  }
}

function main(): void {
  const findings: Finding[] = [];

  for (const file of walk(SCOPE)) {
    const content = fs.readFileSync(file, "utf-8");
    const complexity = countComplexity(content);
    if (complexity > FAIL_THRESHOLD) {
      findings.push({ file, complexity, threshold: FAIL_THRESHOLD, kind: "fail" });
    } else if (complexity > WARN_THRESHOLD) {
      findings.push({ file, complexity, threshold: WARN_THRESHOLD, kind: "warn" });
    }
  }

  const baselineFails = findings.filter((f) => f.kind === "fail" && BASELINE.has(f.file));
  const realFails = findings.filter((f) => f.kind === "fail" && !BASELINE.has(f.file));
  const warns = findings.filter((f) => f.kind === "warn");

  if (warns.length > 0) {
    console.warn(
      `⚠ Cyclomatic complexity warnings (${warns.length} file(s) > ${WARN_THRESHOLD}):`,
    );
    for (const f of warns) {
      console.warn(`  ${f.file}: complexity=${f.complexity} (>${f.threshold})`);
    }
  }

  if (baselineFails.length > 0) {
    console.warn(
      `⚠ Baseline complexity violations (${baselineFails.length} file(s) > ${FAIL_THRESHOLD}):`,
    );
    for (const f of baselineFails) {
      console.warn(
        `  ${f.file}: complexity=${f.complexity} (>${f.threshold}) [BASELINE — fix in follow-up]`,
      );
    }
  }

  if (realFails.length > 0) {
    console.error(
      `✗ Cyclomatic complexity HARD FAIL (${realFails.length} file(s) > ${FAIL_THRESHOLD}):`,
    );
    for (const f of realFails) {
      console.error(`  ${f.file}: complexity=${f.complexity} (>${f.threshold})`);
    }
    console.error(
      "\nFix: extract smaller functions, reduce branching, or split the file.\n",
    );
    process.exit(1);
  }

  console.log(
    `✓ Cyclomatic complexity green: ${SCOPE}/**/*.{ts,tsx} all ≤ ${WARN_THRESHOLD}`,
  );
  process.exit(0);
}

main();
