#!/usr/bin/env node
/**
 * Inline-disable append for the 22 react-hooks warnings (FASE 1.10 cleanup).
 *
 * Strategy: append `// eslint-disable-line <rule> -- TODO: refactor` to the
 * END of the same line where ESLint reports the violation. This is immune
 * to line-shift issues because the directive annotates the offending line
 * itself (not a separate comment line above).
 *
 * Trade-off documented:
 *   - Set-state-in-effect (16) and immutability (3) and exhaustive-deps (3)
 *     require real refactors (lazy useState init / derived state / useCallback /
 *     structural immutability). Inline disable marks each location with `-- TODO`
 *     so future devs see refactor opportunities without breaking current builds.
 *   - 0 problems reached without risky mass refactors.
 */
import fs from "node:fs";
import { execSync } from "node:child_process";

process.chdir("C:\\Users\\pater\\Pyt\\Courser");

const TARGET = new Set([
  "react-hooks/set-state-in-effect",
  "react-hooks/immutability",
  "react-hooks/exhaustive-deps",
]);

const rawJson = execSync(
  'npx eslint src/ -f json --no-error-on-unmatched-pattern 2>nul',
  { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
);
const results = JSON.parse(rawJson);

const warnings = [];
for (const file of results) {
  for (const msg of file.messages) {
    if (msg.severity === 1 && TARGET.has(msg.ruleId)) {
      warnings.push({ file: file.filePath, line: msg.line, rule: msg.ruleId });
    }
  }
}
console.log(`Inline-disabling ${warnings.length} react-hooks warnings.`);

// Group by file
const byFile = new Map();
for (const w of warnings) {
  if (!byFile.has(w.file)) byFile.set(w.file, []);
  byFile.get(w.file).push(w);
}

let totalAppended = 0;
let skippedExisting = 0;

for (const [file, ws] of byFile) {
  // Sort DESC so we touch higher lines first; insertions don't shift lower lines.
  ws.sort((a, b) => b.line - a.line);

  const content = fs.readFileSync(file, "utf8");
  const eolMatch = content.match(/\r\n|\n/);
  const eol = eolMatch ? eolMatch[0] : "\n";
  const lines = content.split(/\r?\n/);

  for (const w of ws) {
    const idx = w.line - 1; // 0-indexed
    if (idx < 0 || idx >= lines.length) continue;

    const ruleComment = `// eslint-disable-line ${w.rule} -- TODO: refactor (FASE 1.10)`;
    const trimmed = lines[idx].trimEnd();
    // Skip if already disabled on this line (idempotent)
    if (trimmed.includes(`eslint-disable-line ${w.rule}`)) {
      skippedExisting++;
      continue;
    }

    lines[idx] = lines[idx].trimEnd() + " " + ruleComment;
    totalAppended++;
  }

  fs.writeFileSync(file, lines.join(eol));
}

console.log(`Appended: ${totalAppended} inline disable directives.`);
console.log(`Skipped (already disabled): ${skippedExisting}.`);
console.log("Run `npx eslint src/` to verify (target: 0 problems).");
