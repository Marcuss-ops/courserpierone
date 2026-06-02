import { prisma } from "../../src/lib/db/prisma";

async function main() {
  const product = await prisma.product.findUnique({ where: { slug: "amish-secrets" } });
  if (!product) {
    console.error("Product not found");
    process.exit(1);
  }

  // Parse existing prices or start fresh
  const existing = product.pricesByCurrency ? JSON.parse(product.pricesByCurrency) : {};

  // Merge with new currencies
  // EUR 1900 = €19.00 is the base price
  const prices = {
    ...existing,
    EUR: existing.EUR ?? { price: 1900, symbol: "€", currency: "EUR" },
    USD: existing.USD ?? { price: 2100, symbol: "$", currency: "USD" },
    GBP: { price: 1600, symbol: "£", currency: "GBP" },
    JPY: { price: 3100, symbol: "¥", currency: "JPY" },
    BRL: { price: 11500, symbol: "R$", currency: "BRL" },
    CAD: { price: 2800, symbol: "CA$", currency: "CAD" },
    AUD: { price: 3200, symbol: "A$", currency: "AUD" },
    CHF: { price: 1800, symbol: "CHF", currency: "CHF" },
    SEK: { price: 22000, symbol: "kr", currency: "SEK" },
    NOK: { price: 22000, symbol: "kr", currency: "NOK" },
    DKK: { price: 14000, symbol: "kr", currency: "DKK" },
    PLN: { price: 8500, symbol: "zł", currency: "PLN" },
    MXN: { price: 38000, symbol: "MX$", currency: "MXN" },
  };

  await prisma.product.update({
    where: { slug: "amish-secrets" },
    data: { pricesByCurrency: JSON.stringify(prices) },
  });

  console.log("✅ Prices updated with new currencies:");
  for (const [code, info] of Object.entries(prices)) {
    const p = info as { price: number; symbol: string };
    console.log(`  ${code}: ${p.symbol}${(p.price / 100).toFixed(2)}`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
