/**
 * scripts/analytics/backfill-purchase-productids.ts
 *
 * One-shot data migration for MCR Step 11 (analytics productId SSOT).
 *
 * Background: `AnalyticEvent.productId` is now a `Product.slug` string
 * (matches the pageview writer convention in
 * `src/components/course/analytics-tracker.tsx`). Pre-Step-11 the
 * `purchase` and `refund` writers used `Product.id` (CUID), which
 * broke funnel conversion rates because admin queries aggregate by
 * `productId = p.slug` and the purchase rows never matched.
 *
 * This script backfills historical rows:
 *   - `eventType IN ('purchase', 'refund')`
 *   - `productId` resolves to an existing `Product.id` (cuid)
 * Update sets `productId = Product.slug` for those rows.
 *
 * Idempotency: after the first run, no purchase/refund row matches
 * the cuid filter (`productId` is now a slug, never a cuid), so a
 * second run is a safe no-op. Print the affected-row count for ops
 * confirmation.
 *
 * Safety:
 *   - Refuses to run in production unless `ALLOW_PROD=1` is set.
 *   - Runs as a single atomic `UPDATE ... FROM` statement.
 *   - Logs the row count and asks for confirmation only in dry-run.
 *
 * Run:
 *   pnpm tsx scripts/analytics/backfill-purchase-productids.ts
 *   pnpm tsx scripts/analytics/backfill-purchase-productids.ts --dry-run
 *   ALLOW_PROD=1 pnpm tsx scripts/analytics/backfill-purchase-productids.ts
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

  // ── Step 1: count rows that would be affected ─────────────────
  // Cheap SELECT before the UPDATE — gives the operator a sanity
  // check before committing the change.
  const countResult = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM "AnalyticEvent" ae
    JOIN "Product" p ON p.id = ae."productId"
    WHERE ae."eventType" IN ('purchase', 'refund')
      AND ae."productId" ~ '^c[a-z0-9]{20,}$';
  `;
  const countable = Number(countResult[0]?.count ?? 0);

  console.log(
    `[backfill] ${
      DRY_RUN ? "DRY RUN — " : ""
    }${countable} AnalyticEvent rows of type purchase|refund have cuid productId.`,
  );

  if (countable === 0) {
    console.log("[backfill] Nothing to do. (Idempotent — already clean.)");
    return;
  }

  if (DRY_RUN) {
    console.log("[backfill] DRY RUN — skipping UPDATE.");
    return;
  }

  // ── Step 2: run the UPDATE ────────────────────────────────────
  // One atomic statement. The JOIN guards us against touching rows
  // whose productId doesn't resolve to a Product (orphan cuid),
  // which could happen if a product was hard-deleted between the
  // event and this migration.
  const result = await prisma.$executeRaw`
    UPDATE "AnalyticEvent" ae
    SET "productId" = p.slug
    FROM "Product" p
    WHERE p.id = ae."productId"
      AND ae."eventType" IN ('purchase', 'refund')
      AND ae."productId" ~ '^c[a-z0-9]{20,}$';
  `;

  console.log(
    `[backfill] Done. Rows updated: ${result}. (Funnel conversion rates should now reconcile correctly with pageview counts.)`,
  );
}

main()
  .catch((err) => {
    console.error("[backfill] FAILED:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
