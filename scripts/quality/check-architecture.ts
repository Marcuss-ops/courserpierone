#!/usr/bin/env tsx
/**
 * Incremental architecture gate for the modular monolith.
 *
 * Legacy business code remains under src/lib during the migration. This gate
 * therefore checks new files in full and only added lines in modified files:
 *   - new business code belongs under src/domains;
 *   - new src/lib business files may only be compatibility re-exports;
 *   - new app/domain imports respect persistence and public-domain boundaries;
 *   - domain files cannot import legacy business modules;
 *   - staged, unstaged, committed, and untracked changes are all included.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export interface ArchitectureFile {
  path: string;
  status: string;
  source: string;
  /** Added lines only for modified files; absent means use source (unit tests). */
  addedSource?: string;
}

export interface ArchitectureViolation {
  file: string;
  rule: string;
  message: string;
}

const INFRASTRUCTURE_LIB_ROOTS = new Set([
  "db",
  "domain-types",
  "env",
  "errors",
  "i18n",
  "logging",
  "middleware",
  "openai",
  "parsers",
  "presence",
  "redis",
  "shared",
  "supabase",
  "ui",
  "utils",
]);
const LEGACY_BUSINESS_ROOTS =
  "access|analytics|books|commerce|community|config|courses|data|learning|messaging|notifications|payment|services";
const IMPORT_RE = /(?:from\s+|import\s*\(\s*)["']([^"']+)["']/g;
const LEGACY_BUSINESS_IMPORT_RE = new RegExp(
  `@\\/lib\\/(${LEGACY_BUSINESS_ROOTS})(?:\\/|["'])`,
);
const RELATIVE_LEGACY_IMPORT_RE = new RegExp(
  `(?:from\\s+|import\\s*\\(\\s*)["'](?:\\.\\.\\/)+lib\\/(${LEGACY_BUSINESS_ROOTS})(?:\\/|["'])`,
);
const PRISMA_RE = /(?:@prisma\/client|@\/lib\/db\/prisma|\bprisma\.)/;

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (value) => " ".repeat(value.length))
    .replace(/\/\/[^\n]*/g, (value) => " ".repeat(value.length));
}

export function isCompatibilityShim(source: string): boolean {
  const code = stripComments(source).trim();
  if (!code) return false;
  if (!/^(?:export\s+\*\s+from\s+["'][^"']+["'];?|export\s*\{[\s\S]*?\}\s*from\s+["'][^"']+["'];?)+$/.test(code)) {
    return false;
  }
  return true;
}

function domainName(filePath: string): string | null {
  const match = /^src\/domains\/([^/]+)/.exec(filePath.replaceAll("\\", "/"));
  return match?.[1] ?? null;
}

function importedModules(source: string): string[] {
  const modules: string[] = [];
  const code = stripComments(source);
  let match: RegExpExecArray | null;
  while ((match = IMPORT_RE.exec(code)) !== null) modules.push(match[1]);
  IMPORT_RE.lastIndex = 0;
  return modules;
}

function isNewBusinessLibFile(filePath: string): boolean {
  const normalized = filePath.replaceAll("\\", "/");
  const match = /^src\/lib\/([^/]+)/.exec(normalized);
  if (!match) return false;
  const root = match[1].replace(/\.[jt]sx?$/, "");
  return !INFRASTRUCTURE_LIB_ROOTS.has(root);
}

