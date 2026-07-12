/**
 * scripts/seed-primary-creator.ts
 *
 * Phase 1.4 del piano DMs — bootstrap primary creator (idempotente).
 *
 * Responsabilità:
 *   1. Risolve un utente (per User.id OR email).
 *   2. Setta User.role = 'creator' se non già (idempotent — no-op se
 *      l'utente è già creator).
 *   3. Backfill Product.creatorId = user.id per TUTTI i prodotti
 *      attualmente NULL (idempotent — updateMany filtra su
 *      `creatorId IS NULL`, quindi re-runs dopo il primo backfill
 *      sono zero-row no-op).
 *
 * Idempotency design (verificata da re-run):
 *   - Se User.role è già 'creator', non esegue update (no SQL).
 *   - Se nessun Product ha creatorId IS NULL, updateMany restituisce
 *     count=0 (no SQL effect).
 *   - Il pattern `if (X != target) update...` + `updateMany WHERE cond`
 *     è la combinazione canonica per "set to default value" idempotente.
 *
 * Origin (rilevante per drift):
 *   scripts/diagnose-messaging.ts diagnostica incompatibilità nel
 *   modello creator↔cliente. Questo script è la remediation operativa:
 *   assicura che TUTTI i prodotti abbiano un creatorId valido
 *   prima di rimuovere il fallback admin in V2.
 *
 * Usage:
 *   npx tsx scripts/seed-primary-creator.ts --user <userId|email>
 *   npx tsx scripts/seed-primary-creator.ts --user <userId|email> --dry-run
 *   npx tsx scripts/seed-primary-creator.ts <userId|email>            (positional fallback)
 *
 * Conventions:
 *   - Importa prisma da `../src/lib/db/prisma` (come seed-locales.ts).
 *   - main().catch(async err → prisma.$disconnect + process.exit(1)).
 *   - Arg parsing custom (no commander/yargs — mantiene la dipendenza
 *     footprint minima).
 *   - Mai dry-run by default — il default è APPLY perché l'utente
 *     esplicito del piano DMs vuole eseguire il bootstrap. --dry-run
 *     è opt-in per preview di sicurezza.
 */

import { prisma } from "../src/lib/db/prisma";

// ─── Arg parsing ─────────────────────────────────────────────────

interface ParsedArgs {
  userRef: string;
  dryRun: boolean;
}

function parseArgs(argv: string[]): ParsedArgs | null {
  let userRef: string | undefined;
  let dryRun = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--user" || arg === "-u") {
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        console.error(`❌ Missing value for ${arg}`);
        return null;
      }
      userRef = next;
      i++;
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else if (!arg.startsWith("--") && arg !== "-" && !userRef) {
      // Positional fallback: first non-flag arg is treated as user ref.
      userRef = arg;
    }
  }

  if (!userRef) {
    return null;
  }
  return { userRef, dryRun };
}

function printHelp(): void {
  console.log(`\
Bootstrap Primary Creator (Phase 1.4 del piano DMs)

Usage:
  npx tsx scripts/seed-primary-creator.ts --user <userId|email>
  npx tsx scripts/seed-primary-creator.ts --user <userId|email> --dry-run
  npx tsx scripts/seed-primary-creator.ts <userId|email>           (positional)

Description:
  1. Resolve user by id or email (heuristic: '@' → email search, else id).
  2. Set User.role to 'creator' if not already (idempotent no-op).
  3. Backfill Product.creatorId for every product where it is NULL
     (idempotent: re-runs affect 0 rows after first completion).

Options:
  --user, -u     Required. User reference (userId OR email).
  --dry-run      Optional. Show what would happen without writing.
  --help, -h     Show this help.

Exit codes:
  0  success (or no-op)
  1  user not found / fatal runtime error
  2  invalid arguments
`);
}

// ─── Main ─────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed) {
    console.error("❌ Missing required --user argument.\n");
    printHelp();
    process.exit(2);
  }
  const { userRef, dryRun } = parsed;

  console.log("==== Bootstrap Primary Creator (Phase 1.4) ====");
  console.log(`Mode:        ${dryRun ? "DRY-RUN (read only)" : "APPLY (writes to DB)"}`);
  console.log(`User ref:    ${userRef}`);
  console.log("");

  // ─── Step 1 — Resolve user (id OR email) ─────────────────────
  // Heuristic: '@' in input string ⇒ email lookup, else cuid id.
  // Cuid format (c<timestamp><random>) never contains '@'.
  const isEmail = userRef.includes("@");
  const lookupLabel = isEmail ? "email" : "id";

  const user = await prisma.user.findUnique({
    where: isEmail ? { email: userRef } : { id: userRef },
    select: { id: true, email: true, role: true, name: true },
  });

  if (!user) {
    console.error(`❌ User not found via ${lookupLabel}: '${userRef}'`);
    await prisma.$disconnect();
    process.exit(1);
  }

  console.log(`✓ User resolved:`);
  console.log(`    id:    ${user.id}`);
  console.log(`    email: ${user.email}`);
  console.log(`    role:  ${user.role}`);
  console.log("");

  // ─── Step 2 — Promote role to "creator" (idempotent) ─────────
  if (user.role !== "creator") {
    if (!dryRun) {
      await prisma.user.update({
        where: { id: user.id },
        data: { role: "creator" },
      });
    }
    console.log(
      `  ${dryRun ? "[DRY-RUN] would update" : "✓ updated"} User.role: "${user.role}" → "creator"`,
    );
  } else {
    console.log(`  ✓ User.role already 'creator' (idempotent no-op)`);
  }

  // ─── Step 3 — Backfill Product.creatorId (idempotent) ────────
  // updateMany con WHERE creatorId IS NULL → zero-row no-op quando
  // tutti i prodotti sono già stati backfillati.
  const nullCount = await prisma.product.count({
    where: { creatorId: null },
  });

  console.log(``);
  console.log(`📦 Products with creatorId IS NULL: ${nullCount}`);

  if (nullCount === 0) {
    console.log(`  ✅ No backfill needed — every product already has an explicit creator.`);
  } else {
    console.log(
      `  ${dryRun ? "[DRY-RUN] would update" : "✓ updating"} ${nullCount} product(s):`,
    );
    console.log(`      creatorId ← ${user.id} (${user.email})`);

    if (!dryRun) {
      const updateResult = await prisma.product.updateMany({
        where: { creatorId: null },
        data: { creatorId: user.id },
      });
      console.log(
        `      rows affected: ${updateResult.count} ${updateResult.count === nullCount ? "✓" : "(partial — re-run to investigate)"}`,
      );
    }
  }

  // ─── Final summary ────────────────────────────────────────────
  console.log(``);
  console.log(`==== Bootstrap complete (${dryRun ? "no mutations" : "mutations applied"}) ====`);
  console.log(``);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("\n❌ Bootstrap FAILED:", err);
  try {
    await prisma.$disconnect();
  } catch {
    /* ignore disconnect errors so original error is preserved */
  }
  process.exit(1);
});
