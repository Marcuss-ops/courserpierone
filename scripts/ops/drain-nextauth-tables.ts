/**
 * scripts/ops/drain-nextauth-tables.ts
 *
 * Pre-migration drain step for the NextAuth residual cleanup (Supabase
 * Auth is canonical V1.5+, the 3 NextAuth tables are pure debt).
 *
 * Workflow (on staging/prod after Supabase Auth migration is live):
 *   1. Inspect with --dry-run (default):
 *        npx tsx scripts/ops/drain-nextauth-tables.ts
 *      → prints row counts per table; no writes.
 *   2. Drain with --apply + --archive-dir (the durable recovery path):
 *        npx tsx scripts/ops/drain-nextauth-tables.ts \
 *          --apply --archive-dir ./archive/2026-07-12-nextauth/
 *      → For each of the 3 NextAuth tables:
 *         a. information_schema check → skip + notice if absent.
 *         b. SELECT * → write JSON archive (file mode 0o600 — see Safety).
 *         c. TRUNCATE TABLE.
 *   3. Apply the Prisma migration (separate command):
 *        npx prisma migrate deploy
 *      → 20260712220000_drop_nextauth_models drops the (now empty)
 *        tables. Idempotent — also runs cleanly if the tables were
 *        already absent on a fresh DB.
 *
 * Idempotency:
 *   - Tables already absent → per-table skip with notice, exit 0.
 *   - Empty tables → archive file is `[]`, TRUNCATE is a no-op.
 *   - Re-running after the migration applied → all tables absent
 *     → all skipped.
 *
 * Safety:
 *   - --apply requires --archive-dir (refuses with exit 2 otherwise).
 *   - --apply requires an interactive `y/N` confirmation unless --yes
 *     is also passed (non-TTY environments default to refusing).
 *   - JSON archive files are written with file mode 0o600 because
 *     `Session.sessionToken` and `Account.refresh_token` columns are
 *     bearer-equivalent secrets. Default 0o644 world-readable is
 *     unacceptable for cold-storage of those values.
 *
 * Exit codes:
 *   0  all tables processed cleanly (drained, already absent, or empty)
 *   1  runtime error: at least one table had a fetch/archive/TRUNCATE
 *      failure (per-table breakdown logged; remaining tables continue)
 *   2  env-missing (DATABASE_URL unset) or invalid flag combination
 *
 * Cross-script consistency:
 *   - scripts/audit-v1-readiness.ts (commit 8b21b7d)
 *   - scripts/migrate-grants-from-orders.ts (commit 5395bfa)
 *   Both use the same PrismaClient `datasources` override pattern with
 *   module-level `let prisma: PrismaClient;` + `buildPrismaClient(url)`
 *   helper + env-guard + `if (prisma)` defensive catch-handler guard.
 *   This script mirrors that convention. See the audit script's commit
 *   message for the full rationale on why a shared helper is NOT yet
 *   factored out (third-instance trigger is the right time).
 */

import { Prisma, PrismaClient } from "@prisma/client";
import * as fs from "node:fs/promises";
import * as path from "node:path";

// Internal whitelist — hardcoded, never reaches user-controlled input.
// `as const` narrows to literal types so the per-table switch branches
// below can be statically verifiable.
const TARGET_TABLES = ["Account", "Session", "VerificationToken"] as const;
type TargetTable = (typeof TARGET_TABLES)[number];

const MIGRATION_NAME = "20260712220000_drop_nextauth_models";

interface CliFlags {
  mode: "dry-run" | "apply";
  archiveDir: string | null;
  yes: boolean;
}

interface ArchivePayload {
  table: TargetTable;
  migration: typeof MIGRATION_NAME;
  exportedAt: string;
  rowCount: number;
  rows: Array<Record<string, unknown>>;
}

interface PerTableReport {
  table: TargetTable;
  status: "drained" | "would-drain" | "skipped-absent" | "skipped-empty" | "error";
  rowCount: number;
  archivePath: string | null;
  error?: string;
}

function parseFlags(argv: readonly string[]): CliFlags {
  let mode: CliFlags["mode"] = "dry-run";
  let archiveDir: string | null = null;
  let yes = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") {
      mode = "dry-run";
    } else if (arg === "--apply") {
      mode = "apply";
    } else if (arg === "--yes" || arg === "-y") {
      yes = true;
    } else if (arg === "--archive-dir") {
      throw new Error(
        `--archive-dir requires the --archive-dir=<path> form (next-arg form intentionally rejected for safety — easier to scan in shell history)`,
      );
    } else if (arg.startsWith("--archive-dir=")) {
      archiveDir = arg.slice("--archive-dir=".length).trim();
    } else {
      throw new Error(`unknown flag: ${arg}`);
    }
  }

  return { mode, archiveDir, yes };
}

