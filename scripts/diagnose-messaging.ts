/**
 * scripts/diagnose-messaging.ts
 *
 * DRY-RUN diagnostic — no mutations to the database.
 *
 * Goal: enumerate every `(student, product)` pair that, given the current
 * data state, would FAIL `resolveMessagingPermission()` and therefore
 * cannot use the creator↔student DM channel.
 *
 * Why: post-fase 4 hardening `Product.creatorId` è REQUIRED (NOT NULL +
 * Restrict FK) e il fallback al "primo admin" legacy è stato rimosso dal
 * resolver. Di conseguenza gli scenari "orphan product / null creator /
 * admin fallback" non sono più possibili né a livello DB né a livello
 * resolver. Questo script diagnostica solo i casi che restano realistic
 * post-fase 4 (studenti con order refunded, coppie non-creator/student,
 * ecc.).
 *
 * SCOPE NOTE — buyer-side only (V1):
 *   This script tests pairs derived exclusively from `Order.status =
 *   'completed'`. It does NOT test the inverse (creator→student)
 *   direction as actor, nor random (user-without-order, product) pairs.
 *   Rationale: `resolveMessagingPermission` is asymmetric — a pair is
 *   DM-eligible IFF exactly one participant is the creator of the
 *   product AND the other participant has a completed Order on it.
 *   The only realistic "transitional failure" surfaces from completed
 *   `Order` rows. V2 could add a second pass scanning
 *   (creatorId, Product) as actor for symmetry.
 *
 * Output:
 *   1. System stats overview (orders / products)
 *   2. Per-pair compatibility verdict, grouped by reason
 *
 * Defensive note:
 *   Each per-pair `resolveMessagingPermission` call is wrapped in a
 *   try/catch so a single Prisma transient error doesn't abort the
 *   entire O(N) scan. Failures are recorded as `RESOLVER_THREW:<msg>`
 *   reasons so the operator can re-run targeted diagnostics.
 *
 * Usage:
 *   npx tsx scripts/diagnose-messaging.ts
 *
 * Conventions:
 *   - Mirrors `scripts/db/seed-locales.ts` (top-level main + .catch exit).
 *   - Always calls `prisma.$disconnect()` on success path.
 *   - NEVER writes — pure read-only.
 */

import { prisma } from "../src/lib/db/prisma";
import {
  resolveMessagingPermission,
  MessagingDenyReason,
} from "../src/lib/messaging/resolve-message-permission";

// ─── Types ────────────────────────────────────────────────────────

interface IncompatiblePair {
  orderId: string;
  customerId: string;
  studentEmail: string;
  productId: string;
  productSlug: string;
  productCreatorId: string;
  actorId: string;
  targetId: string;
  /** `null` ⇒ WARN category (logical soft inconsistency, not a hard deny). */
  reason: string | null;
  notes: string;
}

