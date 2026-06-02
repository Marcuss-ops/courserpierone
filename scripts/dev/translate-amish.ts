#!/usr/bin/env tsx
/**
 * Translate Product — Salva traduzioni manuali per un prodotto.
 *
 * Originariamente specifico per "amish-secrets", ora generalizzato.
 * Le traduzioni hardcodate qui sotto sono per il prodotto Amish Secrets;
 * per traduzioni AI usa invece scripts/products/batch-translate.ts
 *
 * Uso:
 *   npx tsx scripts/dev/translate-amish.ts <product-slug>
 *
 * Esempi:
 *   npx tsx scripts/dev/translate-amish.ts amish-secrets
 *   npx tsx scripts/dev/translate-amish.ts altro-prodotto
 *
 * Nota: per traduzioni massive via AI, usa batch-translate.ts:
 *   npx tsx scripts/products/batch-translate.ts <slug> <source-locale>
 */

import { prisma } from "../../src/lib/db/prisma";

const DEFAULT_SLUG = "amish-secrets";

// ─── Traduzioni predefinite (per amish-secrets) ─────────────
const TRANSLATIONS: { locale: string; section: string; content: string }[] = [
  // ── FRANÇAIS ──
  { locale: "fr", section: "titolo", content: "Amish Secrets : Comment vivre frugalement et gérer son argent" },
  { locale: "fr", section: "sottotitolo", content: "Découvrez les secrets de la vie frugale de la communauté Amish. Inclut des modules vidéo complets et des PDF téléchargeables." },
  { locale: "fr", section: "problema", content: "Fatigué de ne pas arriver à la fin du mois ? La société moderne nous pousse à la consommation excessive." },
  { locale: "fr", section: "storia", content: "Les Amish vivent des vies riches et épanouies en dépensant une fraction de ce que nous dépensons. Dans ce cours, nous vous révélons comment ils font." },
  { locale: "fr", section: "cta", content: "Commencer Maintenant" },
  { locale: "fr", section: "recensioni", content: "Enfin un livre qui vous apprend à économiser avec la sagesse des siècles." },

  // ── DEUTSCH ──
  { locale: "de", section: "titolo", content: "Amish Secrets: Wie man sparsam lebt und mit Geld umgeht" },
  { locale: "de", section: "sottotitolo", content: "Entdecken Sie die Geheimnisse des sparsamen Lebens der Amish-Gemeinschaft. Inklusive kompletter Videokurse und herunterladbarer PDFs." },
  { locale: "de", section: "problema", content: "Haben Sie es satt, bis zum Monatsende kaum über die Runden zu kommen? Die moderne Gesellschaft treibt uns zum übermäßigen Konsum." },
  { locale: "de", section: "storia", content: "Die Amish führen ein reiches und erfülltes Leben und geben dabei nur einen Bruchteil dessen aus, was wir ausgeben. In diesem Kurs zeigen wir Ihnen, wie sie das machen." },
  { locale: "de", section: "cta", content: "Jetzt Starten" },
  { locale: "de", section: "recensioni", content: "Endlich ein Buch, das Ihnen mit jahrhundertealter Weisheit beibringt, wie man spart." },

  // ── ESPAÑOL ──
  { locale: "es", section: "titolo", content: "Amish Secrets: Cómo vivir frugalmente y administrar el dinero" },
  { locale: "es", section: "sottotitolo", content: "Descubre los secretos de la vida frugal de la comunidad Amish. Incluye módulos de video completos y PDF descargables." },
  { locale: "es", section: "problema", content: "¿Cansado de llegar a fin de mes sin ahorros? La sociedad moderna nos empuja al consumo excesivo." },
  { locale: "es", section: "storia", content: "Los Amish viven vidas ricas y plenas gastando una fracción de lo que gastamos nosotros. En este curso te revelamos cómo lo hacen." },
  { locale: "es", section: "cta", content: "Comenzar Ahora" },
  { locale: "es", section: "recensioni", content: "Por fin un libro que te enseña a ahorrar con la sabiduría de los siglos." },
];

/**
 * Traduzioni extra opzionali per lingua inglese (aggiunte se mancanti).
 * Si applicano a qualsiasi prodotto.
 */
const EXTRA_EN: { section: string; content: string }[] = [
  { section: "recensioni", content: "Finally a book that teaches you to save with centuries-old wisdom." },
];

async function main() {
  const slug = process.argv[2] || DEFAULT_SLUG;

  console.log(`\n📦 Prodotto: ${slug}\n`);

  // Warn se lo slug non è quello predefinito (le traduzioni sono Amish-specific)
  if (slug !== DEFAULT_SLUG) {
    console.warn(`  ⚠️  Le traduzioni salvate sono quelle originali di "${DEFAULT_SLUG}".`);
    console.warn(`     Potrebbero non essere appropriate per "${slug}".`);
    console.warn(`     Per traduzioni AI: npx tsx scripts/products/batch-translate.ts ${slug} <source-locale>\n`);
  }

  // Trova prodotto per slug
  const product = await prisma.product.findUnique({ where: { slug } });
  if (!product) {
    console.error(`❌ Prodotto "${slug}" non trovato`);
    console.error(`\nProdotti disponibili:`);
    const products = await prisma.product.findMany({ select: { slug: true }, orderBy: { slug: "asc" } });
    for (const p of products) {
      console.error(`   - ${p.slug}`);
    }
    process.exit(1);
  }

  const productId = product.id;
  console.log(`   ID: ${productId}\n`);

  // Salva traduzioni
  let savedCount = 0;
  for (const t of TRANSLATIONS) {
    await prisma.productTranslation.upsert({
      where: {
        productId_locale_section: {
          productId,
          locale: t.locale,
          section: t.section,
        },
      },
      update: { content: t.content },
      create: {
        productId,
        locale: t.locale,
        section: t.section,
        content: t.content,
      },
    });
    savedCount++;
    console.log(`  ✅ [${t.locale}] ${t.section}: saved`);
  }

  // Aggiunge traduzioni EN extra se mancanti
  for (const en of EXTRA_EN) {
    await prisma.productTranslation.upsert({
      where: {
        productId_locale_section: {
          productId,
          locale: "en",
          section: en.section,
        },
      },
      update: { content: en.content },
      create: {
        productId,
        locale: "en",
        section: en.section,
        content: en.content,
      },
    });
    savedCount++;
    console.log(`  ✅ [en] ${en.section}: saved`);
  }

  console.log(`\n✅ ${savedCount} traduzioni salvate con successo!`);

  // Verifica leggendo dal DB
  console.log("\n=== Verifica ===");
  const saved = await prisma.productTranslation.findMany({
    where: { productId },
    orderBy: [{ locale: "asc" }, { section: "asc" }],
  });
  for (const s of saved) {
    const preview = s.content.length > 60 ? s.content.substring(0, 60) + "..." : s.content;
    console.log(`  [${s.locale}] ${s.section}: ${preview}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("❌ Errore:", e);
  process.exit(1);
});
