/**
 * scripts/products/backfill-primary-creator.ts
 *
 * Phase 1.4 del piano DMs: designa un account (default: il primo
 * admin per createdAt ascendente) come "creator primario" e
 * backfilla TUTTI i prodotti esistenti che hanno ancora
 * `Product.creatorId IS NULL`.
 *
 * Lo script è completamente idempotente:
 *   - l'utente viene promosso a `role = creator` SOLO se non lo è già;
 *   - `Product.creatorId` viene aggiornato SOLO per i prodotti orfani;
 *   - ri-eseguire lo script termina con "0 changes applied" senza
 *     effetti collaterali.
 *
 * Usage:
 *   # Default: primo admin per createdAt ascendente
 *   npx tsx scripts/products/backfill-primary-creator.ts
 *
 *   # Specifica tramite email
 *   PRIMARY_CREATOR_EMAIL=alice@example.com \
 *     npx tsx scripts/products/backfill-primary-creator.ts
 *
 *   # Dry run: non applica modifiche, mostra solo conteggi
 *   npx tsx scripts/products/backfill-primary-creator.ts --dry-run
 */

import { prisma } from "../../src/lib/db/prisma";

const DRY_RUN = process.argv.includes("--dry-run");
const EMAIL_ENV = process.env.PRIMARY_CREATOR_EMAIL?.trim();

async function main() {
  console.log(
    `\n🔧 Backfill primary creator ${DRY_RUN ? "(DRY RUN – nessuna modifica)" : ""}\n`
  );

  // ── 1. Designa il creator primario ──────────────────────────
  let primaryCreator: { id: string; email: string; role: string } | null = null;

  if (EMAIL_ENV) {
    primaryCreator = await prisma.user.findUnique({
      where: { email: EMAIL_ENV },
      select: { id: true, email: true, role: true },
    });
    if (!primaryCreator) {
      console.error(
        `❌ Nessun utente trovato con PRIMARY_CREATOR_EMAIL=${EMAIL_ENV}.`
      );
      process.exit(1);
    }
  } else {
    // Fail-soft sul numero di admin: se ne esiste più di uno senza
    // selezione esplicita, l'utente che lancia lo script deve
    // scegliere intenzionalmente. Evita che un operatore disturbi
    // altri account admin promuovendone uno "a caso" semplicemente
    // perché lanciano lo script senza variabili d'ambiente.
    const adminCount = await prisma.user.count({ where: { role: "admin" } });
    if (adminCount === 0) {
      console.error(
        `❌ Nessun admin trovato. Imposta PRIMARY_CREATOR_EMAIL o promuovi prima un admin.`
      );
      process.exit(1);
    }
    if (adminCount > 1) {
      const admins = await prisma.user.findMany({
        where: { role: "admin" },
        select: { id: true, email: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      });
      console.error(
        `❌ Trovati ${adminCount} account admin ma PRIMARY_CREATOR_EMAIL non è impostato.\n` +
          `   Per evitare promozioni accidentali, specifica quale admin deve diventare il creator primario:\n` +
          admins
            .map(
              (a, i) =>
                `   ${i + 1}. ${a.email} (id=${a.id}, createdAt=${a.createdAt.toISOString()})`
            )
            .join("\n") +
          `\n   Rilancia con: PRIMARY_CREATOR_EMAIL=<email> npx tsx scripts/products/backfill-primary-creator.ts`
      );
      process.exit(1);
    }
    primaryCreator = await prisma.user.findFirst({
      where: { role: "admin" },
      orderBy: { createdAt: "asc" },
      select: { id: true, email: true, role: true },
    });
  }

  if (!primaryCreator) {
    // safety net — non dovrebbe mai accadere dopo i guard sopra
    console.error(`❌ Creator primario non determinabile.`);
    process.exit(1);
  }

  console.log(
    `👤 Creator primario: ${primaryCreator.email} ` +
      `(id=${primaryCreator.id}, role=${primaryCreator.role})`
  );

  // ── 2. Promozione al ruolo creator ──────────────────────────
  // Un admin è implicitamente anche creator (può rispondere ai
  // clienti dei propri prodotti). L'upgrade a role=creator è
  // puramente documentale — entrambi i ruoli sono ammessi dal
  // resolver di Fase 1.5. Mantenere la retrocompatibilità: se
  // l'utente è già admin, NON lo demote a creator puro.
  if (primaryCreator.role !== "admin" && primaryCreator.role !== "creator") {
    if (DRY_RUN) {
      console.log(
        `🧪 [dry-run] Promozione ${primaryCreator.email}: ${primaryCreator.role} → creator`
      );
    } else {
      await prisma.user.update({
        where: { id: primaryCreator.id },
        data: { role: "creator" },
      });
      console.log(
        `✅ Promosso ${primaryCreator.email} a role=creator (era ${primaryCreator.role})`
      );
    }
  } else {
    console.log(
      `ℹ  Ruolo già ${primaryCreator.role}, nessuna promozione necessaria.`
    );
  }

  // ── 3. Conteggio prodotti orfani ────────────────────────────
  const orphanedProducts = await prisma.product.count({
    where: { creatorId: null },
  });

  const totalProducts = await prisma.product.count();
  console.log(
    `📦 Prodotti totali: ${totalProducts} — senza creatorId: ${orphanedProducts}`
  );

  // ── 4. Backfill idempotente ─────────────────────────────────
  if (orphanedProducts === 0) {
    console.log(
      "✅ Tutti i prodotti hanno già un creator — backfill non necessario."
    );
  } else if (DRY_RUN) {
    console.log(
      `🧪 [dry-run] Avrei aggiornato ${orphanedProducts} prodotti a creatorId=${primaryCreator.id}.`
    );
  } else {
    const result = await prisma.product.updateMany({
      where: { creatorId: null },
      data: { creatorId: primaryCreator.id },
    });
    console.log(
      `✅ Aggiornati ${result.count}/${orphanedProducts} prodotti con creatorId=${primaryCreator.id} (${primaryCreator.email}).`
    );
  }

  // ── 5. Verifica finale ──────────────────────────────────────
  const finalOrphaned = await prisma.product.count({
    where: { creatorId: null },
  });
  console.log(
    `\n📊 Stato finale: prodotti senza creatorId = ${finalOrphaned}` +
      (DRY_RUN ? " (dry-run, stato invariato)" : "")
  );

  if (DRY_RUN) {
    console.log(
      `\n🧪 DRY RUN terminato. Esegui senza --dry-run per applicare le modifiche.`
    );
  } else {
    console.log(`\n✅ Backfill completato. Lo script è idempotente: rilanciarlo è sicuro.`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("❌ Errore durante il backfill:", err);
  process.exit(1);
});
