#!/usr/bin/env tsx
/**
 * Incremental architecture gate for the modular monolith.
 *
 * The repository still contains legacy business modules under src/lib. The
 * migration is intentionally progressive, so this gate does not invalidate
 * that legacy baseline. It enforces that:
 *   - newly added business code is placed under src/domains;
 *   - newly added src/lib business files are compatibility-only re-exports;
 *   - changed app files do not import Prisma directly;
 *   - changed domain code does not import legacy business modules;
 *   - cross-domain imports use the target domain public index;
 *   - domain-layer files remain free of Prisma/database imports.
 *
 * Set ARCHITECTURE_BASE_REF to the merge-base ref in CI. Locally the default
 * is HEAD^, which makes each vertical-slice commit independently verifiable.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export interface ArchitectureFile {
  path: string;
  status: string;
  source: string;
}

export interface ArchitectureViolation {
  file: string;
  rule: string;
  message: string;
}

const LEGACY_BUSINESS_ROOTS = new Set([
  "access",
  "analytics",
  "books",
  "commerce",
  "community",
  "config",
  "courses",
  "data",
  "learning",
  "messaging",
  "notifications",
  "payment",
  "services",
]);
const IMPORT_RE = /(?:from\s+|import\s*\(\s*)["']([^"']+)["']/g;
const LEGACY_BUSINESS_IMPORT_RE = /@\/lib\/(access|analytics|books|commerce|community|config|courses|data|learning|messaging|notifications|payment|services)(?:\/|"|')/;
const PRISMA_RE = /(?:@prisma\/client|@\/lib\/db\/prisma|\bprisma\.)/;

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (value) => " ".repeat(value.length))
    .replace(/\/\/[^\n]*/g, (value) => " ".repeat(value.length));
}

export function isCompatibilityShim(source: string): boolean {
  const code = stripComments(source).trim();
  if (!code) return false;
  if (!/(?:export\s+\*\s+from|export\s*\{[\s\S]*?\}\s*from)/.test(code)) return false;
  return !/(?:\b(?:function|class|const|let|var)\b|=>|\bif\s*\(|\bnew\s+)/.test(code);
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

function isBusinessLibFile(filePath: string): boolean {
  const normalized = filePath.replaceAll("\\", "/");
  const match = /^src\/lib\/([^/]+)/.exec(normalized);
  return match ? LEGACY_BUSINESS_ROOTS.has(match[1]) : false;
}

function isTestFile(filePath: string): boolean {
  return /\.(test|spec)\.(ts|tsx)$/.test(filePath);
}

function checkFile(file: ArchitectureFile): ArchitectureViolation[] {
  const violations: ArchitectureViolation[] = [];
  const normalized = file.path.replaceAll("\\", "/");
  const source = stripComments(file.source);
  const modules = importedModules(source);

  if (
    file.status === "A" &&
    isBusinessLibFile(normalized) &&
    !isTestFile(normalized) &&
    !isCompatibilityShim(file.source)
  ) {
    violations.push({
      file: normalized,
      rule: "no-new-lib-business-logic",
      message: "New business logic must live under src/domains; src/lib business files may only be temporary re-export shims.",
    });
  }

  if (normalized.startsWith("src/app/") && PRISMA_RE.test(source)) {
    violations.push({
      file: normalized,
      rule: "app-no-prisma",
      message: "Route and UI composition code must use a domain use case or repository, not Prisma directly.",
    });
  }

  const currentDomain = domainName(normalized);
  if (currentDomain) {
    if (normalized.includes("/domain/") && PRISMA_RE.test(source)) {
      violations.push({
        file: normalized,
        rule: "domain-no-persistence",
        message: "Domain files must remain framework- and persistence-free.",
      });
    }

    if (LEGACY_BUSINESS_IMPORT_RE.test(source)) {
      violations.push({
        file: normalized,
        rule: "domain-no-legacy-business-import",
        message: "Domain code cannot depend on legacy business modules under src/lib; use ports or shared infrastructure.",
      });
    }
  }

  // App/components/scripts are also consumers of domains: they may use only
  // the public index for a different domain. A domain may use its own internals.
  for (const module of modules) {
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

export function collectChangedFiles(baseRef: string): ArchitectureFile[] {
  let output: string;
  try {
    output = execFileSync("git", ["diff", "--name-status", "-z", `${baseRef}...HEAD`], {
      encoding: "utf8",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to inspect architecture diff from base ${baseRef}: ${message}`, {
      cause: error,
    });
  }

  const parts = output.split("\0").filter(Boolean);
  const files: ArchitectureFile[] = [];
  for (let index = 0; index < parts.length; index += 2) {
    const status = parts[index];
    const filePath = parts[index + 1];
    if (!status || !filePath || status.startsWith("D")) continue;
    const absolute = path.resolve(filePath);
    if (!fs.existsSync(absolute) || !/\.(ts|tsx)$/.test(filePath)) continue;
    files.push({
      path: filePath,
      status: status[0],
      source: fs.readFileSync(absolute, "utf8"),
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
