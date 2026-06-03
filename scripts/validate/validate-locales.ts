#!/usr/bin/env node
/**
 * Validate Locales — Verifica che ogni JSON lingua abbia tutte le chiavi
 * presenti in en.json. Se manca una chiave, il build fallisce.
 *
 * Uso:
 *   npx tsx scripts/validate/validate-locales.ts <slug>
 *   npx tsx scripts/validate/validate-locales.ts amish-secrets
 *
 * Aggiungi a package.json:
 *   "validate:locales": "npx tsx scripts/validate/validate-locales.ts"
 */

import { readFileSync, readdirSync } from "fs";
import { resolve } from "path";
import process from "process";

const DATA_DIR = resolve(__dirname, "..", "..", "data");

/**
 * Flatten a nested object into dot-notation paths.
 * Returns a set of paths like "nav.brand", "hero.title", "ui.labels.bestseller"
 */
function flattenKeys(obj: unknown, prefix = ""): Set<string> {
  const keys = new Set<string>();

  if (obj === null || obj === undefined) return keys;

  if (Array.isArray(obj)) {
    // For arrays, check the first element's structure as template
    if (obj.length > 0 && typeof obj[0] === "object") {
      const itemKeys = flattenKeys(obj[0], `${prefix}[]`);
      itemKeys.forEach((k) => keys.add(k));
    } else {
      keys.add(prefix);
    }
    return keys;
  }

  if (typeof obj !== "object") {
    keys.add(prefix);
    return keys;
  }

  const record = obj as Record<string, unknown>;
  const hasKeys = Object.keys(record).length > 0;

  if (!hasKeys) {
    keys.add(prefix);
    return keys;
  }

  for (const [key, value] of Object.entries(record)) {
    const path = prefix ? `${prefix}.${key}` : key;

    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      // Nested object — recurse
      const nested = flattenKeys(value, path);
      nested.forEach((k) => keys.add(k));
    } else if (Array.isArray(value)) {
      // Array — check first item if it's an object
      if (value.length > 0 && typeof value[0] === "object" && value[0] !== null) {
        const itemKeys = flattenKeys(value[0], `${path}[]`);
        itemKeys.forEach((k) => keys.add(k));
      } else {
        keys.add(path);
      }
    } else {
      keys.add(path);
    }
  }

  return keys;
}

function main() {
  const slug = process.argv[2];
  if (!slug) {
    console.error(`
Uso: npx tsx scripts/validate/validate-locales.ts <slug>

Esempi:
  npx tsx scripts/validate/validate-locales.ts amish-secrets

Aggiungi a package.json:
  "validate:locales": "npx tsx scripts/validate/validate-locales.ts"
`);
    process.exit(1);
  }

  const slugDir = resolve(DATA_DIR, slug);
  const enPath = resolve(slugDir, "en.json");

  // Check directory exists
  try {
    if (!readdirSync(slugDir)) {}
  } catch {
    console.error(`❌ Directory not found: ${slugDir}`);
    console.error(`   Esegui prima: npx tsx scripts/translate/extract-locales.ts ${slug}`);
    process.exit(1);
  }

  // Load reference (en.json)
  let enData: Record<string, unknown>;
  try {
    enData = JSON.parse(readFileSync(enPath, "utf-8"));
  } catch {
    console.error(`❌ en.json not found in ${slugDir}`);
    console.error(`   Esegui prima: npx tsx scripts/translate/extract-locales.ts ${slug}`);
    process.exit(1);
  }

  // Flatten reference keys
  const referenceKeys = flattenKeys(enData);
  console.log(`\n🔍 Validating locales for: ${slug}`);
  console.log(`   Reference (en.json): ${referenceKeys.size} keys\n`);

  // List all JSON files in the directory (excluding en.json)
  const files = readdirSync(slugDir)
    .filter((f) => f.endsWith(".json") && f !== "en.json")
    .sort();

  let totalErrors = 0;
  let totalFiles = 0;

  for (const file of files) {
    const filePath = resolve(slugDir, file);
    let localeData: Record<string, unknown>;

    try {
      localeData = JSON.parse(readFileSync(filePath, "utf-8"));
    } catch (e) {
      console.error(`   ❌ ${file}: invalid JSON (parse error)`);
      totalErrors++;
      continue;
    }

    const localeKeys = flattenKeys(localeData);
    const missing: string[] = [];

    for (const key of referenceKeys) {
      if (!localeKeys.has(key)) {
        missing.push(key);
      }
    }

    if (missing.length > 0) {
      totalErrors += missing.length;
      console.log(`   ❌ ${file}: ${missing.length} chiavi mancanti`);
      // Show first 5 missing keys
      missing.slice(0, 5).forEach((k) => console.log(`      - ${k}`));
      if (missing.length > 5) {
        console.log(`      ... e ${missing.length - 5} altre`);
      }
    } else {
      console.log(`   ✅ ${file}: OK (${localeKeys.size} keys)`);
    }
    totalFiles++;
  }

  console.log(`\n📊 Results: ${totalFiles} files checked, ${totalErrors > 0 ? `${totalErrors} errors` : "0 errors"}\n`);

  if (totalErrors > 0) {
    console.error(`❌ Validation FAILED — ${totalErrors} missing keys found.`);
    console.error(`   Fix by adding the missing keys to the locale JSON files.`);
    console.error(`   Or re-run: npx tsx scripts/translate/extract-locales.ts ${slug}`);
    process.exit(1);
  }

  console.log(`✅ All ${totalFiles} locale files validated successfully against en.json!`);
}

main();
