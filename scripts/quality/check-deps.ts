#!/usr/bin/env tsx
/**
 * scripts/quality/check-deps.ts
 *
 * Phase 9 cross-cut (master plan section 7) \u2014 enforce the external
 * dependency policy defined in `docs/adr/0017-dependency-policy.md`.
 *
 * Per ADR-0017 gate #3, a dep used in <= 1 file is a "candidate-to-remove".
 * This script surfaces those candidates so the team can decide to:
 *   - inline the usage (write the helper ourselves), OR
 *   - keep the dep and document the justification in an ADR.
 *
 * Inputs analyzed:
 *   - package.json: dependencies + devDependencies (declared deps)
 *   - package-lock.json: validated that every declared dep is installed
 *     (catches drift between manifest and lockfile)
 *   - src/**\/*.{ts,tsx}: import / require statements (actual usage)
 *
 * Output:
 *   - Console table: each dep with usage count.
 *   - Highlight (red) deps with count == 0 (UNUSED in source).
 *   - Highlight (yellow) deps with count == 1 (CANDIDATE-TO-REMOVE).
 *   - Drift: deps in package.json but missing from lockfile (exit 1).
 *   - JSON artifact: tmp/deps-checker.json (CI upload).
 *
 * Why a separate script (not just `depcheck`):
 *   - depcheck has transitive resolution that requires node_modules +
 *     a fully installed lockfile. This script operates on source-only
 *     signals (the import statements the team actually wrote) +
 *     manifest-vs-lockfile drift.
 *   - Self-contained, no install step needed in CI.
 *   - Plays well with check:hotspots + check:size + check:any.
 *
 * INFRA detection (replaces hardcoded INFRA_DEPS list):
 *   - A dep is automatically excluded from "candidate-to-remove" if:
 *     (a) it's a devDependency, AND
 *     (b) it has zero imports in src/ (tooling/build/test infra), AND
 *     (c) it's NOT also listed as a runtime dependency.
 *   - Rationale: devDeps are by definition tooling. Zero imports + devDep
 *     = legitimate tooling dep. This auto-handles new ESLint plugins /
 *     type packages / build tools without maintaining a hardcoded list.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = process.cwd();
const SRC_SCOPE = "src/";
const PACKAGE_JSON = "package.json";
const PACKAGE_LOCK_JSON = "package-lock.json";
const INFRASTRUCTURE_DEPS = new Set(["react-dom"]);

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

interface LockfileRoot {
  packages?: Record<string, { version?: string }>;
}

interface ImportUsage {
  package: string;
  files: Set<string>;
}

interface DepReport {
  name: string;
  version: string;
  kind: "dependency" | "devDependency";
  usageCount: number;
  usageFiles: string[];
  inLockfile: boolean;
  isAutoInfra: boolean;
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
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      yield full;
    }
  }
}

function stripComments(content: string): string {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, (m) => " ".repeat(m.length))
    .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));
}

// Extract the package name from an import path.
//   "next/link"        -> "next"
//   "@prisma/client"   -> "@prisma/client"
//   "@upstash/redis/.." -> "@upstash/redis"
//   "lodash/fp"        -> "lodash"
//   "./foo"            -> null (relative)
function packageFromImportPath(spec: string): string | null {
  if (spec.startsWith(".") || spec.startsWith("/")) return null;
  if (spec.startsWith("@")) {
    const parts = spec.split("/");
    if (parts.length < 2) return null;
    return `${parts[0]}/${parts[1]}`;
  }
  const slash = spec.indexOf("/");
  if (slash === -1) return spec;
  return spec.slice(0, slash);
}

function collectImportUsages(): Map<string, ImportUsage> {
  const usages = new Map<string, ImportUsage>();
  for (const file of walk(SRC_SCOPE)) {
    const raw = fs.readFileSync(file, "utf-8");
    // Keep quoted module specifiers intact: the import regex below needs
    // to read `from "next/..."` and `import("zod")`. Only comments are
    // blanked so examples in documentation do not count as real usage.
    const stripped = stripComments(raw);
    // Match `import "..."`, `from "..."`, `require("...")`, and
    // `import("...")` module specifiers.
    const importRegex = /(?:from\s+|require\s*\(\s*|import\s*(?:\(\s*|\s+))["']([^"']+)["']/g;
    let m: RegExpExecArray | null;
    while ((m = importRegex.exec(stripped)) !== null) {
      const pkg = packageFromImportPath(m[1]!);
      if (!pkg) continue;
      let entry = usages.get(pkg);
      if (!entry) {
        entry = { package: pkg, files: new Set() };
        usages.set(pkg, entry);
      }
      entry.files.add(file);
    }
  }
  return usages;
}

function readPackageJson(): PackageJson {
  const text = fs.readFileSync(PACKAGE_JSON, "utf-8");
  return JSON.parse(text) as PackageJson;
}

function readLockfile(): LockfileRoot {
  try {
    const text = fs.readFileSync(PACKAGE_LOCK_JSON, "utf-8");
    return JSON.parse(text) as LockfileRoot;
  } catch {
    return { packages: {} };
  }
}

function buildReport(
  pkg: PackageJson,
  usages: Map<string, ImportUsage>,
  lockfile: LockfileRoot,
): DepReport[] {
  const reports: DepReport[] = [];
  const all = new Map<string, { version: string; kind: "dependency" | "devDependency" }>();
  for (const [name, version] of Object.entries(pkg.dependencies ?? {})) {
    all.set(name, { version, kind: "dependency" });
  }
  for (const [name, version] of Object.entries(pkg.devDependencies ?? {})) {
    all.set(name, { version, kind: "devDependency" });
  }

  // The lockfile root key is "" (empty) and contains the resolved
  // versions of all DIRECT deps (deps in package.json). Subdeps are
  // nested under "node_modules/<name>" keys.
  const lockfileKeys = new Set(Object.keys(lockfile.packages ?? {}));
  const inLockfile = (name: string): boolean => {
    if (lockfileKeys.has(`node_modules/${name}`)) return true;
    // Every declared direct dependency must have its own resolved package
    // entry. A non-empty lockfile root alone is not evidence that this
    // particular dependency is installed.
    return false;
  };

  for (const [name, meta] of all) {
    const usage = usages.get(name);
    const usageCount = usage ? usage.files.size : 0;
    // Dynamic infra detection: devDep + zero imports + not in runtime deps.
    const isAutoInfra =
      INFRASTRUCTURE_DEPS.has(name) ||
      (meta.kind === "devDependency" &&
        usageCount === 0 &&
        !(pkg.dependencies && name in pkg.dependencies));

    reports.push({
      name,
      version: meta.version,
      kind: meta.kind,
      usageCount,
      usageFiles: usage ? [...usage.files].sort() : [],
      inLockfile: inLockfile(name),
      isAutoInfra,
    });
  }
  return reports.sort(
    (a, b) =>
      a.usageCount - b.usageCount ||
      (Number(b.inLockfile) - Number(a.inLockfile)) ||
      a.name.localeCompare(b.name),
  );
}

function formatReport(reports: DepReport[]): string {
  const lines: string[] = [
    `[INFO] check:deps \u2014 ${reports.length} deps scanned (devDeps included)`,
    "",
    "[USAGE] | [NAME]              | [KIND] | [LOCK] | [FILES]",
    "-----------+------------------+--------+--------+----------",
  ];
  for (const r of reports) {
    const status =
      r.usageCount === 0
        ? r.isAutoInfra
          ? "[INFRA ]"
          : "[UNUSED]"
        : r.usageCount === 1
          ? "[CANDID]"
          : "[OK]";
    const kind = r.kind === "devDependency" ? "dev" : "prod";
    const lock = r.inLockfile ? "yes" : "NO!";
    const fileList =
      r.usageFiles.length > 0 ? r.usageFiles.slice(0, 3).join(", ") : "(none)";
    const more =
      r.usageFiles.length > 3 ? ` (+${r.usageFiles.length - 3} more)` : "";
    lines.push(
      `${status} | ${r.name.padEnd(22)} | ${kind.padEnd(6)} | ${lock.padEnd(6)} | ${r.usageCount} (${fileList}${more})`,
    );
  }
  return lines.join("\n") + "\n";
}

function main(): void {
  const pkg = readPackageJson();
  const lockfile = readLockfile();
  const usages = collectImportUsages();
  const reports = buildReport(pkg, usages, lockfile);

  // Auto-excluded from "candidate-to-remove": devDeps with zero imports
  // (dynamic infra detection) and core peer/runtime infrastructure explicitly
  // listed above. Other runtime deps with count == 0 remain fatal.
  const candidateReports = reports.filter(
    (r) => r.usageCount === 1 && !r.isAutoInfra,
  );
  const unusedReports = reports.filter(
    (r) => r.usageCount === 0 && !r.isAutoInfra,
  );
  const driftReports = reports.filter((r) => !r.inLockfile);

  const report = formatReport(reports);

  // Best-effort artifact write in CI.
  if (process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true") {
    try {
      fs.mkdirSync("tmp", { recursive: true });
      fs.writeFileSync(
        "tmp/deps-checker.json",
        JSON.stringify(
          {
            reports,
            candidates: candidateReports,
            unused: unusedReports,
            drift: driftReports,
          },
          null,
          2,
        ),
      );
    } catch {
      /* best-effort */
    }
  }

  process.stdout.write(report);

  if (candidateReports.length > 0) {
    console.error(
      `\n[INFO] ${candidateReports.length} candidate-to-remove dep(s) (count == 1, runtime):`,
    );
    for (const r of candidateReports) {
      console.error(`  - ${r.name} (used in 1 file)`);
    }
    console.error(
      "\nPer ADR-0017 gate #3: inline the usage, OR keep the dep with an ADR justification.",
    );
  }

  // Exit 1 ONLY on truly-unused runtime deps or lockfile drift. Infra
  // (devDeps with zero imports) are auto-excluded.
  const fatalReports = [...unusedReports, ...driftReports];
  if (fatalReports.length > 0) {
    if (unusedReports.length > 0) {
      console.error(
        `\n[FAIL] ${unusedReports.length} truly-unused runtime dep(s) (count == 0):`,
      );
      for (const r of unusedReports) {
        console.error(`  - ${r.name}`);
      }
    }
    if (driftReports.length > 0) {
      console.error(
        `\n[FAIL] ${driftReports.length} manifest-vs-lockfile drift(s) (declared but not in lockfile):`,
      );
      for (const r of driftReports) {
        console.error(`  - ${r.name}`);
      }
      console.error(
        "\nFix: run `npm install` to sync lockfile, OR remove from package.json.",
      );
    }
    process.exit(1);
  }
  process.exit(0);
}

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  main();
}