function checkFile(file: ArchitectureFile): ArchitectureViolation[] {
  const violations: ArchitectureViolation[] = [];
  const normalized = file.path.replaceAll("\\", "/");
  const addedSource = stripComments(file.addedSource ?? file.source);
  const modules = importedModules(addedSource);
  const fullSourceForShim = file.status === "A" || file.addedSource === undefined;

  if (
    fullSourceForShim &&
    file.status === "A" &&
    isNewBusinessLibFile(normalized) &&
    !isCompatibilityShim(file.source)
  ) {
    violations.push({
      file: normalized,
      rule: "no-new-lib-business-logic",
      message: "New business logic must live under src/domains; new src/lib business files may only be re-export shims.",
    });
  }

  if (normalized.startsWith("src/app/") && PRISMA_RE.test(addedSource)) {
    violations.push({
      file: normalized,
      rule: "app-no-prisma",
      message: "New route/UI code must use a domain use case or repository, not Prisma directly.",
    });
  }

  const currentDomain = domainName(normalized);
  if (currentDomain) {
    if (normalized.includes("/domain/") && PRISMA_RE.test(addedSource)) {
      violations.push({
        file: normalized,
        rule: "domain-no-persistence",
        message: "Domain files must remain framework- and persistence-free.",
      });
    }

    if (LEGACY_BUSINESS_IMPORT_RE.test(addedSource) || RELATIVE_LEGACY_IMPORT_RE.test(addedSource)) {
      violations.push({
        file: normalized,
        rule: "domain-no-legacy-business-import",
        message: "Domain code cannot depend on legacy business modules under src/lib; use ports or shared infrastructure.",
      });
    }
  }

  const checksRuntimeImports =
    normalized.startsWith("src/app/") ||
    normalized.startsWith("src/domains/") ||
    normalized.startsWith("src/lib/");
  for (const module of checksRuntimeImports ? modules : []) {
    const target = /^@\/domains\/([^/]+)(?:\/(.*))?$/.exec(module);
    if (!target || target[1] === currentDomain) continue;
    if (target[2] && target[2] !== "index") {
      violations.push({
        file: normalized,
        rule: "cross-domain-public-api",
        message: `Cross-domain imports must target @/domains/${target[1]} public index, not internal path ${module}.`,
      });
    }
  }

  return violations;
}

export function checkArchitectureFiles(files: ArchitectureFile[]): ArchitectureViolation[] {
  return files.flatMap(checkFile);
}

function runGit(args: string[]): string {
  try {
    return execFileSync("git", args, { encoding: "utf8" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to inspect architecture changes: ${message}`, { cause: error });
  }
}

function changedPaths(baseRef: string): Map<string, string> {
  const result = new Map<string, string>();
  const record = (filePath: string, status: string) => {
    const normalizedStatus = status[0];
    if (normalizedStatus === "D") {
      result.delete(filePath);
      return;
    }
    // Preserve an addition across staged/unstaged layers so the complete
    // working-tree source is checked instead of only its latest status.
    if (normalizedStatus === "A" || result.get(filePath) === "A") {
      result.set(filePath, "A");
    } else {
      result.set(filePath, normalizedStatus);
    }
  };
  const add = (output: string) => {
    const parts = output.split("\0").filter(Boolean);
    for (let index = 0; index < parts.length;) {
      const status = parts[index++];
      if (!status) continue;
      if (status.startsWith("R") || status.startsWith("C")) {
        index += 1; // old path
        const newPath = parts[index++];
        if (newPath) record(newPath, "A");
      } else {
        const filePath = parts[index++];
        if (filePath) record(filePath, status);
      }
    }
  };
  add(runGit(["diff", "--name-status", "-z", `${baseRef}...HEAD`]));
  add(runGit(["diff", "--name-status", "-z"]));
  add(runGit(["diff", "--cached", "--name-status", "-z"]));
  const untracked = runGit(["ls-files", "--others", "--exclude-standard", "-z"])
    .split("\0")
    .filter(Boolean);
  for (const filePath of untracked) record(filePath, "A");
  return result;
}

function addedSource(baseRef: string, filePath: string): string {
  // Compare the base tree with the current working tree so staged and
  // unstaged edits are represented exactly once.
  return runGit(["diff", "--no-color", "-U0", baseRef, "--", filePath])
    .split("\n")
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .map((line) => line.slice(1))
    .join("\n");
}

export function collectChangedFiles(baseRef: string): ArchitectureFile[] {
  runGit(["rev-parse", "--verify", `${baseRef}^{commit}`]);
  const files: ArchitectureFile[] = [];
  for (const [filePath, status] of changedPaths(baseRef)) {
    const absolute = path.resolve(filePath);
    if (!fs.existsSync(absolute) || !/\.(ts|tsx)$/.test(filePath)) continue;
    const source = fs.readFileSync(absolute, "utf8");
    files.push({
      path: filePath,
      status,
      source,
      addedSource: status === "A" ? source : addedSource(baseRef, filePath),
    });
  }
  return files;
}

export function runArchitectureCheck(baseRef = process.env.ARCHITECTURE_BASE_REF ?? "HEAD^"): void {
  try {
    const violations = checkArchitectureFiles(collectChangedFiles(baseRef));
    if (violations.length === 0) {
      console.log(`✓ Architecture boundaries passed (base: ${baseRef})`);
      return;
    }

    console.error(`✗ Architecture boundary violations (${violations.length}):`);
    for (const violation of violations) {
      console.error(`  [${violation.rule}] ${violation.file}: ${violation.message}`);
    }
    process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  }
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  runArchitectureCheck();
}
