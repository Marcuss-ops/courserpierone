#!/usr/bin/env tsx
/**
 * File-size budget check (Fase 0 step 4 + ADR-0016 Future §1).
 *
 * Budget:
 *   - applicativo (UseCase, Adapter, Domain rule, Port): 250 LOC
 *   - route       (Next.js route handler, page):   150 LOC
 *   - eccezione   (files excused via marker comment): 400 LOC
 *
 * Scope:  SOLO src/domains/ TypeScript files (V2 namespace; ADR-0016 §b).
 * V1 legacy in `src/lib/`, `src/components/`, `src/app/` è esente:
 * questa regola irrigidisce SOLO il nuovo codice V2. Niente shock
 * legacy in un colpo (per-user-spec Fase 0 §req).
 *
 * `*.test.ts` files sono esenti da ogni check (test files sono per
 * natura più lunghi; conteggio sarebbe fuorviante).
 *
 * Output: exit 0 se tutto nei limiti; exit 1 con violations list se > budget.
 *
 * YAGNI: questo script è minimale (no glob recursive lib, no fancy flags).
 * Se necessario in futuro: aggiungere supporto per `--scope=src/lib`
 * per applicare budget al legacy in modo progressivo.
 */

import fs from "node:fs";
import path from "node:path";

const SCOPE = "src/domains";

const BUDGETS = {
  applicativo: 250,
  route: 150,
  eccezione: 400,
} as const;

interface Violation {
  file: string;
  lines: number;
  budget: number;
  kind: keyof typeof BUDGETS;
}

function classify(relPath: string): keyof typeof BUDGETS {
  // Heuristics: route = anything in app/ (Next.js page/route handler).
  // Applicativo = default for domain types/ports/adapters/use-cases.
  // Eccezione = explicit comment "size-budget-exempt" in the first 5 lines.
  const content = fs.readFileSync(relPath, "utf-8");
  const head = content.slice(0, 500);
  const rel = relPath.replace(/\\/g, "/");
  if (rel.includes("/app/api/") || rel.includes("/app/(locale)/")) return "route";
  if (head.includes("size-budget-exempt")) return "eccezione";
  return "applicativo";
}

function isCodeFile(name: string): boolean {
  if (!/\.(ts|tsx)$/.test(name)) return false;
  if (name.endsWith(".test.ts") || name.endsWith(".test.tsx")) return false;
  if (name.endsWith(".d.ts")) return false;
  return true;
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

const violations: Violation[] = [];

for (const file of walk(SCOPE)) {
  const content = fs.readFileSync(file, "utf-8");
  const lines = content.split("\n").length;
  const kind = classify(file);
  const budget = BUDGETS[kind];
  if (lines > budget) {
    violations.push({ file, lines, budget, kind });
  }
}

if (violations.length === 0) {
  console.log(
    `✓ File size budget green: ${SCOPE}/**/*.{ts,tsx} all within limits`,
  );
  console.log(
    `  (applicativo ≤${BUDGETS.applicativo} / route ≤${BUDGETS.route} / eccezione ≤${BUDGETS.eccezione})`,
  );
  process.exit(0);
}

console.error(`✗ File size budget violations: ${violations.length}`);
for (const v of violations) {
  console.error(`  ${v.file}: ${v.lines} lines > ${v.budget} (${v.kind})`);
}
console.error(
  `\nFix options:\n  → split the file (extract UseCase / Port / types)\n  → use multiple domain files in the same folder (no anticipatory subdirs)\n  → for genuinely-large files: add "// size-budget-exempt" in head + document ADR cross-ref`,
);
process.exit(1);
