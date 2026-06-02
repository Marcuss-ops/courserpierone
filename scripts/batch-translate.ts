/**
 * Batch Translate — Traduzione massiva di un prodotto in 10+ lingue via LLM
 *
 * Uso:
 *   npx tsx scripts/batch-translate.ts <product-slug> [source-locale] [target-locales...]
 *
 * Esempi:
 *   npx tsx scripts/batch-translate.ts amish-secrets
 *   npx tsx scripts/batch-translate.ts amish-secrets en fr de es pt ja
 *   npx tsx scripts/batch-translate.ts amish-secrets it fr de es pt ja ko zh ar hi
 *
 * Se target-locales non è specificato, usa il default set (12 lingue globali).
 */

import { prisma } from "../src/lib/db/prisma";
import { getOpenAI } from "../src/lib/openai";

// ─── Config ─────────────────────────────────────────────────
const DEFAULT_LOCALES = [
  "en", "fr", "de", "es", "pt", "nl", "pl",
  "ja", "ko", "zh", "ar", "hi", "tr", "vi",
  "th", "id", "sv", "da", "no", "fi", "cs",
  "ro", "hu", "el", "he", "ru", "uk",
];

const SECTIONS = [
  "titolo",
  "sottotitolo",
  "problema",
  "storia",
  "cta",
  "recensioni",
  "bonus",
  "garanzia",
] as const;

type Section = (typeof SECTIONS)[number];

interface TranslationBatch {
  productId: string;
  sourceLocale: string;
  targetLocales: string[];
  sections: Record<Section, string>;
  uiAll?: string; // JSON string of ui_all
}

// ─── Helpers ────────────────────────────────────────────────

function validateLocale(locale: string): boolean {
  return /^[a-z]{2}(-[a-z]{2,4})?$/.test(locale);
}

// ─── Traduci via GPT ───────────────────────────────────────

async function translateBatch(
  batch: TranslationBatch,
): Promise<Record<string, Record<string, string>>> {
  const { sourceLocale, targetLocales, sections, uiAll } = batch;

  // Prepara il contenuto: testo sezioni + UI
  const sectionsText = Object.entries(sections)
    .filter(([, v]) => v && v.trim().length > 0)
    .map(([key, val]) => `[${key}]\n${val}`)
    .join("\n\n");

  let uiSection = "";
  if (uiAll) {
    try {
      const ui = JSON.parse(uiAll);
      uiSection = `\n\n[ui_all - TRANSLATE ALL STRINGS IN THIS JSON, keeping the structure intact]\n${JSON.stringify(ui, null, 2)}`;
    } catch {
      uiSection = `\n\n[ui_all]\n${uiAll}`;
    }
  }

  const fullText = sectionsText + uiSection;

  const prompt = `Sei un traduttore professionale specializzato in marketing e vendite online.

Traduci il seguente contenuto di una landing page in TUTTE le lingue richieste.

REGOLE:
- Mantieni lo stesso tono persuasivo e coinvolgente dell'originale
- Adatta espressioni idiomatiche alla cultura di destinazione
- Non tradurre: nomi di prodotti, marchi, URL, numeri
- Per [ui_all]: traduci TUTTI i valori stringa mantenendo la struttura JSON identica
- Output: un oggetto JSON dove ogni chiave è un codice lingua, e ogni valore è un oggetto con le stesse chiavi dell'input

Lingua sorgente: ${sourceLocale}
Lingue target: ${targetLocales.join(", ")}

CONTENUTO DA TRADURRE:
${fullText}

Rispondi SOLO con il JSON valido, senza markdown.`;

  const response = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    temperature: 0.3,
    max_tokens: 16000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("Empty response from AI");

  const parsed = JSON.parse(content) as Record<string, Record<string, string>>;
  return parsed;
}

// ─── Salva traduzioni su DB ────────────────────────────────

async function saveTranslations(
  productId: string,
  sourceLocale: string,
  translations: Record<string, Record<string, string>>,
  sourceSections: Record<Section, string>,
  sourceUiAll?: string,
): Promise<{ locale: string; sections: number; uiAll: boolean }[]> {
  const results: { locale: string; sections: number; uiAll: boolean }[] = [];

  for (const [locale, data] of Object.entries(translations)) {
    if (locale === sourceLocale) continue;

    let savedCount = 0;

    // Salva sezioni testuali
    for (const section of SECTIONS) {
      const translatedText = data[section]?.trim();
      if (translatedText && sourceSections[section]?.trim()) {
        await prisma.productTranslation.upsert({
          where: {
            productId_locale_section: {
              productId,
              locale,
              section,
            },
          },
          update: { content: translatedText },
          create: {
            productId,
            locale,
            section,
            content: translatedText,
          },
        });
        savedCount++;
      }
    }

    // Salva UI all
    let uiSaved = false;
    const uiRaw = data["ui_all"];
    if (uiRaw && sourceUiAll) {
      try {
        JSON.parse(uiRaw); // valida che sia JSON valido
        await prisma.productTranslation.upsert({
          where: {
            productId_locale_section: {
              productId,
              locale,
              section: "ui_all",
            },
          },
          update: { content: uiRaw },
          create: {
            productId,
            locale,
            section: "ui_all",
            content: uiRaw,
          },
        });
        uiSaved = true;
      } catch {
        console.warn(`⚠️  ui_all per ${locale} non è JSON valido, saltato`);
      }
    }

    results.push({ locale, sections: savedCount, uiAll: uiSaved });
    console.log(`  ✓ ${locale}: ${savedCount} sezioni${uiSaved ? " + UI" : ""}`);
  }

  return results;
}

