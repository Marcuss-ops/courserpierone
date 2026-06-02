/**
 * Update all import paths after lib/ reorganization.
 * Run: npx tsx scripts/update-imports.ts
 */
import fs from "fs";
import path from "path";

const ROOT = path.resolve(process.cwd());

const REPLACEMENTS: [RegExp, string][] = [
  [/@\/lib\/prisma/g, "@/lib/db/prisma"],
  [/@\/lib\/auth(?![\/\w-])/g, "@/lib/auth/auth"],
  [/@\/lib\/email/g, "@/lib/services/email"],
  [/@\/lib\/order-service/g, "@/lib/services/order-service"],
  [/@\/lib\/locale-resolver/g, "@/lib/i18n/locale-resolver"],
  [/@\/lib\/white-label-data/g, "@/lib/config/white-label-data"],
  [/@\/lib\/validations/g, "@/lib/utils/validations"],
  [/@\/lib\/stripe/g, "@/lib/payment/stripe"],
  [/@\/lib\/lemonsqueezy/g, "@/lib/payment/lemonsqueezy"],
  [/@\/lib\/generate-course-config/g, "@/lib/config/generate-course-config"],
  [/@\/lib\/supabase/g, "@/lib/db/supabase"],
  [/@\/lib\/sanitize/g, "@/lib/utils/sanitize"],
  [/@\/lib\/player-locale/g, "@/lib/i18n/player-locale"],
  [/@\/lib\/visitor-session/g, "@/lib/i18n/visitor-session"],
  [/@\/lib\/dashboard-data/g, "@/lib/utils/dashboard-data"],
  [/@\/lib\/api-types/g, "@/lib/utils/api-types"],
];

// Also update scripts/ relative imports
const SCRIPT_REPLACEMENTS: [RegExp, string][] = [
  [/from '\.\.\/src\/lib\/prisma'/g, "from '../src/lib/db/prisma'"],
  [/from '\.\.\/src\/lib\/generate-course-config'/g, "from '../src/lib/config/generate-course-config'"],
  [/from '\.\.\/src\/lib\/lemonsqueezy'/g, "from '../src/lib/payment/lemonsqueezy'"],
  [/from '\.\.\/src\/lib\/openai'/g, "from '../src/lib/openai'"],
];

function walkDir(dir: string): string[] {
  const files: string[] = [];
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!entry.name.startsWith("node_modules") && !entry.name.startsWith(".") && entry.name !== "_refs") {
        files.push(...walkDir(full));
      }
    } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      files.push(full);
    }
  }
  return files;
}

function updateFile(filePath: string, replacements: [RegExp, string][]): boolean {
  let content = fs.readFileSync(filePath, "utf-8");
  const original = content;
  for (const [pattern, replacement] of replacements) {
    content = content.replace(pattern, replacement);
  }
  if (content !== original) {
    fs.writeFileSync(filePath, content, "utf-8");
    return true;
  }
  return false;
}

// Walk src/ and update @/lib/ imports
const srcFiles = walkDir(path.join(ROOT, "src"));
let updated = 0;
for (const file of srcFiles) {
  if (updateFile(file, REPLACEMENTS)) {
    const rel = path.relative(ROOT, file);
    console.log(`  ✓ ${rel}`);
    updated++;
  }
}
console.log(`\n✅ Updated ${updated} files in src/`);

// Walk scripts/ and update relative imports
const scriptFiles = walkDir(path.join(ROOT, "scripts"));
let scriptUpdated = 0;
for (const file of scriptFiles) {
  if (updateFile(file, SCRIPT_REPLACEMENTS)) {
    const rel = path.relative(ROOT, file);
    console.log(`  ✓ ${rel}`);
    scriptUpdated++;
  }
}
console.log(`\n✅ Updated ${scriptUpdated} files in scripts/`);
