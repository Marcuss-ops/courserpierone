/**
 * Argos Translate — Bridge Node.js → Python Argos Translate
 *
 * Uso:
 *   npx tsx scripts/translate/argos-bridge.ts <source-locale> <target-locales...>
 *
 * Esempio:
 *   npx tsx scripts/translate/argos-bridge.ts it en fr de es
 *   npx tsx scripts/translate/argos-bridge.ts it en fr de es pt ja ko
 *
 * Installa prima:
 *   pip install argostranslate
 *
 * API Argos Translate v1.11.0:
 *   package.install()       → installa pacchetto lingua
 *   get_installed_languages() → lista lingue installate
 *   lang.get_translation(target) → oggetto traduzione
 *   translation.translate(text)  → testo tradotto
 */

import { execSync } from "child_process";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";

// ─── Config ─────────────────────────────────────────────────
const DATA_DIR = resolve(__dirname, "..", "..", "data");

/**
 * Genera script Python per tradurre con Argos Translate
 */
function makePythonScript(source: string, target: string, text: string): string {
  const escapedText = text
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "")
    .replace(/\t/g, "\\t");

  return `
import sys, json, os
os.environ["ARGOS_DEVICE_TYPE"] = "cpu"

try:
    import argostranslate.package
    import argostranslate.translate

    from_code = "${source}"
    to_code = "${target}"

    # Aggiorna indice
    argostranslate.package.update_package_index()
    avail = argostranslate.package.get_available_packages()

    # Trova e installa pacchetto
    pkg = next((p for p in avail if p.from_code == from_code and p.to_code == to_code), None)
    if pkg:
        installed = argostranslate.translate.get_installed_languages()
        fl = next((l for l in installed if l.code == from_code), None)
        tl = next((l for l in installed if l.code == to_code), None)
        if not fl or not tl:
            print(f"Downloading {from_code} -> {to_code}...", file=sys.stderr)
            pkg.install()

    # Traduci
    installed = argostranslate.translate.get_installed_languages()
    fl = next(l for l in installed if l.code == from_code)
    tl = next(l for l in installed if l.code == to_code)
    tr = fl.get_translation(tl)
    result = tr.translate("${escapedText}")
    print(result)
except Exception as e:
    print(json.dumps({"error": str(e)}), file=sys.stderr)
    sys.exit(1)
`;
}

/**
 * Traduce un singolo testo via Argos Translate
 */
function translateViaArgos(source: string, target: string, text: string): string {
  if (!text.trim() || text.length < 3) return text;

  const script = makePythonScript(source, target, text);
  const tempFile = resolve(__dirname, `_argos_${source}_${target}.py`);
  writeFileSync(tempFile, script, "utf-8");

  try {
    const output = execSync(`python "${tempFile}"`, {
      encoding: "utf-8",
      timeout: 120000,
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    });
    return output.trim();
  } catch (err: any) {
    const stderr = err.stderr?.toString() || "";
    console.error(`   ⚠️  Argos error (${source}→${target}): ${stderr.slice(0, 200)}`);
    return text; // fallback
  } finally {
    try {
      execSync(`del "${tempFile}" 2>nul || rm -f "${tempFile}" 2>/dev/null || true`);
    } catch {}
  }
}

/**
 * Traduce ricorsivamente tutte le stringhe in un oggetto JSON
 */
function translateObject(obj: any, source: string, target: string): any {
  if (typeof obj === "string") {
    if (!obj.trim() || obj.length < 3) return obj;
    if (/^[\d\s.,%€$£¥₩₹+\-/]+$/.test(obj)) return obj;
    if (obj.startsWith("http") || obj.startsWith("/") || obj.startsWith("#")) return obj;
    if (/^[\w.+-]+@[\w.-]+\.\w+$/.test(obj)) return obj;
    if (/^\{?[a-z_]+\}?$/.test(obj) && obj.length < 20) return obj;

    const translated = translateViaArgos(source, target, obj);
    return translated || obj;
  }
  if (Array.isArray(obj)) return obj.map((item) => translateObject(item, source, target));
  if (obj && typeof obj === "object") {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) result[key] = translateObject(value, source, target);
    return result;
  }
  return obj;
}

// ════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════

async function main() {
  const source = process.argv[2];
  const targets = process.argv.slice(3);

  if (!source || targets.length === 0) {
    console.error(`\nUso: npx tsx scripts/translate/argos-bridge.ts <source> <targets...>\n`);
    process.exit(1);
  }

  const productsDir = DATA_DIR;
  if (!existsSync(productsDir)) {
    console.error(`❌ Directory data/ non trovata. Esegui prima extract-locales.ts`);
    process.exit(1);
  }

  const products = execSync(`ls "${productsDir}" 2>/dev/null || dir "${productsDir}" /b /ad 2>nul || echo ""`, { encoding: "utf-8" })
    .split("\n").map((s) => s.trim()).filter(Boolean);

  if (products.length === 0) {
    console.error(`❌ Nessun prodotto trovato in ${productsDir}`);
    process.exit(1);
  }

  console.log(`\n📦 Prodotti: ${products.join(", ")}`);
  console.log(`🌐 Sorgente: ${source} → Target: ${targets.join(", ")}\n`);

  for (const slug of products) {
    const srcFile = resolve(productsDir, slug, `${source}.json`);
    if (!existsSync(srcFile)) {
      console.warn(`   ⚠️  ${slug}: ${source}.json non trovato`);
      continue;
    }

    const data = JSON.parse(readFileSync(srcFile, "utf-8"));
    console.log(`📄 ${slug}:`);

    for (const target of targets) {
      if (target === source) continue;
      const outFile = resolve(productsDir, slug, `${target}.json`);
      if (existsSync(outFile)) {
        console.log(`   ⏭️  ${target}.json esiste già`);
        continue;
      }

      console.log(`   🔄 ${target}...`);
      try {
        const translated = translateObject(data, source, target);
        mkdirSync(dirname(outFile), { recursive: true });
        writeFileSync(outFile, JSON.stringify(translated, null, 2), "utf-8");
        console.log(`   ✅ ${target}.json creato`);
      } catch (err: any) {
        console.error(`   ❌ ${target}: ${err.message?.slice(0, 150)}`);
      }
    }
  }

  console.log(`\n✅ Fatto!\n`);
}

main().catch((err) => { console.error(err); process.exit(1); });
