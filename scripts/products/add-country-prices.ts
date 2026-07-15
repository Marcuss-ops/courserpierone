/**
 * Add Country-Specific Price Overrides
 *
 * Imposta prezzi personalizzati per paesi specifici (es. Brasile più economico).
 * I prezzi per valuta (pricesByCurrency) rimangono come fallback per tutti gli altri paesi.
 *
 * Uso:
 *   npx tsx scripts/products/add-country-prices.ts <slug>
 *   npx tsx scripts/products/add-country-prices.ts amish-secrets
 *
 * Per sovrascrivere un paese specifico:
 *   COUNTRY=BR PRICE=9900 CURRENCY=BRL SYMBOL="R$" npx tsx scripts/products/add-country-prices.ts amish-secrets
 */

import { prisma } from "../../src/lib/db/prisma";

interface CountryPrice {
  currency: string;
  price: number;
  symbol?: string;
  lemonVariantId?: string | null;
}

type CountryOverrides = Record<string, CountryPrice>;

const DEFAULT_COUNTRY_PRICES: CountryOverrides = {
  // Mercati emergenti — prezzi adattati al potere d'acquisto locale (circa 5-7 EUR equivalenti)
  BR: { currency: "BRL", price: 3900, symbol: "R$" },
  IN: { currency: "INR", price: 49900, symbol: "₹" },
  MX: { currency: "MXN", price: 12000, symbol: "MX$" },
  AR: { currency: "ARS", price: 490000, symbol: "ARS$" }, // Argentinian Pesos (svalutato)
  TR: { currency: "TRY", price: 19900, symbol: "₺" },
  RU: { currency: "RUB", price: 49000, symbol: "₽" },
  CO: { currency: "COP", price: 2490000, symbol: "COP$" },
  UA: { currency: "UAH", price: 24900, symbol: "₴" },
  VN: { currency: "VND", price: 12900000, symbol: "₫" }, // zero-decimal currency in cents representation
  PK: { currency: "PKR", price: 149000, symbol: "₨" },
  EG: { currency: "EGP", price: 24900, symbol: "EGP" },
  ID: { currency: "IDR", price: 7900000, symbol: "Rp" }
};

async function main() {
  const slug = process.argv[2] || "amish-secrets";

  const overrideCountry = process.env.COUNTRY;

  const product = await prisma.product.findUnique({ where: { slug } });
  if (!product) {
    console.error(`❌ Prodotto "${slug}" non trovato`);
    const products = await prisma.product.findMany({ select: { slug: true }, orderBy: { slug: "asc" } });
    for (const p of products) {
      console.error(`   - ${p.slug}`);
    }
    process.exit(1);
  }

  // Parse existing overrides or start fresh
  const existing = product.countryOverrides ? JSON.parse(product.countryOverrides) as CountryOverrides : {};

  let overrides: CountryOverrides;

  if (overrideCountry) {
    // Single country override via env vars
    const price = parseInt(process.env.PRICE || "0", 10);
    const currency = process.env.CURRENCY || "";
    const symbol = process.env.SYMBOL;

    if (!price || !currency) {
      console.error(`❌ Specifica PRICE e CURRENCY per il paese ${overrideCountry}`);
      console.error(`   Es: COUNTRY=BR PRICE=9900 CURRENCY=BRL SYMBOL="R$" npx tsx ...`);
      process.exit(1);
    }

    overrides = {
      ...existing,
      [overrideCountry.toUpperCase()]: {
        currency: currency.toUpperCase(),
        price,
        symbol: symbol ?? undefined,
        lemonVariantId: process.env.LEMON_VARIANT_ID ?? existing[overrideCountry.toUpperCase()]?.lemonVariantId ?? null,
      },
    };
  } else {
    // Merge defaults with existing overrides (existing takes priority)
    overrides = { ...DEFAULT_COUNTRY_PRICES, ...existing };
  }

  await prisma.product.update({
    where: { slug },
    data: { countryOverrides: JSON.stringify(overrides) },
  });

  console.log(`✅ Country price overrides saved for "${slug}":\n`);
  for (const [country, info] of Object.entries(overrides)) {
    const sym = info.symbol || info.currency;
    console.log(`  ${country}: ${sym}${(info.price / 100).toFixed(2)} (${info.currency})`);
    if (info.lemonVariantId) console.log(`       Lemon Variant: ${info.lemonVariantId}`);
  }

  console.log(`\n📌 ${Object.keys(overrides).length} paesi configurati.`);
  console.log(`   Per altri paesi, usa pricesByCurrency come fallback.`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
