#!/usr/bin/env tsx
/**
 * scripts/quality/check-deploy-gate-shape.ts
 *
 * CI regression guard for the `deploy-gate` aggregator structure in
 * `.github/workflows/ci.yml`.
 *
 * Why this exists (closes P0 from the repo-hardening audit)
 * ------------------------------------------------------------
 *   `deploy-gate` is the SINGLE required status check name in branch
 *   protection for `main`. Its job is to aggregate 5 quality jobs
 *   (typecheck, lint, unit-tests, e2e-journey, quality-gate) and emit
 *   one RED/GREEN signal that controls whether merges are blocked.
 *
 *   If any of these regressions sneak in via a future copy-paste
 *   refactor or "clean-up" PR, `main` could turn green while the
 *   underlying quality gate is actually red — defeating branch
 *   protection:
 *     1. `quality-gate` removed from `needs:`
 *     2. `[ "$QG" = "success" ]` row removed from the aggregator bash
 *     3. `${{ needs.quality-gate.result }}` env binding removed
 *     4. `- name: Fail the gate` step removed (or `exit 1` removed)
 *     5. The whole `deploy-gate:` job disappeared
 *
 * What the guard asserts (fail-closed, exit 1 if ANY missing):
 *   1. `deploy-gate:` job exists at top-level (2-space indent)
 *   2. `needs:` array contains `quality-gate`
 *   3. Aggregate step env maps `QG` from `needs.quality-gate.result`
 *   4. Aggregate bash enforces `[ "$QG" = "success" ]`
 *   5. A `- name: Fail the gate` step is present AND invokes `exit 1`
 *
 * Implementation notes:
 *   - Parses `ci.yml` as raw text (no `js-yaml` / `yaml` dep). The
 *     invariants are anchored on the file's idiomatic shape and the
 *     existing comments in ci.yml already declare them as contracts.
 *     Keeps the dep surface stable per ADR-0016 §Future §1.
 *   - Block slicing: stops at the next top-level job key (2-space
 *     indent) so a job added AFTER `deploy-gate` cannot accidentally
 *     re-satisfy an invariant via a future regression.
 *   - Pure-function `verifyDeployGate(yaml): Violation[]` is exported
 *     so vitest covers each failure mode without touching disk.
 *
 * Output:
 *   - tmp/check-deploy-gate-shape.json (machine-readable, exit code 0/1)
 *   - stdout: ANSI-pass summary line on success; violation roster on fail.
 *
 * Usage:
 *   npx tsx scripts/quality/check-deploy-gate-shape.ts
 *   npm run check:deploy-gate-shape
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface Violation {
  invariant: string;
  message: string;
}

interface Report {
  file: string;
  timestamp: string;
  violations: Violation[];
  passed: boolean;
}

// ─── CLI config ───────────────────────────────────────────────────────────
const CI_YAML_PATH = ".github/workflows/ci.yml";
const OUT_PATH = "tmp/check-deploy-gate-shape.json";

// ─── Pure verification (exported for tests) ───────────────────────────────

/**
 * Verifies the `deploy-gate:` block of a GitHub Actions workflow YAML.
 *
 * @param yaml  Full text of the workflow file (typically `.github/workflows/ci.yml`).
 * @returns     Empty array when all 5 invariants hold.
 */