async function confirmApplyOrExit(yes: boolean): Promise<void> {
  // Non-TTY (CI) refuses --apply unless --yes is also passed. Protects
  // against accidental destructive invocation from automation.
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    if (yes) return;
    console.error(
      "\n❌ Non-interactive shell detected. --apply refuses to run\n" +
        "   without --yes in non-TTY environments. Re-run with --yes\n" +
        "   to confirm. (Or attach to a TTY for the y/N prompt.)\n",
    );
    process.exit(2);
  }
  if (yes) return;

  console.error("\n⚠️  About to TRUNCATE 3 NextAuth tables after archiving.");
  console.error("   Confirmation gate: type 'y' to proceed, anything else aborts.\n");

  const readline = await import("node:readline/promises");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
  });
  try {
    const answer = (await rl.question("Confirm? [y/N]: ")).trim().toLowerCase();
    if (answer !== "y") {
      console.error("Aborted by operator (non-'y' response). No changes made.\n");
      process.exit(0);
    }
  } finally {
    rl.close();
  }
}

// Module-level PrismaClient slot. Same pattern as audit (8b21b7d) and
// migrate-grants (5395bfa) commits. See those for rationale on why the
// shared `src/lib/db/prisma.ts` singleton is NOT used here.
let prisma: PrismaClient;

function buildPrismaClient(url: string): PrismaClient {
  return new PrismaClient({
    datasources: {
      db: { url },
    },
  });
}

