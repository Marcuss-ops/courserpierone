import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // 1. Find the product
  const product = await prisma.product.findUnique({
    where: { slug: "amish-secrets" },
  });

  if (!product) {
    console.error("❌ Product amish-secrets not found");
    process.exit(1);
  }

  console.log(`📦 Product found: ${product.slug}`);
  console.log(`   Current templateId: ${product.templateId}`);

  // 2. Update templateId if needed
  if (product.templateId !== "amish") {
    console.log(`   ⚠️  Updating templateId from "${product.templateId}" to "amish"...`);
    await prisma.product.update({
      where: { slug: "amish-secrets" },
      data: { templateId: "amish" },
    });
    console.log(`   ✅ templateId updated to "amish"`);
  } else {
    console.log(`   ✅ templateId is already "amish"`);
  }

  // 3. Check current cache
  const cache = await prisma.courseConfigCache.findUnique({
    where: { slug: "amish-secrets" },
  });

  if (cache) {
    const config = JSON.parse(cache.config);
    console.log(`\n📋 Current cache template: ${config.template}`);
    console.log(`   Cache version: ${cache.version}`);

    if (config.template !== "amish") {
      // 4. Force update the template in the cached config
      config.template = "amish";
      await prisma.courseConfigCache.update({
        where: { slug: "amish-secrets" },
        data: {
          config: JSON.stringify(config),
          version: { increment: 1 },
        },
      });
      console.log(`   ✅ Cache updated: template changed to "amish"`);
      console.log(`   New cache version: ${cache.version + 1}`);
    } else {
      console.log(`   ✅ Cache already has template "amish"`);
    }
  } else {
    console.log(`   ⚠️  No cache found — will be generated on next page load`);
  }

  console.log("\n🎉 Done! The site should now use the 'amish' template.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