// ════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════

async function main() {
  const slug = process.argv[2];
  if (!slug) {
    console.error(`
Uso: npx tsx scripts/batch-translate.ts <product-slug> [source-locale] [target-locales...]

Esempi:
  npx tsx scripts/batch-translate.ts amish-secrets              # default 27 lingue, source=it
  npx tsx scripts/batch-translate.ts amish-secrets en fr de es  # source=en, 4 lingue
`);
    process.exit(1);
  }

  const sourceLocale = process.argv[3] || "it";
  const targetLocales = process.argv.length > 4
    ? process.argv.slice(4).filter((l) => l !== sourceLocale)
    : DEFAULT_LOCALES.filter((l) => l !== sourceLocale);

  // Valida
  if (!validateLocale(sourceLocale)) {
    console.error(`❌ Locale sorgente non valido: ${sourceLocale}`);
    process.exit(1);
  }
  for (const l of targetLocales) {
    if (!validateLocale(l)) {
      console.error(`❌ Locale target non valido: ${l}`);
      process.exit(1);
    }
  }

  console.log(`\n📦 Prodotto: ${slug}`);
  console.log(`   Sorgente: ${sourceLocale}`);
  console.log(`   Target:   ${targetLocales.join(", ")}`);
  console.log(`   N. lingue: ${targetLocales.length}\n`);

  // Leggi prodotto
  const product = await prisma.product.findUnique({
    where: { slug },
    include: {
      translations: {
        where: { locale: sourceLocale },
      },
    },
  });

  if (!product) {
    console.error(`❌ Prodotto "${slug}" non trovato`);
    process.exit(1);
  }

  // Costruisci mappa sezioni sorgente
  const sourceSections: Record<string, string> = {};
  for (const t of product.translations) {
    sourceSections[t.section] = t.content;
  }

  const missingSections = SECTIONS.filter((s) => !sourceSections[s]);
  if (missingSections.length > 0) {
    console.warn(`⚠️  Sezioni mancanti in ${sourceLocale}: ${missingSections.join(", ")}`);
  }

  const existingSections = SECTIONS.filter((s) => sourceSections[s]);
  if (existingSections.length === 0) {
    console.error(`❌ Nessuna sezione trovata per ${sourceLocale}`);
    process.exit(1);
  }

  const sections: Record<Section, string> = {} as Record<Section, string>;
  for (const s of existingSections) {
    sections[s] = sourceSections[s];
  }

  const uiAll = sourceSections["ui_all"];

  console.log(`📝 Sezioni da tradurre: ${existingSections.join(", ")}`);
  if (uiAll) console.log(`🎨 UI incluse (ui_all): ${uiAll.length} caratteri`);
  console.log("");

  // Traduci in batch (GPT gestisce fino a 27 lingue in una chiamata)
  const batch: TranslationBatch = {
    productId: product.id,
    sourceLocale,
    targetLocales,
    sections,
    uiAll,
  };

  console.log(`🤖 Traduzione in corso (${targetLocales.length} lingue)...`);

  try {
    const translations = await translateBatch(batch);

    console.log(`\n💾 Salvataggio su DB...`);
    const results = await saveTranslations(
      product.id,
      sourceLocale,
      translations,
      sections,
      uiAll,
    );

    const totalSections = results.reduce((acc, r) => acc + r.sections, 0);
    const totalUi = results.filter((r) => r.uiAll).length;

    console.log(`\n✅ Completato!`);
    console.log(`   Lingue tradotte:  ${results.length}`);
    console.log(`   Sezioni salvate:  ${totalSections}`);
    if (totalUi > 0) console.log(`   UI tradotte:      ${totalUi}`);
    console.log(`\n   Target: ${results.map((r) => r.locale).join(", ")}`);

    // Suggerisci generazione config
    console.log(`\n👉 Ora rigenera la config con:`);
    console.log(`   npx tsx scripts/generate.ts ${slug}`);

  } catch (error) {
    console.error(`\n❌ Errore durante la traduzione:`, error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
