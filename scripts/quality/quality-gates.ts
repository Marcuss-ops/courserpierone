/**
 * Quality-gate registry.
 *
 * Every quality suite is composed from this file. Keep individual checks as
 * npm scripts so they remain runnable in isolation; add them to a suite here
 * instead of duplicating command lists in package.json or CI documentation.
 */

export const QUALITY_GATES = {
  static: [
    "typecheck",
    "lint",
    "check:size",
    "check:complexity",
    "check:circular",
    "check:architecture",
    "check:naming",
    "check:deps",
    "check:dead-exports",
    "check:eslint-disables",
    "check:registry-drift",
  ],
  repository: [
    "audit:courses-drift",
    "check:dod",
    "check:deploy-gate-shape",
    "check:hotspots",
    "check:migrations",
  ],
  unit: ["test"],
  integration: ["test:integration"],
  build: ["build"],
  e2e: ["test:e2e", "check:e2e:sse"],
} as const;

export const QUALITY_SUITES = {
  static: [...QUALITY_GATES.static],
  repo: [...QUALITY_GATES.repository],
  check: [...QUALITY_GATES.static, ...QUALITY_GATES.unit, ...QUALITY_GATES.repository],
  full: [
    ...QUALITY_GATES.build,
    ...QUALITY_GATES.static,
    ...QUALITY_GATES.unit,
    ...QUALITY_GATES.repository,
    ...QUALITY_GATES.integration,
    ["check:migration"],
    ...QUALITY_GATES.e2e,
  ].flat(),
} as const;

export type QualitySuite = keyof typeof QUALITY_SUITES;

const allTasks = new Set(Object.values(QUALITY_GATES).flat());

if (allTasks.size === 0) {
  throw new Error("QUALITY_GATES must contain at least one task");
}

for (const [suite, tasks] of Object.entries(QUALITY_SUITES)) {
  if (tasks.length === 0) {
    throw new Error(`Quality suite \"${suite}\" must contain at least one task`);
  }
}

export function getQualitySuite(name: string): readonly string[] {
  if (!(name in QUALITY_SUITES)) {
    throw new Error(
      `Unknown quality suite \"${name}\". Expected one of: ${Object.keys(QUALITY_SUITES).join(", ")}.`,
    );
  }
  return QUALITY_SUITES[name as QualitySuite];
}
