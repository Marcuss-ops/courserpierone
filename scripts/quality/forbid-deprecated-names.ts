#!/usr/bin/env tsx
// scripts/quality/forbid-deprecated-names.ts
//
// CI guardrail for the Courssy brand canonical migration (ADR-0015).
// Fails the build if any tracked text file reintroduces a deprecated
// brand name ("Courser" / "courser" / "Coursy" / "coursy" — the EU
// trademark conflict variant). The canonical "Courssy" name and the
// legacy "courserpierone" Vercel project codename are preserved by
// the regex word-boundary semantics: `r` followed by `p` are both
// word characters in POSIX/Perl regex (`_` and letters are `\w`),
// so `\bcourser\b` does NOT match "courserpierone" — no explicit
// special case required.
//
// Allowlist (deprecated name is intentional in these files):
//   1. docs/adr/0015-coursy-naming-decision.md (the decision itself)
//   2. docs/adr/0016-coursy-monolith-modular.md (parent ADR)
//   3. scripts/_inline-disable-react-hooks.mjs (Windows path string)
//   4. scripts/quality/forbid-deprecated-names.ts (this script body)

import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const ALLOWED_PATHS: ReadonlySet<string> = new Set([
  "docs/adr/0015-coursy-naming-decision.md",
  "docs/adr/0016-coursy-monolith-modular.md",
  "scripts/_inline-disable-react-hooks.mjs",
  "scripts/quality/forbid-deprecated-names.ts",
  "scripts/quality/forbid-deprecated-names.test.ts",
  // Legacy migration-window keys intentionally keep the old brand name
  // so pre-rename clients can still sync progress/inbox state.
  // See ADR-0015 §Migration plan (target close: 2026-08-15).
  "src/components/course/premium-video-player.tsx",
  "src/components/layout/inbox-provider.tsx",
  "src/lib/brand/brand-migration-keys.ts",
  "src/lib/brand/brand-migration-keys.test.ts",
]);

const FORBIDDEN_PATTERNS: ReadonlyArray<{ name: string; regex: RegExp }> = [
  { name: "Courser", regex: /\bCourser\b/g },
  { name: "courser", regex: /\bcourser\b/g },
  { name: "Coursy",  regex: /\bCoursy\b/g  }, // EU trademark conflict
  { name: "coursy",  regex: /\bcoursy\b/g  },
];

const SCANNED_EXTENSIONS: ReadonlyArray<string> = [
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".json", ".md", ".mdx",
  ".sh", ".bash",
  ".py",
  ".yml", ".yaml",
  ".html", ".css", ".scss", ".sass",
  ".txt", ".csv",
];

interface Violation { file: string; line: number; pattern: string; text: string; }

function listTrackedFiles(): string[] {
  const out = execSync("git ls-files", { encoding: "utf8" });
  return out.split("\n").filter((f) => f.trim().length > 0);
}

function shouldScan(path: string): boolean {
  return SCANNED_EXTENSIONS.some((ext) => path.endsWith(ext));
}

function scanFile(file: string): Violation[] {
  const hits: Violation[] = [];
  let content: string;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    return hits;
  }
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const { name, regex } of FORBIDDEN_PATTERNS) {
      regex.lastIndex = 0;
      if (regex.test(line)) {
        hits.push({ file, line: i + 1, pattern: name, text: line.trim() });
      }
    }
  }
  return hits;
}

function main(): number {
  let files: string[];
  try {
    files = listTrackedFiles();
  } catch (err) {
    process.stderr.write(
      "forbid-deprecated-names: failed to run `git ls-files` — is git on PATH?\n",
    );
    return 2;
  }

  const violations: Violation[] = [];
  let scanned = 0;
  for (const file of files) {
    if (ALLOWED_PATHS.has(file)) continue;
    if (!shouldScan(file)) continue;
    scanned += 1;
    for (const h of scanFile(file)) violations.push(h);
  }

  if (violations.length === 0) {
    process.stdout.write(
      `✓ forbid-deprecated-names: scanned ${scanned} text files, 0 violations.\n`,
    );
    return 0;
  }

  process.stderr.write(
    `✗ forbid-deprecated-names: ${violations.length} deprecated brand name(s) found across ${scanned} files:\n\n`,
  );
  for (const v of violations) {
    process.stderr.write(`  ${v.file}:${v.line} [${v.pattern}]\n    > ${v.text}\n`);
  }
  process.stderr.write(
    "\nRename them to \"Courssy\" or justify the path in ALLOWED_PATHS and re-run.\n",
  );
  return 1;
}

process.exit(main());
