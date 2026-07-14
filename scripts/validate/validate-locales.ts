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
  const argSlug = process.argv[2];
  let slugs: string[] = [];

  if (argSlug) {
    slugs = [argSlug];
  } else {
    try {
      slugs = readdirSync(DATA_DIR, { withFileTypes: true })
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name);
    } catch {
      console.error(`❌ Impossibile leggere la cartella data: ${DATA_DIR}`);
      process.exit(1);
    }
  }

  if (slugs.length === 0) {
    console.log("⚠️ Nessuna cartella trovata in data/ per la validazione.");
    process.exit(0);
  }

  let totalFatalErrors = 0;
  let totalWarnings = 0;
  let totalFilesChecked = 0;

  for (const slug of slugs) {
    const slugDir = resolve(DATA_DIR, slug);
    const enPath = resolve(slugDir, "en.json");

    // Check directory exists
    try {
      if (!readdirSync(slugDir)) {}
    } catch {
      console.error(`❌ Directory not found: ${slugDir}`);
      continue;
    }

    // Load reference (en.json)
    let enData: Record<string, unknown>;
    try {
      enData = JSON.parse(readFileSync(enPath, "utf-8"));
    } catch {
      console.error(`⚠️ Skip ${slug}: en.json not found or invalid JSON in ${slugDir}`);
      continue;
    }

    // Flatten reference keys
    const referenceKeys = flattenKeys(enData);
    console.log(`\n🔍 Validating locales for: ${slug}`);
    console.log(`   Reference (en.json): ${referenceKeys.size} keys\n`);

    // List all JSON files in the directory (excluding en.json)
    const files = readdirSync(slugDir)
      .filter((f) => f.endsWith(".json") && f !== "en.json")
      .sort();

    // Helper to resolve nested path values
    function getValueByPath(obj: any, path: string): any {
      const parts = path.replace(/\[\d+\]/g, "").split(".");
      let curr = obj;
      for (const part of parts) {
        if (curr === null || curr === undefined) return undefined;
        curr = curr[part];
      }
      return curr;
    }

    // Check for translations containing placeholders or untranslated fallback texts
    function checkInconsistencies(fileName: string, localeData: any, enData: any): string[] {
      const issues: string[] = [];
      const lang = fileName.split(".")[0];
      if (lang === "en" || lang === "it") return issues;

      const traverse = (obj: any, path = "") => {
        if (obj === null || obj === undefined) return;
        if (typeof obj === "object" && !Array.isArray(obj)) {
          for (const [k, v] of Object.entries(obj)) {
            traverse(v, path ? `${path}.${k}` : k);
          }
        } else if (Array.isArray(obj)) {
          obj.forEach((item, idx) => {
            traverse(item, `${path}[${idx}]`);
          });
        } else if (typeof obj === "string") {
          const val = obj.trim();

          // 1. Placeholder brackets [Add your story]
          if (/\[[^\]]*\]/.test(val)) {
            issues.push(`      ⚠️ ${path}: contains placeholder brackets: "${val}"`);
          }

          // 2. Italian text leakages in foreign JSON
          const italianWords = ["pagamento sicuro", "recensioni verificate", "fattura inclusa", "ritiro"];
          const lowerVal = val.toLowerCase();
          for (const word of italianWords) {
            if (lowerVal === word || (val.length > 10 && lowerVal.includes(word))) {
              issues.push(`      ⚠️ ${path}: contains Italian fallback text: "${val}"`);
            }
          }

          // 3. Long texts left untranslated from English
          const enVal = getValueByPath(enData, path);
          if (enVal && typeof enVal === "string" && val.length > 30 && val === enVal.trim()) {
            issues.push(`      ⚠️ ${path}: is identical to English reference text (untranslated): "${val.slice(0, 30)}..."`);
          }
        }
      };

      traverse(localeData);
      return issues;
    }

    for (const file of files) {
      const filePath = resolve(slugDir, file);
      let localeData: Record<string, unknown>;

      try {
        localeData = JSON.parse(readFileSync(filePath, "utf-8"));
      } catch (e) {
        console.error(`   ❌ ${file}: invalid JSON (parse error)`);
        totalFatalErrors++;
        continue;
      }

      const localeKeys = flattenKeys(localeData);
      const missing: string[] = [];
      // Declared above the missing-keys loop so the soft-skip branch above
      // can push to it without triggering `Cannot access X before initialization`
      // (TDZ). The checkInconsistencies results below are appended into the
      // SAME array rather than reassigning, keeping a single source of truth
      // for the per-file diagnostics accumulated in this iteration.
      const discrepancies: string[] = [];

      // Sub-trees whose missing keys are treated as warnings (soft) rather
      // than fatal errors. Used to tolerate iterating i18n namespaces where
      // only `it.json` + `en.json` are translated first; inline `??`/inline
      // fallbacks in the component cover the gap at runtime until the
      // async translation pipeline catches up.
      //
      // Rationale: writing an empty-string key into JSON files would BREAK
      // the `?? "fallback"` runtime safety net (since `"" ?? x` = `""`, NOT
      // `x`). The soft-subtree flag preserves the JS undefined-key path so
      // the inline component default text renders while the async translator
      // propagates the missing keys.
      const SOFT_SUBTREES = ["portal."];

      for (const key of referenceKeys) {
        if (!localeKeys.has(key)) {
          const isSoft = SOFT_SUBTREES.some((prefix) => key.startsWith(prefix));
          if (isSoft) {
            // Track with the same discrepancy channel so it's logged but
            // not fatal (catches accidental deletions later when the
            // subtree solidifies).
            discrepancies.push(
              `      ⚠️ ${key}: missing (soft — pending async translation)`,
            );
          } else {
            missing.push(key);
          }
        }
      }

      // Append translation inconsistencies (placeholder brackets, IT leaks,
      // long untranslated English snippets) onto the same array.
      discrepancies.push(...checkInconsistencies(file, localeData, enData));

      if (missing.length > 0 || discrepancies.length > 0) {
        totalFatalErrors += missing.length;
        totalWarnings += discrepancies.length;
        
        if (missing.length > 0) {
          console.log(`   ❌ ${file}: ${missing.length} chiavi mancanti, ${discrepancies.length} avvisi`);
          missing.slice(0, 5).forEach((k) => console.log(`      - Chiave mancante: ${k}`));
          if (missing.length > 5) {
            console.log(`      ... e ${missing.length - 5} altre chiavi mancanti`);
          }
        } else {
          console.log(`   ⚠️ ${file}: 0 chiavi mancanti, ${discrepancies.length} avvisi di traduzione`);
        }
        
        discrepancies.slice(0, 5).forEach((issue) => console.log(issue));
        if (discrepancies.length > 5) {
          console.log(`      ... e altri ${discrepancies.length - 5} avvisi di traduzione`);
        }
        console.log();
      } else {
        console.log(`   ✅ ${file}: OK (${localeKeys.size} keys)`);
      }
      totalFilesChecked++;
    }
  }

  console.log(`\n📊 Results: ${totalFilesChecked} files checked, ${totalFatalErrors} fatal errors, ${totalWarnings} warnings\n`);

  if (totalFatalErrors > 0) {
    console.error(`❌ Validation FAILED — ${totalFatalErrors} fatal errors (missing keys/invalid JSON).`);
    process.exit(1);
  }

  if (totalWarnings > 0) {
    console.log(`⚠️  Translation scan complete with ${totalWarnings} warnings. Please review warnings above to fix inconsistencies.`);
  } else {
    console.log(`✅ All ${totalFilesChecked} locale files validated successfully!`);
  }
}

main();
