#!/usr/bin/env tsx
/**
 * Circular dependency gate (master plan §4).
 *
 * Uses madge (already a devDependency) to detect import cycles across
 * the TypeScript/TSX source tree.
 *
 * Scope: src/domains (V2 modular namespace; legacy src/lib and
 *        src/app cycles are tracked separately).
 * Tolerance: 0 circular dependencies (HARD FAIL).
 *
 * Why a separate script instead of relying on hotspot-score.ts?
 *   - hotspot-score.ts reports circular deps only indirectly via the
 *     dependency count signal.
 *   - This gate is explicit, fast, and fails CI immediately when a
 *     cycle is introduced.
 */

import { execSync } from "node:child_process";

const SCOPE = "src/domains";

function main(): void {
  let output: string;
  try {
    output = execSync(
      `npx --no-install madge --circular --ts-config ./tsconfig.json --extensions ts,tsx "${SCOPE}"`,
      {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
  } catch (err) {
    const stderr = err instanceof Error && "stderr" in err ? String(err.stderr) : "";
    console.error("✗ Failed to run madge:", stderr);
    process.exit(2);
  }

  // madge --circular prints one cycle per line, e.g.:
  //   src/a.ts -> src/b.ts -> src/a.ts
  const lines = output
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && l.includes("->"));

  if (lines.length === 0) {
    console.log(`✓ No circular dependencies detected in ${SCOPE}`);
    process.exit(0);
  }

  console.error(`✗ Circular dependencies detected (${lines.length}):\n`);
  for (const line of lines) {
    console.error(`  ${line}`);
  }
  console.error(
    "\nFix: break the cycle by extracting shared code into a separate module, " +
      "or by introducing a port/types layer.\n",
  );
  process.exit(1);
}

main();
