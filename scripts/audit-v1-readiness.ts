/**
 * scripts/audit-v1-readiness.ts
 *
 * Read-only Prisma-based V1 readiness audit. Gates the future DB
 * cleanup operations by reporting 3 structural counters:
 *
 *   (a) **Orphan products** (Product.creatorId IS NULL)
 *       → gates the `20260712210000_creator_id_required_restrict`
 *         migration (NOT NULL + Restrict FK).
 *       → recovery: scripts/products/backfill-primary-creator.ts
 *
 *   (b) **Active Stripe orders**
 *       (paymentProvider='stripe' AND status IN ('pending','completed'))
 *       → gates the dual-provider collapse (refund or migrate to
 *         Lemon Squeezy before the Stripe codepath is removed).
 *
 *   (c) **NextAuth residual row counts**
 *       (Account + Session + VerificationToken)
 *       → gates the `20260712220000_drop_nextauth_models` migration
 *         (residual rows should be archived or purged before
 *         DROP TABLE).
 *       → uses raw SQL via $queryRaw because the typed Prisma client
 *         has already dropped these models (commit 8641081). Each
 *         count returns -1 as a sentinel if the table was already
 *         dropped (post-cleanup → both "absent" and "0" are GREEN).
 *
 * All queries are read-only. The script also emits 3 sanity baselines
 * (Total products/orders/users), a gate decision (GREEN / YELLOW/RED),
 * a DBS-empty sanity warning when run against production, and a
 * machine-readable JSON line at the end for pipelines.
 *
 * DRY-RUN. No mutations. No secrets emitted.
 *
 * Conventions:
 *   - Mirrors scripts/diagnose-messaging.ts (top-level main + .catch exit).
 *   - Always calls `prisma.$disconnect()` on success path.
 *   - Never writes — pure read-only.
 *   - Exit codes: 0 on success, 1 on runtime error, 2 on missing env.
 *
 * Usage:
 *   npx tsx scripts/audit-v1-readiness.ts
 *   PRIMARY_DATABASE_URL='postgres://user:pwd@host:5432/db' \
 *     npx tsx scripts/audit-v1-readiness.ts
 *   PRIMARY_DATABASE_URL='postgres://user:pwd@host:5432/db' \
 *     npx tsx scripts/audit-v1-readiness.ts --production
 */

import { prisma } from "../src/lib/db/prisma";

// ─── Types ────────────────────────────────────────────────────────

