/**
 * scripts/audit-v1-readiness.ts
 *
 * DRY-RUN audit — purely read-only Prisma queries, no mutations.
 *
 * Goal: emit a single-page readiness report that gates the V1 database
 * cleanups. Two counters remain as V1 blockers (post-fase 4 hardening,
 * il blocker (1) sugli "orphan products" è stato enforciato come DB
 * invariant dalla migration
 * `20260712210000_creator_id_required_restrict` — la colonna
 * `Product.creatorId` è ora NOT NULL + ON DELETE RESTRICT, di conseguenza
 * la query `count({ where: { creatorId: null } })` non è più legalmente
 * esprimibile a livello TypeScript):
 *
 *   (1) ~~`Product.creatorId IS NULL`~~ — DB-enforced via migration
 *         `20260712210000_creator_id_required_restrict`. Per recovery
 *         pre-migration vedere scripts/products/backfill-primary-creator.ts
 *         (versione mutante pre-fase 4 via git log).
 *
 *   (2) `Order.paymentProvider = 'stripe' AND status IN ('pending','completed')`
 *         → number of Stripe orders still in-flight or honored. Before
 *           removing the dual-payment-provider code path, these must be
 *           drained to refunded (or migrated to Lemon Squeezy).
 *
 *   (3) `Account` + `Session` + `VerificationToken` row counts
 *         → before we DROP the NextAuth Prisma models, any residual
 *           rows (refresh tokens, etc.) should be audited/purged.
 *
 * Additional context counters (total products / orders / users) are
 * printed for sanity baseline, not as blockers.
 *
 * Output:
 *   1. Sectioned human-readable report with each gate
 *   2. Gate decision (GREEN / YELLOW/RED with reasons)
 *   3. Single JSON line at the end (machine-readable for pipelines)
 *
 * Env vars:
 *   PRIMARY_DATABASE_URL (preferred — direct connection, full privilege)
 *   DATABASE_URL         (fallback — pooled or whatever crypto operates)
 *
 *   The script never writes to env files or logs the URL.
 *
 * Conventions:
 *   - Mirrors scripts/diagnose-messaging.ts (top-level main + .catch exit).
 *   - Always calls `prisma.$disconnect()` on success path.
 *   - NEVER writes — pure read-only.
 *   - Exit codes: 0 on success, 1 on runtime error, 2 on missing env.
 *
 * Usage:
 *   npx tsx scripts/audit-v1-readiness.ts
 *   PRIMARY_DATABASE_URL='postgres://...' npx tsx scripts/audit-v1-readiness.ts
 */

import { prisma } from "../src/lib/db/prisma";

// ─── Types ────────────────────────────────────────────────────────

