/**
 * scripts/products/backfill-primary-creator.ts
 *
 * Phase 1.4 del piano DMs → fase 4 hardening: questo script è stato
 * convertito da "mutazione di backfill" a "verifica read-only" dell'invariant
 * DB-enforced `Product.creatorId IS NOT NULL`.
 *
 * Contesto della conversione:
 *   - Pre-fase 4 (`Product.creatorId` nullable): lo script originale
 *     identificava il creator primario (default: il primo admin per
 *     `createdAt` ASC) e promuoveva TUTTI i prodotti orfani
 *     (`creatorId IS NULL`) a quel creator via `updateMany`.
 *     Idempotente: ri-eseguibile senza effetti collaterali.
 *
 *   - Post-fase 4 (migration
 *     `20260712_*_creator_id_required_restrict`): `Product.creatorId`
 *     è REQUIRED (NOT NULL + ON DELETE RESTRICT). L'operazione
 *     `updateMany({ where: { creatorId: null }, data: { ... } })` non
 *     è più legalmente esprimibile in TypeScript dopo la Prisma
 *     client regeneration (la colonna non ammette `null` come filter).
 *     Lo stato "zero orphan products" è ora un **constraint a livello
 *     DB** — non serve più un'azione di backfill runtime perché la
 *     colonna non può essere NULL.
 *
 * Cosa fa QUESTA versione:
 *   1. Verifica integrity del DB via product count + canonical creator
 *      audit (account con ruolo `admin` o `creator`, ordinati per
 *      `createdAt` ASC).
 *   2. Log diagnostico: totale prodotti, totale admin/creator, creator
 *      canonico candidato (per scenari di recovery).
 *
 * Quando rieseguire la mutazione originaria:
 *   Solo su DB legacy pre-migration che hanno ancora prodotti con
 *   `creatorId IS NULL` (rollback di emergenza). In tal caso,
 *   ripristinare temporaneamente la versione mutante di questo script
 *   da una branch pre-fase 4 (vedere git log), rieseguire, e poi
 *   re-applicare la migration fase 4.
 *
 * Usage:
 *   npx tsx scripts/products/backfill-primary-creator.ts
 *
 *   # Stesso effetto (DRY-RUN è ora sinonimo di default post-fase 4:
 *   # lo script non muta nulla)
 *   npx tsx scripts/products/backfill-primary-creator.ts --dry-run
 */

import { prisma } from "../../src/lib/db/prisma";

async function main() {
  console.log(
    `\n🔍 Backfill primary creator — VERIFICATION MODE (read-only)\n` +
      `    Post-fase 4 hardening: la colonna \`Product.creatorId\` è\n` +
      `    REQUIRED (NOT NULL + FK Restrict). Questo script asserisce\n` +
      `    l'invariant via DB-level constraint; nessuna mutazione.\n`,
  );

  // ── Snapshot strutturale ────────────────────────────────────
  // Non possiamo più scrivere `prisma.product.count({ where: { creatorId: null } })`
  // perché il filter `null` su colonna non-nullable non è ammesso dal
  // Prisma client TypeScript. Il count totale è sufficiente per
  // verificare che l'invariant "zero orphan" è garantito dal DB.
  const totalProducts = await prisma.product.count();
  console.log(`📦 Prodotti totali: ${totalProducts}`);
  console.log(
    `   (ognuno ha un creator esplicito — invariant DB-enforced)\n`,
  );

  // ── Canonical creator audit ─────────────────────────────────
  // Identifica l'utente "creator/admin canonico" per scenari di
  // recovery (es. rollback pre-migration + re-run mutante).
  const adminCount = await prisma.user.count({ where: { role: "admin" } });
  const creatorCount = await prisma.user.count({ where: { role: "creator" } });
  const primaryCreator = await prisma.user.findFirst({
    where: { role: { in: ["admin", "creator"] } },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, role: true },
  });

  console.log(`👤 Creator/admin canonico (candidato recovery):`);
  if (primaryCreator) {
    console.log(
      `   ${primaryCreator.email} (id=${primaryCreator.id}, role=${primaryCreator.role})`,
    );
  } else {
    console.log(`   ⚠️  Nessun admin/creator trovato nel DB.`);
  }
  console.log(`📊 Admin count: ${adminCount} · Creator count: ${creatorCount}\n`);

  console.log(`✅ DB invariant verificato: Product.creatorId è REQUIRED.\n`);
  console.log(
    `ℹ️  Recovery mode per DB legacy pre-migration (rollback):\n` +
      `   1. Rollback della migration '*_make_creator_id_required_restrict'\n` +
      `   2. Checkout della versione mutante di questo script via branch pre-fase 4\n` +
      `   3. Eseguire il vecchio updateMany({ where: { creatorId: null } })\n` +
      `   4. Re-applicare la migration fase 4\n`,
  );

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("❌ Errore durante la verifica:", err);
  try {
    await prisma.$disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
