/**
 * scripts/diagnose-messaging.ts
 *
 * DRY-RUN diagnostic — no mutations to the database.
 *
 * Goal: enumerate every `(student, product)` pair that, given the current
 * data state, would FAIL `resolveMessagingPermission()` and therefore
 * cannot use the creator↔student DM channel.
 *
 * Why: we're transitioning pre-Fase 1.4 (Product.creatorId nullable, no
 * explicit creator) to the strict creator↔student model (creatorId
 * canonical, no admin fallback). Before running any backfill migration
 * we want a complete list of incompatible rows so the operator can
 * triage them: orphan products (no creator), pairs with refunded-status
 * orders, etc.
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
 *   1. System stats overview (orders / products / null-creator count)
 *   2. Per-pair compatibility verdict, grouped by reason
 *   3. Standalone list of products with `creatorId = null` (the primary
 *      backfill candidate set, surfaced even when the resolver would
 *      have allowed via the legacy admin fallback path — so the
 *      operator knows which product slugs need an explicit creator
 *      assignment before legacy fallback is removed in V2).
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
  studentId: string;
  studentEmail: string;
  productId: string;
  productSlug: string;
  productCreatorId: string | null;
  actorId: string;
  targetId: string | null;
  /** `null` ⇒ WARN category (logical soft inconsistency, not a hard deny). */
  reason: string | null;
  notes: string;
}

// ─── Main ─────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(
    "\n==== Messaging Diagnostic (DRY-RUN, read-only) ====",
  );
  console.log(
    "Surfacing (user, product) pairs incompatible with the\n" +
      "creator↔student DM model (Fase 1.5 resolver as SSOT).\n",
  );

  // ─── Phase 1: stats overview ────────────────────────────────
  const [
    totalOrders,
    completedOrders,
    totalProducts,
    nullCreatorProducts,
    adminCount,
    totalUsers,
  ] = await Promise.all([
    prisma.order.count(),
    prisma.order.count({ where: { status: "completed" } }),
    prisma.product.count(),
    prisma.product.count({ where: { creatorId: null } }),
    prisma.user.count({ where: { role: "admin" } }),
    prisma.user.count(),
  ]);

  console.log(`📊 System stats`);
  console.log(`   • Completed orders:           ${completedOrders}/${totalOrders}`);
  console.log(`   • Total products:             ${totalProducts}`);
  console.log(`   • Products with NULL creator: ${nullCreatorProducts} (need backfill)`);
  console.log(`   • Admin users (legacy fallback): ${adminCount}`);
  console.log(`   • Total users:                ${totalUsers}\n`);

  // ─── Phase 2: fetch completed orders ────────────────────────
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

  // Cache fallback admin (legacy Fase 1.4 audit path) once.
  let fallbackAdminId: string | null = null;
  if (adminCount > 0) {
    const admin = await prisma.user.findFirst({
      where: { role: "admin" },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    fallbackAdminId = admin?.id ?? null;
  }

  // ─── Phase 3: test each pair via the SSOT resolver ───────────
  const incompatible: IncompatiblePair[] = [];

  let scanned = 0;
  for (const o of orders) {
    scanned++;
    const creatorIdOrAdmin = o.product.creatorId ?? fallbackAdminId;

    // Edge case A: NO creator AND NO admin fallback.
    // DM impossible until either Product.creatorId is set, or an admin
    // exists. This is the only "hard deny" we know pre-resolver.
    if (!creatorIdOrAdmin) {
      incompatible.push({
        orderId: o.id,
        studentId: o.userId,
        studentEmail: o.user.email,
        productId: o.productId,
        productSlug: o.product.slug,
        productCreatorId: o.product.creatorId,
        actorId: o.userId,
        targetId: null,
        reason: MessagingDenyReason.NoCreatorForProduct,
        notes:
          "Product.creatorId is NULL AND no admin user exists to inherit " +
          "the legacy fallback role. DM is impossible until a creator is assigned.",
      });
      continue;
    }

    // Edge case B: Product.creatorId IS NULL but admin fallback exists.
    // The resolver will allow via the legacy admin fallback, but we
    // flag it so the operator backfills the explicit creator before
    // the fallback is removed in V2.
    if (o.product.creatorId === null) {
      incompatible.push({
        orderId: o.id,
        studentId: o.userId,
        studentEmail: o.user.email,
        productId: o.productId,
        productSlug: o.product.slug,
        productCreatorId: null,
        actorId: o.userId,
        targetId: creatorIdOrAdmin,
        // Soft warning, NOT a deny reason.
        reason: null,
        notes:
          `Product.creatorId is NULL. Resolver currently falls back to admin ` +
          `${creatorIdOrAdmin} (legacy Fase 1.4 audit path). Operator should ` +
          "backfill explicit creator via scripts/products/backfill-primary-creator.ts.",
      });
      continue;
    }

    // Standard case: explicit creator, so we test the resolver.
    // Wrap in try/catch — a single transient Prisma error should NOT
    // abort the entire O(N) scan. Captured as a special reason marker
    // so the operator can investigate (e.g. flaky connection mid-scan).
    let resolverResult: Awaited<ReturnType<typeof resolveMessagingPermission>>;
    try {
      resolverResult = await resolveMessagingPermission({
        actorId: o.userId,
        targetId: creatorIdOrAdmin,
        productId: o.productId,
      });
    } catch (caught) {
      const msg = caught instanceof Error ? caught.message : String(caught);
      const truncated = msg.slice(0, 80);
      incompatible.push({
        orderId: o.id,
        studentId: o.userId,
        studentEmail: o.user.email,
        productId: o.productId,
        productSlug: o.product.slug,
        productCreatorId: o.product.creatorId,
        actorId: o.userId,
        targetId: creatorIdOrAdmin,
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
        studentId: o.userId,
        studentEmail: o.user.email,
        productId: o.productId,
        productSlug: o.product.slug,
        productCreatorId: o.product.creatorId,
        actorId: o.userId,
        targetId: creatorIdOrAdmin,
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
      const key = p.reason ?? "WARN_NULL_CREATOR_WITH_ADMIN_FALLBACK";
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
      const tag = p.reason ?? "WARN_NULL_CREATOR";
      console.log(
        `     - order=${p.orderId}  student=${p.studentEmail}\n` +
          `       product=${p.productSlug} (creatorId=${p.productCreatorId ?? "NULL"})\n` +
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

  // ─── Phase 5: separate backfill-candidate list ─────────────
  // Even outside the resolved-pairs scan, surface every product with
  // `creatorId = null` so the operator has the canonical list to feed
  // into the bootstrap backfill script.
  const nullCreatorList = await prisma.product.findMany({
    where: { creatorId: null },
    select: { id: true, slug: true, status: true, createdAt: true },
  });
  console.log(
    `\n⚠️  Products with creatorId IS NULL (${nullCreatorList.length}) — primary backfill set:`,
  );
  if (nullCreatorList.length === 0) {
    console.log("   ✅ None — every product has an explicit creator assigned.");
  } else {
    const HARD_CAP = 10;
    for (const p of nullCreatorList.slice(0, HARD_CAP)) {
      console.log(
        `   - ${p.slug} (id=${p.id}, status=${p.status}, created=${p.createdAt.toISOString().slice(0, 10)})`,
      );
    }
    if (nullCreatorList.length > HARD_CAP) {
      console.log(`   … and ${nullCreatorList.length - HARD_CAP} more`);
    }
    console.log(
      `\n   Suggested next step:\n` +
        `     tsx scripts/products/backfill-primary-creator.ts --dry-run`,
    );
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