// Identifier interpolation uses Prisma.raw because table name comes from
// a compile-time `as const` whitelist, not user input. No SQL-injection
// surface: TARGET_TABLES is exhaustively typed and the values are known
// at compile time.
async function tableExistsInPublic(table: TargetTable): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ${table}
    ) AS exists
  `;
  return rows[0]?.exists === true;
}

async function fetchRows(table: TargetTable): Promise<Array<Record<string, unknown>>> {
  return prisma.$queryRaw<Array<Record<string, unknown>>>(
    Prisma.sql`SELECT * FROM ${Prisma.raw(`"${table}"`)}`,
  );
}

async function truncateTable(table: TargetTable): Promise<void> {
  await prisma.$executeRaw(
    Prisma.sql`TRUNCATE TABLE ${Prisma.raw(`"${table}"`)}`,
  );
}

async function archiveRows(
  table: TargetTable,
  rows: Array<Record<string, unknown>>,
  archiveDir: string,
): Promise<string> {
  // mkdir -p on the archive-dir — operator passed the path explicitly,
  // signaling intent. Auto-create is friendlier than requiring a manual
  // setup step that bloats the runbook without safety gain.
  await fs.mkdir(archiveDir, { recursive: true });

  const payload: ArchivePayload = {
    table,
    migration: MIGRATION_NAME,
    exportedAt: new Date().toISOString(),
    rowCount: rows.length,
    rows,
  };

  const archivePath = path.join(archiveDir, `${table}.json`);
  // JSON.stringify replacer converts bigints (which `JSON.stringify`
  // would otherwise throw on per spec) to their decimal string form.
  // Postgres columns that map to Prisma BigInt (rare, but plausible
  // for future FK ids / counters) become readable numbers in JSON
  // without losing precision. Cheaper insurance than letting a
  // per-table archive-write fail and propagate as a `status: error`.
  const bigIntSafeReplacer = (_key: string, value: unknown) =>
    typeof value === "bigint" ? value.toString() : value;
  // File mode 0o600 — PII-adjacent: Session.sessionToken +
  // Account.refresh_token are bearer-equivalent secrets.
  await fs.writeFile(archivePath, JSON.stringify(payload, bigIntSafeReplacer, 2), {
    mode: 0o600,
  });
  return archivePath;
}

async function drainOneTable(
  table: TargetTable,
  flags: CliFlags,
): Promise<PerTableReport> {
  try {
    const exists = await tableExistsInPublic(table);
    if (!exists) {
      console.log(`   ⏭  ${table}: skipped (absent in this DB — post-cleanup)`);
      return {
        table,
        status: "skipped-absent",
        rowCount: 0,
        archivePath: null,
      };
    }

    const rows = await fetchRows(table);
    if (rows.length === 0) {
      console.log(`   ⏭  ${table}: skipped (0 rows)`);
      return {
        table,
        status: "skipped-empty",
        rowCount: 0,
        archivePath: null,
      };
    }

    if (flags.mode === "dry-run") {
      console.log(
        `   👁  ${table}: would-drain ${rows.length} row(s) (sample: ${JSON.stringify(rows[0]).slice(0, 120)}…)`,
      );
      return {
        table,
        status: "would-drain",
        rowCount: rows.length,
        archivePath: null,
      };
    }

    // --apply path. Order is ARCHIVE → TRUNCATE. If TRUNCATE throws,
    // the JSON file is already the durable recovery record (operator
    // can re-run --apply; the archive write is idempotent — overwrites
    // the file with the same rows). Inverse ordering would lose data
    // on archive failure.
    const archivePath = await archiveRows(table, rows, flags.archiveDir!);
    await truncateTable(table);
    console.log(`   ✅ ${table}: ${rows.length} row(s) archived → ${archivePath} + TRUNCATE`);
    return {
      table,
      status: "drained",
      rowCount: rows.length,
      archivePath,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Per-table isolation: don't abort the loop on a single failure.
    console.error(`   ❌ ${table}: error — ${msg}`);
    return {
      table,
      status: "error",
      rowCount: 0,
      archivePath: null,
      error: msg,
    };
  }
}

async function main(): Promise<void> {
  // Flags first — fail fast on bad input.
  let flags: CliFlags;
  try {
    flags = parseFlags(process.argv.slice(2));
  } catch (err) {
    console.error(
      "\n❌ Invalid flags: " +
        (err instanceof Error ? err.message : String(err)) +
        "\n   Usage:\n" +
        "     npx tsx scripts/ops/drain-nextauth-tables.ts [--dry-run]\n" +
        "     npx tsx scripts/ops/drain-nextauth-tables.ts \\\n" +
        "       --apply --archive-dir=<dir> [--yes]\n",
    );
    process.exit(2);
  }

  // --apply invariant: archive-dir must be set.
  if (flags.mode === "apply" && !flags.archiveDir) {
    console.error(
      "\n❌ --apply requires --archive-dir=<path>. Refusing to run\n" +
        "   silently — the archive is the only recovery path after TRUNCATE,\n" +
        "   so the script requires an explicit destination.\n",
    );
    process.exit(2);
  }

  // Env guard — same convention as audit (8b21b7d) and
  // migrate-grants (5395bfa) commits.
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error(
      "\n❌ DATABASE_URL is not set in env. Export it before re-running.\n" +
        "   (PRIMARY_DATABASE_URL is honored by the audit script but NOT\n" +
        "   here — this script reads the canonical Prisma env name.)\n",
    );
    process.exit(2);
  }

  prisma = buildPrismaClient(url);

  // TTY / non-TTY confirmation gate for --apply.
  if (flags.mode === "apply") {
    await confirmApplyOrExit(flags.yes);
  }

  console.log(
    `\n🧹 NextAuth drain — ${flags.mode === "apply" ? "APPLY" : "DRY-RUN"} mode\n` +
      `   Tables in scope: ${TARGET_TABLES.join(", ")}\n` +
      (flags.mode === "apply"
        ? `   Archive dir:    ${flags.archiveDir}\n`
        : ``) +
      `   Migration to apply afterwards:\n     npx prisma migrate deploy\n` +
      `     (this commits ${MIGRATION_NAME} when it runs)\n`,
  );

  const reports: PerTableReport[] = [];
  for (const table of TARGET_TABLES) {
    reports.push(await drainOneTable(table, flags));
  }

  const errors = reports.filter((r) => r.status === "error").length;
  console.log(`\n📊 Summary:`);
  for (const r of reports) {
    const icon = {
      "drained": "✅",
      "would-drain": "👁 ",
      "skipped-absent": "⏭ ",
      "skipped-empty": "⏭ ",
      "error": "❌",
    }[r.status];
    console.log(
      `   ${icon} ${r.table}: ${r.status.padEnd(15)} ${r.rowCount} row(s)` +
        (r.archivePath ? `  → ${r.archivePath}` : "") +
        (r.error ? `\n      error: ${r.error}` : ""),
    );
  }

  if (flags.mode === "apply" && errors === 0) {
    console.log(
      `\n✅ Drain complete. Next step:\n` +
        `     npx prisma migrate deploy\n`,
    );
  } else if (flags.mode === "apply" && errors > 0) {
    console.log(
      `\n⚠️  Drain completed with ${errors} error(s). The succeeded tables\n` +
        `     are already truncated; the failing table is untouched. Inspect\n` +
        `     the per-table error messages above and re-run — the script is\n` +
        `     idempotent on missing tables and on already-empty tables.\n`,
    );
  } else {
    console.log(
      `\nℹ️  Dry-run only. No writes. Re-run with --apply --archive-dir=<dir>\n` +
        `     to perform the destructive step.\n`,
    );
  }

  await prisma.$disconnect();

  if (errors > 0) process.exit(1);
}

main().catch(async (err) => {
  console.error("\n❌ Drain FAILED (top-level):", err);
  // `if (prisma)` defensive guard (paired with audit-script cleanup
  // flagged as a followup in commit 8b21b7d). Without this check, a
  // pre-instantiation throw would attempt `prisma.$disconnect()` on
  // undefined → TypeError → swallowed by the inner try/catch. The
  // guard suppresses that spurious path; process.exit(2) on env-missing
  // still terminates before this catch is reachable.
  if (prisma) {
    try {
      await prisma.$disconnect();
    } catch {
      /* ignore */
    }
  }
  process.exit(1);
});
