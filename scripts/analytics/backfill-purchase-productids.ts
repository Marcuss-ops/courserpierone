/**
 * Backfill legacy purchase/refund analytics product identities.
 *
 * Canonical fields:
 *   productId         = Product.id
 *   productSlug       = Product.slug
 *   providerProductId = external provider product/variant ID
 *
 * The schema migration repairs all historical event types. This utility is
 * intentionally scoped to purchase/refund rows for operators who need an
 * explicit, repeatable repair after deployment.
 *
 * It is idempotent, uses one transaction, and refuses production unless
 * ALLOW_PROD=1 is set.
 */

import { prisma } from "@/lib/db/prisma";

const DRY_RUN = process.argv.includes("--dry-run");
const ALLOW_PROD = process.env.ALLOW_PROD === "1";

async function main() {
  if (process.env.NODE_ENV === "production" && !ALLOW_PROD) {
    throw new Error(
      "[backfill] Refusing to run in production. Set ALLOW_PROD=1 to override.",
    );
  }

  const countResult = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count
    FROM "AnalyticEvent" ae
    LEFT JOIN "Product" by_id ON by_id.id = ae."productId"
    LEFT JOIN "Product" by_slug ON by_slug.slug = ae."productId"
    WHERE ae."eventType" IN ('purchase', 'refund')
      AND ae."productSlug" IS NULL
      AND (by_id.id IS NOT NULL OR by_slug.id IS NOT NULL);
  `;
  const countable = Number(countResult[0]?.count ?? 0);

  console.log(
    `[backfill] ${DRY_RUN ? "DRY RUN — " : ""}${countable} purchase/refund rows need identity normalization.`,
  );
  if (countable === 0 || DRY_RUN) {
    if (DRY_RUN) console.log("[backfill] DRY RUN — skipping UPDATE.");
    return;
  }

  const result = await prisma.$transaction(async (tx) => {
    const byInternalId = await tx.$executeRaw`
      UPDATE "AnalyticEvent" ae
      SET "productSlug" = p.slug
      FROM "Product" p
      WHERE ae."productId" = p.id
        AND ae."eventType" IN ('purchase', 'refund')
        AND ae."productSlug" IS NULL;
    `;
    const byLegacySlug = await tx.$executeRaw`
      UPDATE "AnalyticEvent" ae
      SET "productId" = p.id,
          "productSlug" = p.slug
      FROM "Product" p
      WHERE ae."productId" = p.slug
        AND ae."eventType" IN ('purchase', 'refund')
        AND ae."productSlug" IS NULL;
    `;
    return Number(byInternalId) + Number(byLegacySlug);
  });

  console.log(`[backfill] Done. Rows normalized: ${result}.`);
}

main()
  .catch((err) => {
    console.error("[backfill] FAILED:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