interface AuditReport {
  source: "PRIMARY_DATABASE_URL" | "DATABASE_URL";
  timestamp: string;
  // Gate counters:
  orphanProducts: number;
  activeStripeOrders: number;
  residualNextAuth: {
    account: number; // -1 = table absent (post-drop)
    session: number; // -1 = table absent (post-drop)
    verificationToken: number; // -1 = table absent (post-drop)
  };
  // Sanity baselines (not blockers):
  totalProducts: number;
  totalOrders: number;
  totalUsers: number;
  // Gate decision:
  blockers: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────

/**
 * Resolve `PRIMARY_DATABASE_URL` (preferred — direct connection, full
 * privilege) or fall back to `DATABASE_URL` (pooled connection). Returns
 * the LABEL only — never echoes the URL value.
 */
function resolveConnectionSource(): {
  url: string;
  label: "PRIMARY_DATABASE_URL" | "DATABASE_URL";
} {
  const primary = process.env.PRIMARY_DATABASE_URL?.trim();
  if (primary) return { url: primary, label: "PRIMARY_DATABASE_URL" };
  const fallback = process.env.DATABASE_URL?.trim();
  if (!fallback) return { url: "", label: "PRIMARY_DATABASE_URL" };
  return { url: fallback, label: "DATABASE_URL" };
}

/**
 * Run `SELECT COUNT(*) FROM "<tableName>"` via raw SQL. Forward-compatible
 * with post-cleanup schema states where the Account/Session/
 * VerificationToken models no longer exist on the typed Prisma client.
 *
 * SQL-injection protection: argument is whitelisted through `allowedTables`
 * before splicing into the raw query (no user input ever reaches this fn).
 *
 * Returns:
 *   - N (≥0) if the table exists in PG.
 *   - -1 as a sentinel if the table does NOT exist (post-migration).
 */
async function safeTableCount(tableName: string): Promise<number> {
  const allowedTables = ["Account", "Session", "VerificationToken"];
  if (!allowedTables.includes(tableName)) {
    throw new Error(
      `safeTableCount called with non-allowlist table: ${tableName}`,
    );
  }
  try {
    const rows = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count FROM "${tableName}"
    `;
    return Number(rows[0]?.count ?? 0);
  } catch {
    // Post-migration: the table was dropped by
    // `20260712220000_drop_nextauth_models`. Treat as "absent" — both
    // -1 (absent) and 0 (present, empty) pass the gate.
    return -1;
  }
}

// ─── Main ─────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const IS_PRODUCTION =
    process.argv.includes("--production") ||
    process.env.NODE_ENV === "production";

  const { url, label } = resolveConnectionSource();
  if (!url) {
    console.error(
      "\n❌ Neither PRIMARY_DATABASE_URL nor DATABASE_URL is set in env.\n" +
        "   Set one of them (PRIMARY_DATABASE_URL preferred — direct\n" +
        "connection, full privilege) and re-run.\n",
    );
    process.exit(2);
  }

  console.log(
    `\n==== V1 Readiness Audit (read-only DRY-RUN) ====\n` +
      `Source:    ${label}\n` +
      `Timestamp: ${new Date().toISOString()}\n` +
      `Mode:      ${IS_PRODUCTION ? "production (DBS-empty guard active)" : "dev/preview (DBS-empty guard silent)"}\n`,
  );

  // Run all gate counters + sanity baselines + NextAuth residuals in parallel.
  const [
    // (a) Orphan products
    orphanProducts,
    // (b) Active Stripe orders
    activeStripeOrders,
    // (c) NextAuth residuals — via raw SQL because the typed Prisma
    // client no longer exposes these models (commit 8641081).
    accountCount,
    sessionCount,
    verificationTokenCount,
    // Sanity baselines
    totalProducts,
    totalOrders,
    totalUsers,
  ] = await Promise.all([
    prisma.product.count({ where: { creatorId: null } as any }),
    prisma.order.count({
      where: {
        paymentProvider: "stripe",
        status: { in: ["pending", "completed"] },
      },
    }),
    safeTableCount("Account"),
    safeTableCount("Session"),
    safeTableCount("VerificationToken"),
    prisma.product.count(),
    prisma.order.count(),
    prisma.user.count(),
  ]);

  console.log(`\n📊 V1 BLOCKER COUNTERS (these gate the DB cleanups)\n`);

  console.log(
    `   🛒  ORPHAN PRODUCTS (Product.creatorId IS NULL)\n` +
      `        count: ${orphanProducts}` +
      (orphanProducts === 0
        ? `  ✓ (post-migration always-0 expected — see migration\n` +
          `              \`20260712210000_creator_id_required_restrict\`,\n` +
          `              schema enforces NOT NULL + Restrict FK)\n`
        : `\n`) +
      `        gate:  must be 0 before applying migration\n` +
      `              \`20260712210000_creator_id_required_restrict\`\n` +
      `              (NOT NULL + Restrict FK on user.creatorId).\n` +
      `        recovery: scripts/products/backfill-primary-creator.ts\n`,
  );

  console.log(
    `   💳  ACTIVE STRIPE ORDERS (paymentProvider='stripe' AND status IN ('pending','completed'))\n` +
      `        count: ${activeStripeOrders}\n` +
      `        gate:  must be 0 before collapsing the dual-provider\n` +
      `              code path (refund or migrate to Lemon Squeezy\n` +
      `              first).\n`,
  );

  const fmtNextAuth = (n: number) =>
    n === -1
      ? `${n}  (table absent — post-cleanup, ✓ — migration\n   \`20260712220000_drop_nextauth_models\` already applied)`
      : `${n}`;

  console.log(
    `   🔐  RESIDUAL NEXTAUTH ROWS\n` +
      `        Account:             ${fmtNextAuth(accountCount)}\n` +
      `        Session:             ${fmtNextAuth(sessionCount)}\n` +
      `        VerificationToken:   ${fmtNextAuth(verificationTokenCount)}\n` +
      `        gate:  each must be 0 (or table absent post-drop)\n` +
      `              before applying migration\n` +
      `              \`20260712220000_drop_nextauth_models\` (or they\n` +
      `              should be archived to cold storage first).\n`,
  );

  console.log(`\n📊 SANITY BASELINES (not blockers)\n`);
  console.log(`     Total products: ${totalProducts}`);
  console.log(`     Total orders:   ${totalOrders}`);
  console.log(`     Total users:    ${totalUsers}\n`);

  if (
    IS_PRODUCTION &&
    totalProducts === 0 &&
    totalOrders === 0 &&
    totalUsers === 0
  ) {
    console.log(
      `⚠️  DBS-EMPTY SANITY: production DB has 0 products, 0 orders,\n` +
        `    0 users. Verify you pointed at the right DATABASE_URL\n` +
        `    (or PRIMARY_DATABASE_URL) — the GREEN gate below would\n` +
        `    mask this misconfig.\n`,
    );
  }

  // Gate decision.
  const blockers: string[] = [];
  if (orphanProducts > 0) {
    blockers.push(
      `${orphanProducts} orphan product(s) with creatorId IS NULL. ` +
        `Run scripts/products/backfill-primary-creator.ts before ` +
        `applying the creatorId-required Restrict FK migration.`,
    );
  }
  if (activeStripeOrders > 0) {
    blockers.push(
      `${activeStripeOrders} active Stripe order(s) (pending or completed). ` +
        `Refund or migrate to Lemon Squeezy before collapsing the ` +
        `dual-provider path.`,
    );
  }
  // NextAuth: -1 (absent, post-drop) AND 0 (present-and-empty) are GREEN.
  // Only >0 (real residual rows) is a blocker.
  if (
    accountCount > 0 ||
    sessionCount > 0 ||
    verificationTokenCount > 0
  ) {
    blockers.push(
      `Residual NextAuth rows detected (Account=${accountCount}, ` +
        `Session=${sessionCount}, VerificationToken=${verificationTokenCount}). ` +
        `Archive or purge before applying the DROP TABLE migration.`,
    );
  }

  if (blockers.length === 0) {
    console.log(
      `✅ V1 readiness: GREEN — all blocker counters are zero (or post-cleanup).\n`,
    );
  } else {
    console.log(`🚧 V1 readiness: YELLOW/RED — ${blockers.length} blocker(s):\n`);
    for (const b of blockers) {
      console.log(`     • ${b}`);
    }
    console.log();
  }

  const report: AuditReport = {
    source: label,
    timestamp: new Date().toISOString(),
    orphanProducts,
    activeStripeOrders,
    residualNextAuth: {
      account: accountCount,
      session: sessionCount,
      verificationToken: verificationTokenCount,
    },
    totalProducts,
    totalOrders,
    totalUsers,
    blockers,
  };
  console.log(`📋 JSON (machine-readable):\n${JSON.stringify(report, null, 2)}\n`);

  console.log("==== Audit complete (no mutations applied) ====\n");
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("\n❌ Audit FAILED:", err);
  try {
    await prisma.$disconnect();
  } catch (disconnectErr) {
    console.warn(
      "⚠️  prisma.$disconnect() failed on error path.",
      disconnectErr,
    );
  }
  process.exit(1);
});