interface AuditReport {
  source: "PRIMARY_DATABASE_URL" | "DATABASE_URL";
  timestamp: string;
  // The 2 remaining V1 blocker counters (post-fase 4 hardening):
  activeStripeOrders: number;
  // NextAuth residual counts for the 3 tables (per user spec):
  accountCount: number;
  sessionCount: number;
  verificationTokenCount: number;
  // Sanity baselines:
  totalProducts: number;
  totalOrders: number;
  totalUsers: number;
  // Gate decision:
  blockers: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────

function resolveConnectionSource(): {
  url: string;
  label: "PRIMARY_DATABASE_URL" | "DATABASE_URL";
} {
  const primary = process.env.PRIMARY_DATABASE_URL?.trim();
  if (primary) return { url: primary, label: "PRIMARY_DATABASE_URL" };
  const fallback = process.env.DATABASE_URL?.trim();
  if (fallback) return { url: fallback, label: "DATABASE_URL" };
  return { url: "", label: "PRIMARY_DATABASE_URL" }; // sentinel; caller handles missing.
}

// ─── Main ─────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // ─── CLI flags ──────────────────────────────────────────────────────
  // Explicit `--production` flag lets the operator opt-in to prod-grade
  // sanity checks (DBS-empty guard) even when they don't set
  // NODE_ENV=production. Default: auto-detect via process.env.NODE_ENV.
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
    `\n==== V1 Readiness Audit (DRY-RUN, read-only) ====\n` +
      `Source:   ${label}\n` +
      `Timestamp: ${new Date().toISOString()}\n` +
      `Mode:     ${IS_PRODUCTION ? "production (DBS-empty guard active)" : "dev/preview (DBS-empty guard silent)"}\n`,
  );

  // ─── Run the 2 blocker queries + 3 sanity baselines in parallel ──
  // All 5 are independent SELECTs — no transactionality needed.
  //
  // NB: il blocker (1) `Product.creatorId IS NULL` è stato rimosso perché
  // ora un'operazione illegale in TypeScript (la colonna è REQUIRED post
  // `20260712210000_creator_id_required_restrict`) e impossibile a
  // livello DB (NOT NULL + FK Restrict). L'invariant vive nel vincolo
  // di schema.
  const [
    activeStripeOrders,
    totalProducts,
    totalOrders,
    totalUsers,
    accountCount,
    sessionCount,
    verificationTokenCount,
  ] = await Promise.all([
    // Blocker 2
    prisma.order.count({
      where: {
        paymentProvider: "stripe",
        status: { in: ["pending", "completed"] },
      },
    }),
    // Sanity baselines
    prisma.product.count(),
    prisma.order.count(),
    prisma.user.count(),
    // Blocker 3 (3 tables)
    prisma.account.count(),
    prisma.session.count(),
    prisma.verificationToken.count(),
  ]);

  // ─── Render human sections ────────────────────────────────────
  console.log(`\n📊 V1 BLOCKER INDICATORS (these gate the DB cleanups)\n`);

  console.log(
    `   ✅  ORPHAN PRODUCTS (Product.creatorId IS NULL)\n` +
      `        count: enforced at DB level (NOT NULL + FK Restrict)\n` +
      `        gate:  post-migration \`20260712210000_creator_id_required_restrict\`,\n` +
      `              l'invariant è uno stato impossibile del DB.\n` +
      `        recovery (pre-migration): scripts/products/backfill-primary-creator.ts\n`,
  );

  console.log(
    `   💳  ACTIVE STRIPE ORDERS (paymentProvider='stripe' AND status IN ('pending','completed'))\n` +
      `        count: ${activeStripeOrders}\n` +
      `        gate:  must be 0 before the dual-provider code path can\n` +
      `              be collapsed (refund or migrate to Lemon Squeezy\n` +
      `              first).\n`,
  );

  console.log(
    `   🧹  RESIDUAL NEXTAUTH TABLES (gate before DROP the models)\n` +
      `        Account:             ${accountCount}\n` +
      `        Session:             ${sessionCount}\n` +
      `        VerificationToken:  ${verificationTokenCount}\n` +
      `        total residual:      ${accountCount + sessionCount + verificationTokenCount}\n` +
      `        gate: any non-zero count is informational — a purge is\n` +
      `              only strict-gate if your threat model treats the\n` +
      `              tokens as live credentials.\n`,
  );

  console.log(`📊 SANITY BASELINES (not blockers)\n`);
  console.log(`     Total products: ${totalProducts}`);
  console.log(`     Total orders:   ${totalOrders}`);
  console.log(`     Total users:    ${totalUsers}\n`);

  // ─── DBS-empty sanity guard ────────────────────────────────────
  // If the operator runs against the production DB and sees zero
  // orders / users, that's almost certainly a wrong-DB misconfig
  // (e.g. pointed at a freshly migrated empty DB instead of prod).
  // Surface a loud warning so the audit isn't mistaken for "GREEN".
  //
  // Active only when `IS_PRODUCTION` is true, which is auto-derived
  // from NODE_ENV OR explicit `--production` CLI flag.
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

  // ─── Gate decision ────────────────────────────────────────────
  // NB: il gate `orphanProducts > 0` è stato rimosso post-fase 4
  // hardening perché l'invariant è ora un constraint a livello DB
  // (NOT NULL + Restrict FK a migration
  // `20260712210000_creator_id_required_restrict`). Per recovery su DB
  // legacy pre-migration (rollback), rieseguire manualmente
  // scripts/products/backfill-primary-creator.ts e successivamente
  // ri-roll-back la migration.
  const blockers: string[] = [];
  if (activeStripeOrders > 0) {
    blockers.push(
      `${activeStripeOrders} active Stripe order(s) (pending or completed). ` +
        `Refund or migrate to Lemon Squeezy before collapsing the ` +
        `dual-provider path.`,
    );
  }
  const residualNextAuthTotal =
    accountCount + sessionCount + verificationTokenCount;
  if (residualNextAuthTotal > 0) {
    blockers.push(
      `${residualNextAuthTotal} residual NextAuth rows ` +
        `(Account=${accountCount}, Session=${sessionCount}, ` +
        `VerificationToken=${verificationTokenCount}). ` +
        `Audit any live tokens; if none, DELETE rows before ` +
        `DROP TABLE on the NextAuth models.`,
    );
  }

  if (blockers.length === 0) {
    console.log(`✅ V1 readiness: GREEN — both blocker counters are zero.\n`);
  } else {
    console.log(`🚧 V1 readiness: YELLOW/RED — ${blockers.length} blocker(s):\n`);
    for (const b of blockers) {
      console.log(`     • ${b}`);
    }
    console.log();
  }

  // ─── Machine-readable JSON line for pipelines ──────────────────
  const report: AuditReport = {
    source: label,
    timestamp: new Date().toISOString(),
    activeStripeOrders,
    accountCount,
    sessionCount,
    verificationTokenCount,
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
    // Hint-only: a disconnect failure on the error path usually
    // means the Prisma client was never initialized cleanly. Don't
    // mask the original error; log the full disconnect-err object
    // (not just .message) so the stack survives for after-the-fact
    // triage.
    console.warn(
      "⚠️  prisma.$disconnect() failed on error path. Original error above; disconnect stack follows:",
      disconnectErr,
    );
  }
  process.exit(1);
});
