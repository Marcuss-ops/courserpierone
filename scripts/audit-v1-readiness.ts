/**
 * scripts/audit-v1-readiness.ts
 *
 * DRY-RUN audit — purely read-only Prisma queries, no mutations.
 *
 * Goal: emit a single-page readiness report that gates the V1 database
 * cleanups. Two counters remain as V1 blockers (post-fase 4 hardening
 * + post-NextAuth-drop):
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
 *   (3) ~~`Account + Session + VerificationToken` row counts~~ —
 *         rimosso: i 3 modelli NextAuth sono stati droppati dalla
 *         migration `20260712220000_drop_nextauth_models` (post
 *         Supabase Auth migration). Il gate non è più strutturalmente
 *         applicabile. L'invariant è ora la semplice ASSENZA dei
 *         modelli dal DB.
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
  // The 1 remaining V1 blocker counter (post-fase 4 + post-NextAuth-drop):
  activeStripeOrders: number;
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

  // 1 blocker query + 3 sanity baselines in parallel.
  const [
    activeStripeOrders,
    totalProducts,
    totalOrders,
    totalUsers,
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
  ]);

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
    `   ✅  RESIDUAL NEXTAUTH TABLES — gate closed (post-Supabase Auth)\n` +
      `        status: non più applicabile (post-migration\n` +
      `                \`20260712220000_drop_nextauth_models\`).\n` +
      `        recovery: i modelli Account/Session/VerificationToken\n` +
      `                sono stati droppati dal DB. Una purge mirata\n` +
      `                precede DROP TABLE (è già avvenuta).\n`,
  );

  console.log(`📊 SANITY BASELINES (not blockers)\n`);
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

  // Gate decision: only Blocker 2 (Stripe orders) remains.
  const blockers: string[] = [];
  if (activeStripeOrders > 0) {
    blockers.push(
      `${activeStripeOrders} active Stripe order(s) (pending or completed). ` +
        `Refund or migrate to Lemon Squeezy before collapsing the ` +
        `dual-provider path.`,
    );
  }

  if (blockers.length === 0) {
    console.log(`✅ V1 readiness: GREEN — the remaining blocker is zero.\n`);
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
    activeStripeOrders,
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
      "⚠️  prisma.$disconnect() failed on error path. Original error above; disconnect stack follows:",
      disconnectErr,
    );
  }
  process.exit(1);
});
