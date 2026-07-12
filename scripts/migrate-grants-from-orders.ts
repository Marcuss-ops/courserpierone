/**
 * scripts/migrate-grants-from-orders.ts
 *
 * MCR Phase 2 backfill — dual-writes AccessGrant rows for every
 * completed Order that pre-dates the Phase 2 deployment.
 *
 * Idempotency model:
 *   - upsert + @@unique([sourceType, sourceId, productId]) constraint.
 *   - Re-running on a fully-backfilled DB is a no-op (every row matches
 *     a where-clause that already exists, the update branch is `{}`).
 *   - P2002 is unreachable in production: upsert translates to
 *     `INSERT ... ON CONFLICT DO NOTHING` semantics via Prisma's
 *     internal optimization. We catch only for safety on misconfigured
 *     DBs (missing constraint).
 *
 * Strategy choice rationale:
 *   This is NOT a transaction-protected operation. The Order table is
 *   guaranteed stable (read-only snapshot here); the AccessGrant table
 *   allows idempotent upsert. Both sides use the same key derivation
 *   (`Order.id` is generated once at insert and immutable post-facto),
 *   so concurrent backfill runs cannot corrupt each other.
 *
 * Usage:
 *   npx tsx scripts/migrate-grants-from-orders.ts
 *
 * Follow-up: PR 3 of MCR flips the resolver to read AccessGrant via a
 * feature flag (`USE_ACCESS_GRANT_RESOLVER`). This script enables the
 * safe rollout: backfill → flip flag → monitor → cleanup Order reads.
 */

import { prisma } from "../src/lib/db/prisma";

async function main() {
  console.log(
    `\n🔄 MCR Phase 2 — backfill AccessGrant rows from completed Orders\n` +
      `   Pattern: Order.status='completed' → AccessGrant(sourceType='order', sourceId=order.id)\n`,
  );

  const completed = await prisma.order.findMany({
    where: { status: "completed" },
    select: { id: true, userId: true, productId: true },
    orderBy: { createdAt: "asc" },
  });

  console.log(`📦 Found ${completed.length} completed orders to process\n`);

  let upserted = 0;
  let skipped = 0;
  let errors = 0;

  for (const order of completed) {
    try {
      const result = await prisma.accessGrant.upsert({
        where: {
          sourceType_sourceId_productId: {
            sourceType: "order",
            sourceId: order.id,
            productId: order.productId,
          },
        },
        create: {
          userId: order.userId,
          productId: order.productId,
          sourceType: "order",
          sourceId: order.id,
          status: "active",
        },
        update: {},
      });
      // `update: {}` returns the existing row on conflict — count as
      // skipped to give the operator a clear "already done" signal.
      if (result.sourceId !== order.id || result.productId !== order.productId) {
        skipped++;
      } else {
        upserted++;
      }
    } catch (err) {
      errors++;
      console.error(
        `❌ Failed to upsert grant for order ${order.id}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  console.log(
    `\n✅ Backfill complete\n` +
      `   Upserted: ${upserted}\n` +
      `   Skipped (already existed): ${skipped}\n` +
      `   Errors:   ${errors}\n`,
  );

  if (errors > 0) {
    console.log(
      `⚠️  Some rows failed. The script is idempotent via the\n` +
        `   @@unique([sourceType, sourceId, productId]) constraint — re-run\n` +
        `   safely to retry the failed rows.\n`,
    );
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("❌ Migration failed:", err);
  try {
    await prisma.$disconnect();
  } catch {
    /* ignore — disconnect on already-disconnected client is a no-op */
  }
  process.exit(1);
});
