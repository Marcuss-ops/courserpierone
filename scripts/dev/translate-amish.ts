import { prisma } from "../../src/lib/db/prisma";

const PRODUCT_ID = "amish-id-1";

// ─── Traduzioni generate per FR, DE, ES ────────
const translations: { locale: string; section: string; content: string }[] = [
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

async function main() {
  console.log("Saving translations for Amish Secrets...\n");

  for (const t of translations) {
    await prisma.productTranslation.upsert({
      where: {
        productId_locale_section: {
          productId: PRODUCT_ID,
          locale: t.locale,
          section: t.section,
        },
      },
      update: { content: t.content },
      create: {
        productId: PRODUCT_ID,
        locale: t.locale,
        section: t.section,
        content: t.content,
      },
    });
    console.log(`  ✅ [${t.locale}] ${t.section}: saved`);
  }

  // Also add EN recensioni if missing
  try {
    await prisma.productTranslation.upsert({
      where: {
        productId_locale_section: {
          productId: PRODUCT_ID,
          locale: "en",
          section: "recensioni",
        },
      },
      update: { content: "Finally a book that teaches you to save with centuries-old wisdom." },
      create: {
        productId: PRODUCT_ID,
        locale: "en",
        section: "recensioni",
        content: "Finally a book that teaches you to save with centuries-old wisdom.",
      },
    });
    console.log("  ✅ [en] recensioni: saved");
  } catch {}

  console.log("\n✅ All translations saved successfully!");

  // Verify by reading back
  console.log("\n=== Verification ===");
  const saved = await prisma.productTranslation.findMany({
    where: { productId: PRODUCT_ID },
    orderBy: [{ locale: "asc" }, { section: "asc" }],
  });
  for (const s of saved) {
    console.log(`  [${s.locale}] ${s.section}: ${s.content.substring(0, 60)}...`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