// ─── Main ─────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("\n==== Messaging Diagnostic (DRY-RUN, read-only) ====");
  console.log(
    "Surfacing (user, product) pairs incompatible with the\n" +
      "creator↔student DM model (Fase 1.5 resolver as SSOT).\n",
  );

  // ─── Phase 1: stats overview ─────────────────────────────────
  // NB: `nullCreatorProducts` rimosso post-fase 4 hardening: la
  // colonna `Product.creatorId` è REQUIRED + FK Restrict, di
  // conseguenza il count `where: { creatorId: null }` non è più
  // legalmente esprimibile in TypeScript. Lo stato "0 orphan" è un
  // invariant DB-enforced.
  const [
    totalOrders,
    completedOrders,
    totalProducts,
    totalUsers,
  ] = await Promise.all([
    prisma.order.count(),
    prisma.order.count({ where: { status: "completed" } }),
    prisma.product.count(),
    prisma.user.count(),
  ]);

  console.log(`📊 System stats`);
  console.log(`   • Completed orders:    ${completedOrders}/${totalOrders}`);
  console.log(`   • Total products:      ${totalProducts}`);
  console.log(`   • Total users:         ${totalUsers}`);
  console.log(
    `   • Orphan products:     enforced at DB level (NOT NULL + Restrict FK)\n`,
  );

  // ─── Phase 2: fetch completed orders ─────────────────────────
  // We could also scan every order (including refunded) but
  // `resolveMessagingPermission` only checks for completed orders; a
  // refunded pair is "deny by design" (semantics, not data corruption).
  // Listing refunded pairs as "WARN_REFUNDED" is helpful but optional
  // — keep the focus on data inconsistency.
  console.log("🔍 Fetching completed orders…");
  const orders = await prisma.order.findMany({
    where: { status: "completed" },
    select: {
      id: true,
      userId: true,
      productId: true,
      user: { select: { email: true } },
      product: { select: { slug: true, creatorId: true } },
    },
  });
  console.log(`   • ${orders.length} completed orders loaded\n`);

  // ─── Phase 3: test each pair via the SSOT resolver ───────────
  // NB: post-fase 4 hardening il branch "Edge case A / Edge case B"
  // (creatorId null + admin fallback) è stato rimosso perché ora
  // irraggiungibile: `Product.creatorId` non può essere null, e il
  // resolver non cade più mai in admin fallback.
  const incompatible: IncompatiblePair[] = [];

  let scanned = 0;
  for (const o of orders) {
    scanned++;
    const creatorId = o.product.creatorId;

    // Standard case: explicit creator, so we test the resolver.
    // Wrap in try/catch — a single transient Prisma error should NOT
    // abort the entire O(N) scan. Captured as a special reason marker
    // so the operator can investigate (e.g. flaky connection mid-scan).
    let resolverResult: Awaited<ReturnType<typeof resolveMessagingPermission>>;
    try {
      resolverResult = await resolveMessagingPermission({
        actorId: o.userId,
        targetId: creatorId,
        productId: o.productId,
      });
    } catch (caught) {
      const msg = caught instanceof Error ? caught.message : String(caught);
      const truncated = msg.slice(0, 80);
      incompatible.push({
        orderId: o.id,
        customerId: o.userId,
        studentEmail: o.user.email,
        productId: o.productId,
        productSlug: o.product.slug,
        productCreatorId: creatorId,
        actorId: o.userId,
        targetId: creatorId,
        reason: `RESOLVER_THREW:${truncated}`,
        notes:
          `Resolver threw during scan: ${msg.slice(0, 200)}. ` +
          `Re-run script; if persistent, investigate Prisma connectivity ` +
          `around Order ${o.id}.`,
      });
      continue;
    }

    if (!resolverResult.allowed) {
      incompatible.push({
        orderId: o.id,
        customerId: o.userId,
        studentEmail: o.user.email,
        productId: o.productId,
        productSlug: o.product.slug,
        productCreatorId: creatorId,
        actorId: o.userId,
        targetId: creatorId,
        reason: resolverResult.reason ?? "unknown",
        notes: `Resolver denied: ${resolverResult.reason ?? "no reason"}`,
      });
    }
  }

  console.log(`   • ${scanned} pairs scanned\n`);

  // ─── Phase 4: aggregate by reason + report ──────────────────
  console.log(`📋 Incompatible pairs found: ${incompatible.length}`);
  if (incompatible.length === 0) {
    console.log(
      "   ✅ None — every completed order maps to a resolvable DM pair.\n",
    );
  } else {
    const byReason = new Map<string, number>();
    for (const p of incompatible) {
      const key = p.reason ?? "UNKNOWN";
      byReason.set(key, (byReason.get(key) ?? 0) + 1);
    }

    console.log(`   Grouped by reason:`);
    for (const [reason, count] of byReason.entries()) {
      console.log(`     • ${reason}: ${count}`);
    }

    const HARD_CAP = 20;
    console.log(
      `\n   Detailed pair list (first ${HARD_CAP}, truncated thereafter):`,
    );
    for (const p of incompatible.slice(0, HARD_CAP)) {
      const tag = p.reason ?? "UNKNOWN";
      console.log(
        `     - order=${p.orderId}  student=${p.studentEmail}\n` +
          `       product=${p.productSlug} (creatorId=${p.productCreatorId})\n` +
          `       reason=${tag}\n` +
          `       notes: ${p.notes}`,
      );
    }
    if (incompatible.length > HARD_CAP) {
      console.log(
        `     … and ${incompatible.length - HARD_CAP} more (rerun with full DB export to see all).`,
      );
    }
  }

  console.log("\n==== Diagnostic complete (no mutations applied) ====\n");
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("\n❌ Diagnostic FAILED:", err);
  try {
    await prisma.$disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
