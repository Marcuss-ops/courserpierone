/**
 * scripts/db/seed-youtube-channels.ts
 *
 * Idempotent seed of ≥3 YouTubeChannel rows for channel attribution.
 *
 * Pattern: upsert keyed on `channelUrl` (@unique). Re-running the
 * script produces the same end-state without errors — no blind
 * `createMany`, no duplicate rows on re-runs.
 *
 * Minimum viable seed (per docs/v1-acceptance-test.md §1 criterion 3,
 * scaled up per user's go-live plan):
 *   - 1 channel per primary language: it-it, en-us, es-es.
 *   - defaultLandingSlug = 'amish-secrets' for all three (the canonical
 *     V1 product slug — see docs/v1-acceptance-test.md §4 BLOCKER
 *     items).
 *   - trackingCode is set per-channel so analytics attribution can
 *     recover the channel from URL parameters (`?channel=...`).
 *
 * Pre-condition: Locale rows must exist (it-it, en-us, es-es) for the
 * FK `YouTubeChannel.localeId → Locale.id` (RESTRICT). If not, the
 * script fails with a clear instruction to run seed-locales.ts first.
 *
 * Usage:
 *   npx tsx scripts/db/seed-youtube-channels.ts
 *
 * Verify via psql (NOT `prisma studio -c` which is the wrong command
 * per the user's pasted plan — `studio -c` is shorthand for opening
 * Studio on a connection, not running a query):
 *   psql "$DIRECT_URL" -c \
 *     'SELECT id, "channelName", locale, "defaultLandingSlug",
 *             "trackingCode", "isActive"
 *      FROM "YouTubeChannel"
 *      WHERE "isActive" = true
 *      ORDER BY locale;'
 *
 * Cross-script reference (consistency):
 *   - scripts/db/seed-locales.ts — sibling DB-seed convention that
 *     this script mirrors (shared `prisma` client, upsert on unique
 *     field, one console.log line per row).
 *
 * Conventions:
 *   - Mirrors scripts/diagnose-messaging.ts (top-level main + .catch exit).
 *   - Always calls `prisma.$disconnect()` on success path.
 *   - DRY-RUN by virtue of upsert equivalence — re-running is a no-op.
 *   - Exit codes: 0 on success, 1 on runtime error, 2 on missing
 *     prerequisites (Locale rows).
 */

import { prisma } from "../../src/lib/db/prisma";

interface ChannelSeed {
  channelName: string;
  channelUrl: string; // @unique in schema — upsert keyed here
  locale: string; // matches Locale.code → FK lookup → localeId
  languageCode: string;
  countryCode: string;
  niche: string;
  defaultLandingSlug: string;
  trackingCode: string;
  isActive: boolean;
}

const CHANNELS: ChannelSeed[] = [
  {
    channelName: "Amish Secrets IT",
    channelUrl: "https://www.youtube.com/@amish-secrets-it",
    locale: "it-it",
    languageCode: "it",
    countryCode: "IT",
    niche: "amish-secrets",
    defaultLandingSlug: "amish-secrets",
    trackingCode: "yt-it-amish",
    isActive: true,
  },
  {
    channelName: "Amish Secrets EN",
    channelUrl: "https://www.youtube.com/@amish-secrets-en",
    locale: "en-us",
    languageCode: "en",
    countryCode: "US",
    niche: "amish-secrets",
    defaultLandingSlug: "amish-secrets",
    trackingCode: "yt-en-amish",
    isActive: true,
  },
  {
    channelName: "Amish Secrets ES",
    channelUrl: "https://www.youtube.com/@amish-secrets-es",
    locale: "es-es",
    languageCode: "es",
    countryCode: "ES",
    niche: "amish-secrets",
    defaultLandingSlug: "amish-secrets",
    trackingCode: "yt-es-amish",
    isActive: true,
  },
];

