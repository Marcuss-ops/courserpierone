#!/usr/bin/env tsx
/**
 * Check Prices — Verifica i prezzi configurati per un prodotto.
 *
 * Uso:
 *   npx tsx scripts/products/check-prices.ts <slug>
 *   npx tsx scripts/products/check-prices.ts amish-secrets
 */

import { prisma } from "../../src/lib/db/prisma";

async function main() {
  const slug = process.argv[2] || "amish-secrets";

  const product = await prisma.product.findUnique({
    where: { slug },
    select: { pricesByCurrency: true, id: true, slug: true },
  });

  if (!product) {
    console.error(`❌ Product "${slug}" not found`);
    process.exit(1);
  }

  console.log(`\n📦 ${product.slug} (${product.id})`);
  console.log(`   PricesByCurrency:\n`);
  console.log(JSON.stringify(product.pricesByCurrency ? JSON.parse(product.pricesByCurrency) : null, null, 2));

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