export function verifyDeployGate(yaml: string): Violation[] {
  const violations: Violation[] = [];

  // ── 1. `deploy-gate:` job exists at top-level (2-space indent) ────────
  //   The literal `:` after `deploy-gate` is required and is enough
  //   to discriminate against future jobs like `deploy-gate-helper:`
  //   (whose 14th char is `-`, not `:`). No `\b` needed — and adding
  //   one BREAKS the match because between `:` and the next `\n` (or
  //   space) there is no word boundary to satisfy.
  const parts = yaml.split(/^ {2}deploy-gate:/m);
  if (parts.length < 2) {
    return [
      {
        invariant: "deploy-gate-job-exists",
        message:
          "Missing `deploy-gate:` top-level job in ci.yml — the aggregator is gone, branch protection will accept a red main.",
      },
    ];
  }

  // Slice the deploy-gate block from `deploy-gate:` to the next top-level
  // job key (2-space indent) or EOF. Without this clip, a future job
  // added below `deploy-gate` could re-introduce any of the
  // invariants and silently pass.
  const afterHeader = parts[1];
  const nextJobMatch = /^ {2}[a-z][a-z0-9_-]*:/m.exec(afterHeader);
  const block = nextJobMatch
    ? afterHeader.slice(0, nextJobMatch.index)
    : afterHeader;

  // ── 2. `needs:` includes `quality-gate` ─────────────────────────────────
  //   Accepts BOTH idiomatic YAML shapes:
  //     a) inline array:
  //          needs: [typecheck, lint, unit-tests, e2e-journey, quality-gate]
  //     b) block list:
  //          needs:
  //            - typecheck
  //            - quality-gate
  //   The inline check anchors on `\b` which works across separators
  //   like `, ` (comma+space) and `[` / `]`. This defends against
  //   future job names like `super-quality-gate` slipping in via a
  //   rename — `\b` only matches `\w` transitions; the chars `,` `]`
  //   `[` `space` are not `\w`, so `quality-gate` is only bounded
  //   when it actually IS the standalone token between separators.
  const needsInline = /(^|\n) {4}needs: \[[^\]]*\bquality-gate\b[^\]]*\]/m.test(
    block,
  );
  const needsBlockList = /(^|\n) {4}needs:\s*\n(?:\s+-\s+[a-z][a-z0-9_-]*\s*\n)*\s+-\s+quality-gate\s*(?:\n|$)/m.test(
    block,
  );
  if (!needsInline && !needsBlockList) {
    violations.push({
      invariant: "needs-includes-quality-gate",
      message:
        "`deploy-gate.needs:` must include `quality-gate` (inline array OR block list) — the aggregator reads `needs.quality-gate.result` to gate the green signal.",
    });
  }

  // ── 3. Env binding: `QG: ${{ needs.quality-gate.result }}` ─────────────
  if (!/\bQG:\s*\$\{\{\s*needs\.quality-gate\.result\s*\}\}/.test(block)) {
    violations.push({
      invariant: "qg-env-binding",
      message:
        "Aggregate step must expose env `QG: ${{ needs.quality-gate.result }}` — bash reads `$QG` to compare against `\"success\"`.",
    });
  }

  // ── 4. Aggregate bash enforces `[ "$QG" = "success" ]` ─────────────────
  if (!/\[\s*"\$\s*QG\s*"\s*=\s*"success"\s*\]/.test(block)) {
    violations.push({
      invariant: "qg-success-equality",
      message:
        "Aggregate bash must include `[ \"$QG\" = \"success\" ]` — without it a red `quality-gate` would be silently accepted.",
    });
  }

  // ── 5. `Fail the gate` step with `exit 1` ──────────────────────────────
  // The aggregate step intentionally exits 0 (so the alert step can
  // execute on a red gate); the JOB flips to RED only because the
  // subsequent `- name: Fail the gate` step invokes `exit 1`. Missing
  // this step is the canonical bypass: gate=red, job=success.
  const failStepMatch = /- name: Fail the gate[\s\S]*?exit 1/.exec(block);
  if (!failStepMatch) {
    violations.push({
      invariant: "fail-the-gate-step",
      message:
        "A `- name: Fail the gate …` step invoking `exit 1` must exist (without it the deploy-gate job terminates successfully even with gate=red).",
    });
  }

  return violations;
}

// ─── CLI runner ───────────────────────────────────────────────────────────

function run(): void {
  if (!fs.existsSync(CI_YAML_PATH)) {
    console.error(
      `✗ check-deploy-gate-shape: cannot find ${CI_YAML_PATH} — run from the repo root.`,
    );
    process.exit(2);
  }

  const yaml = fs.readFileSync(CI_YAML_PATH, "utf-8");
  const violations = verifyDeployGate(yaml);

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  const report: Report = {
    file: CI_YAML_PATH,
    timestamp: new Date().toISOString(),
    violations,
    passed: violations.length === 0,
  };
  fs.writeFileSync(OUT_PATH, JSON.stringify(report, null, 2));

  const color = (s: string, code: string): string =>
    process.stdout.isTTY ? `\x1b[${code}m${s}\x1b[0m` : s;
  const green = (s: string): string => color(s, "32");
  const red = (s: string): string => color(s, "31");

  if (violations.length === 0) {
    console.log(
      green("✓ check-deploy-gate-shape:") +
        ` all 5 invariants verified in ${CI_YAML_PATH}.`,
    );
    console.log(`  Report: ${OUT_PATH}`);
    process.exit(0);
  }

  console.error(
    red("✗ check-deploy-gate-shape:") +
      ` ${violations.length} invariant violation(s) in ${CI_YAML_PATH}:`,
  );
  for (const v of violations) {
    console.error(`  [${v.invariant}] ${v.message}`);
  }
  console.error(`\n  Report: ${OUT_PATH}`);
  console.error(
    "  Branch protection will NOT block a red quality-gate without these invariants.",
  );
  process.exit(1);
}

// Match the entrypoint convention used by scripts/quality/check-dod.ts
// (canonical for tsx-ESM scripts in this repo): primary check is on
// `fileURLToPath(import.meta.url)`, with an `endsWith` fallback for
// the CJS-eval mode tsx falls back to in some environments.
function isEntrypoint(): boolean {
  try {
    return process.argv[1] === fileURLToPath(import.meta.url);
  } catch {
    return process.argv[1]?.endsWith("check-deploy-gate-shape.ts") ?? false;
  }
}

if (isEntrypoint()) {
  run();
}
