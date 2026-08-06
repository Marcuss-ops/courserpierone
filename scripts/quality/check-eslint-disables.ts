#!/usr/bin/env tsx

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { ESLINT_DISABLE_ALLOWLIST } from "./eslint-disable-allowlist";

type Entry = readonly [file: string, rule: string, line: number];

const allowlist = new Set<string>(
  ESLINT_DISABLE_ALLOWLIST.map(([file, rule, line]) => `${file}\t${rule}\t${line}`),
);

function sourceFiles(): string[] {
  const tracked = execFileSync("git", ["ls-files", "src"], { encoding: "utf8" });
  const untracked = execFileSync(
    "git",
    ["ls-files", "--others", "--exclude-standard", "--", "src"],
    { encoding: "utf8" },
  );
  return [...new Set(`${tracked}\n${untracked}`.split(/\r?\n/))].filter((file) =>
    /\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(file),
  );
}

function directivesInFile(file: string): Entry[] {
  const directives: Entry[] = [];
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  const directive = /(?:\/\/|\/\*)\s*eslint-disable(?:-line|-next-line)?(?:\s+([^*\r\n]+?))?(?:\s*\*\/)?\s*$/;
  const normalized = file.replaceAll(path.sep, "/");

  lines.forEach((line, index) => {
    const match = directive.exec(line.trim());
    if (!match) return;

    const rules = (match[1] ?? "")
      .split("--", 1)[0]
      .split(/[\s,]+/)
      .map((rule) => rule.trim())
      .filter(Boolean);
    for (const rule of rules.length > 0 ? rules : ["*"]) {
      directives.push([normalized, rule, index + 1]);
    }

    if (rules.length === 0) {
      console.warn(`${file}:${index + 1}: unscoped eslint-disable directive`);
    }
  });

  return directives;
}

function main(): number {
  const observed = new Set<string>();
  for (const file of sourceFiles()) {
    for (const [sourceFile, rule, line] of directivesInFile(file)) {
      observed.add(`${sourceFile}\t${rule}\t${line}`);
    }
  }

  const unexpected = [...observed].filter((entry) => !allowlist.has(entry));
  const stale = [...allowlist].filter((entry) => !observed.has(entry));

  if (unexpected.length === 0 && stale.length === 0) {
    console.log(`✓ eslint-disable allowlist passed (${observed.size} directives).`);
    return 0;
  }

  if (unexpected.length > 0) {
    console.error("✗ Unreviewed eslint-disable directives:");
    for (const entry of unexpected) console.error(`  ${entry.replaceAll("\t", " → ")}`);
  }
  if (stale.length > 0) {
    console.error("✗ Stale eslint-disable allowlist entries:");
    for (const entry of stale) console.error(`  ${entry.replaceAll("\t", " → ")}`);
  }
  return 1;
}

process.exit(main());
