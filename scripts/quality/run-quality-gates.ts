#!/usr/bin/env tsx

import { spawnSync } from "node:child_process";
import { getQualitySuite } from "./quality-gates";

const suite = process.argv[2] ?? "check";
const tasks = getQualitySuite(suite);

console.log(`Running quality suite \"${suite}\" (${tasks.length} tasks):`);
for (const task of tasks) console.log(`  • ${task}`);

for (const task of tasks) {
  console.log(`\n▶ npm run ${task}`);
  const result = spawnSync("npm", ["run", task], {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
  });
  if (result.error) {
    console.error(`Failed to start quality task \"${task}\":`, result.error);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`Quality task \"${task}\" failed with exit code ${result.status ?? 1}.`);
    process.exit(result.status ?? 1);
  }
}

console.log(`\n✓ Quality suite \"${suite}\" passed.`);
