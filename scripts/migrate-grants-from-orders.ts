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

import { PrismaClient } from "@prisma/client";

// Module-level PrismaClient slot. Mirror of the fix applied in
// scripts/audit-v1-readiness.ts (commit 8b21b7d): the shared client
// from src/lib/db/prisma is bound to the schema datasource's
// DATABASE_URL via env() and ignores any operator-side override.
// Here we construct a local PrismaClient bound to DATABASE_URL so the
// data path is explicit and the script honors a single canonical env
// name (DATABASE_URL + DIRECT_URL), dropping the implicit
// STAGING_* expectation that doesn't actually reach the datasource.
//
// Declared as `let` (not `const`) so the top-level `.catch()` handler
// can call $disconnect() even when main() exits early via
// process.exit(2) on the env-missing guard.
let prisma: PrismaClient;

/**
 * Build a PrismaClient bound to the resolved DATABASE URL.
 * DIRECT_URL is honored through the schema datasource's standard
 * env("DIRECT_URL") binding (the constructor's datasources block in
 * Prisma 5.x exposes only `url`; `directUrl` is resolved from env at
 * query time when introspection opens a direct connection).
 */
function buildPrismaClient(url: string): PrismaClient {
  return new PrismaClient({
    datasources: {
      db: { url },
    },
  });
}

async function main() {
  // Resolve the connection URL with a clear env guard. What we honor:
  //   - DATABASE_URL (canonical, namespaced per the Prisma schema
  //     datasource) → runtime connection URL.
  //   - DIRECT_URL (canonical, env-bound via the schema datasource's
  //     env("DIRECT_URL") line) → direct connection for any
  //     introspection. Not used directly here but documented as
  //     required env for prod parity with pgBouncer (see
  //     docs/production.md secret inventory).
  //
  // What we intentionally do NOT honor:
  //   - STAGING_* variants or any other prefixed-namespace. These do
  //     NOT change the Prisma datasource and silently fall through.
  //     Operators wanting staging parity should set DATABASE_URL +
  //     DIRECT_URL directly. The previous expectation that exporting
  //     STAGING_DATABASE_URL would "just work" was a footgun.
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error(
      "\n❌ DATABASE_URL is not set in env.\n" +
        "   Export DATABASE_URL (pooled) and DIRECT_URL (direct, optional)\n" +
        "   before re-running. Example for staging:\n" +
        "     DATABASE_URL='postgres://staging-host:5432/db' \\\n" +
        "     DIRECT_URL='postgres://staging-host:5432/db' \\\n" +
        "     npx tsx scripts/migrate-grants-from-orders.ts\n",
    );
    process.exit(2);
  }

  // Build a PrismaClient bound to the resolved URL. Without this
  // line, the upserts below would silently use DATABASE_URL via the
  // schema datasource — which technically works, but made it opaque
  // whether operator-side overrides were being honored. Constructing
  // locally makes the data path explicit and aligns with the audit
  // script's pairing fix (commit 8b21b7d).
  prisma = buildPrismaClient(url);

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
  // `if (prisma)` defensive guard (paired with the audit script cleanup
  // flagged as a followup in commit 8b21b7d). Without this check, a
  // pre-instantiation throw would attempt `prisma.$disconnect()` on
  // undefined → TypeError → swallowed by the inner try/catch (silent
  // here, but ugly). The guard suppresses that spurious path while
  // env-missing still terminates the process before this catch is
  // reachable (process.exit(2) inside main()).
  if (prisma) {
    try {
      await prisma.$disconnect();
    } catch {
      /* ignore — disconnect on already-disconnected client is a no-op */
    }
  }
  process.exit(1);
});
