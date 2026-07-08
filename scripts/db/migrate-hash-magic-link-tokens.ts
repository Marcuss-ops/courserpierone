/**
 * scripts/db/migrate-hash-magic-link-tokens.ts
 *
 * ⚠️  MIGRATION ONE-SHOT — Eseguire UNA SOLA VOLTA prima del deploy
 * del nuovo codice con hash dei token.
 *
 * PREREQUISITO: prima eseguire `npx prisma db push` per applicare il campo
 * `tokenHashed` aggiunto allo schema Prisma. Senza la colonna, lo script
 * fallirà con "Unknown column".
 *
 * Cosa fa:
 * - Trova tutti i MagicLink records dove `tokenHashed = false` (vecchi, in chiaro)
 * - Hasha il token con SHA-256 in una transazione
 * - Aggiorna il record con `token = <hash>` e `tokenHashed = true`
 *
 * Cosa NON fa:
 * - Non cancella MagicLink esistenti
 * - Non tocca i record già hash-ati (idempotente — può essere rieseguito)
 *
 * Per eseguire:
 *   npx prisma db push
 *   npx tsx scripts/db/migrate-hash-magic-link-tokens.ts
 *
 * ⚠️  IMPORTANTE: dopo aver eseguito questo script, tutti i link email
 * precedentemente inviati (con il token in chiaro) NON funzioneranno più.
 * Verranno automaticamente puliti dal cron /api/cron/cleanup-magic-links
 * alla loro scadenza naturale.
 */

import { prisma } from "../../src/lib/db/prisma";
import { hashToken } from "../../src/lib/utils/token-hash";

async function main() {
  console.log("🔐 MagicLink Token Hashing Migration\n");

  // 1) Conta i record da migrare
  const toMigrate = await prisma.magicLink.count({
    where: { tokenHashed: false },
  });

  const alreadyHashed = await prisma.magicLink.count({
    where: { tokenHashed: true },
  });

  const total = toMigrate + alreadyHashed;

  console.log("📊 Stato attuale:");
  console.log(`   - Totale MagicLink:    ${total}`);
  console.log(`   - Da hash-are:         ${toMigrate}`);
  console.log(`   - Già hash-ati:        ${alreadyHashed}\n`);

  if (toMigrate === 0) {
    console.log("✅ Nessun MagicLink da migrare. Tutto già hash-ato.");
    return;
  }

  // 2) Avviso
  console.log(`⚠️  Verranno hash-ati ${toMigrate} MagicLink.`);
  console.log("   Dopo questa operazione, gli URL con token in chiaro già");
  console.log("   inviati per email non funzioneranno più.\n");

  // 3) Esegui la migrazione in batch transazionali (per sicurezza su tabelle grandi)
  console.log("🚀 Avvio migrazione in batch...\n");

  const BATCH_SIZE = 500;
  let updated = 0;

  // Processa a chunk per evitare OOM e timeout su tabelle grandi
  // Il filtro `tokenHashed: false` rende lo script idempotente (skip se già hash-ato)
  while (true) {
    const batch = await prisma.magicLink.findMany({
      where: { tokenHashed: false },
      select: { id: true, token: true },
      take: BATCH_SIZE,
    });

    if (batch.length === 0) break;

    const updates = batch.map((link) =>
      prisma.magicLink.update({
        where: { id: link.id },
        data: {
          token: hashToken(link.token),
          tokenHashed: true,
        },
      })
    );

    await prisma.$transaction(updates);
    updated += batch.length;
    console.log(`   ... ${updated}/${toMigrate} hash-ati`);
  }

  // 4) Report finale
  console.log(`\n📋 Report finale:`);
  console.log(`   ✅ Hash-ati con successo: ${updated}`);

  // 5) Verifica post-migrazione
  const remainingPlain = await prisma.magicLink.count({
    where: { tokenHashed: false },
  });
  if (remainingPlain === 0) {
    console.log("\n🎉 Migrazione completata con successo!");
    console.log("   Tutti i token sono ora hash-ati con SHA-256.");
  } else {
    console.log(`\n⚠️  Attenzione: ${remainingPlain} token NON hash-ati rimasti.`);
  }
}

main()
  .catch((err) => {
    console.error("\n❌ Migrazione fallita:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