async function main(): Promise<void> {
  console.log("🌐 Seeding YouTube channels (idempotent upsert on channelUrl)...\n");

  // ── Pre-flight: confirm referenced Locale rows exist. ───────
  // YouTubeChannel.localeId has RESTRICT FK on Locale.id (per
  // prisma/schema.prisma). A missing locale row would surface as
  // an opaque Prisma error at upsert time. We catch it here with
  // an actionable "run seed-locales.ts first" instruction.
  const localeCodes = Array.from(new Set(CHANNELS.map((c) => c.locale)));
  const existingLocales = await prisma.locale.findMany({
    where: { code: { in: localeCodes } },
    select: { id: true, code: true },
  });
  const existingByCode = new Map<string, string>(
    existingLocales.map((l) => [l.code, l.id]),
  );
  const missingLocales = localeCodes.filter((c) => !existingByCode.has(c));
  if (missingLocales.length > 0) {
    console.error(
      "\n❌ Missing Locale rows: " +
        missingLocales.join(", ") +
        "\n" +
        "   The YouTubeChannel.localeId FK (RESTRICT) requires these\n" +
        "   Locale rows to exist BEFORE this seed runs.\n" +
        "\n" +
        "   Run first:\n" +
        "     npx tsx scripts/db/seed-locales.ts\n" +
        "\n" +
        "   Then re-run this script:\n" +
        "     npx tsx scripts/db/seed-youtube-channels.ts\n",
    );
    process.exit(2);
  }

  // ── Upsert loop. ─────────────────────────────────────────────
  // `where: { channelUrl }` is the @unique key per schema. On
  // first run: creates the row. On subsequent runs: updates the
  // existing row's fields (channelName, localeId, locale,
  // languageCode, countryCode, niche, defaultLandingSlug,
  // trackingCode, isActive) to match the latest seed values.
  // Re-running with identical seed = no-op \u2014 safe for CI re-runs.
  for (const ch of CHANNELS) {
    // The non-null assertion is sound: the missing-locales pre-flight
    // above guarantees every code in CHANNELS has an existing locale
    // row mapped here. If the assertion ever fires, the pre-flight
    // logic has a bug \u2014 not a runtime data issue. Deliberate and
    // explicit rather than defensive runtime shim.
    const localeId = existingByCode.get(ch.locale)!;

    await prisma.youTubeChannel.upsert({
      where: { channelUrl: ch.channelUrl },
      update: {
        channelName: ch.channelName,
        localeId,
        locale: ch.locale,
        languageCode: ch.languageCode,
        countryCode: ch.countryCode,
        niche: ch.niche,
        defaultLandingSlug: ch.defaultLandingSlug,
        trackingCode: ch.trackingCode,
        isActive: ch.isActive,
      },
      create: {
        channelName: ch.channelName,
        channelUrl: ch.channelUrl,
        localeId,
        locale: ch.locale,
        languageCode: ch.languageCode,
        countryCode: ch.countryCode,
        niche: ch.niche,
        defaultLandingSlug: ch.defaultLandingSlug,
        trackingCode: ch.trackingCode,
        isActive: ch.isActive,
      },
    });
    console.log(
      `  ✅ ${ch.locale.padEnd(6)} → ${ch.channelName.padEnd(20)} ${ch.channelUrl}`,
    );
  }

  const total = await prisma.youTubeChannel.count();
  console.log(
    `\n✅ Done! ${total} YouTubeChannel row(s) total ` +
      `(incl. pre-existing; this script adds 3 if the table is empty).`,
  );

  console.log(
    `\nℹ️  Verify via psql:\n` +
      `   psql "$DIRECT_URL" -c \\\n` +
      `     'SELECT id, "channelName", locale, "defaultLandingSlug" FROM "YouTubeChannel" ORDER BY locale;'\n`,
  );

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("\n❌ Seed failed:", err);
  prisma.$disconnect().catch(() => {
    /* ignore \u2014 already-failing disconnect */
  });
  process.exit(1);
});
