import { prisma } from "../src/lib/db/prisma";

async function main() {
  const slug = process.argv[2] || "amish-secrets";
  
  const product = await prisma.product.findUnique({ 
    where: { slug },
    include: { 
      translations: true,
      lessons: { 
        orderBy: { position: "asc" },
        include: { translations: true }
      }
    }
  });

  if (!product) {
    console.error(`Product "${slug}" not found`);
    process.exit(1);
  }

  console.log("=== PRODUCT ===");
  console.log(`ID: ${product.id}`);
  console.log(`Slug: ${product.slug}`);
  console.log(`Template: ${product.templateId}`);
  console.log(`Cover: ${product.coverUrl}`);
  console.log(`Price: ${product.price / 100}`);
  console.log(`PricesByCurrency: ${product.pricesByCurrency}`);
  console.log(`lemonVariantId: ${product.lemonVariantId}`);

  console.log("\n=== TRANSLATIONS ===");
  for (const t of product.translations) {
    console.log(`[${t.locale}] ${t.section}: ${t.content}`);
  }

  console.log("\n=== LESSONS ===");
  for (const lesson of product.lessons) {
    console.log(`\nLesson ${lesson.position} (${lesson.id}):`);
    for (const lt of lesson.translations) {
      console.log(`  [${lt.locale}] title: ${lt.title}`);
      console.log(`  [${lt.locale}] desc: ${lt.description || "(none)"}`);
      console.log(`  [${lt.locale}] video: ${lt.videoUrl || "(none)"}`);
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
