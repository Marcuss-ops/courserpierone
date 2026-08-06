/**
 * scripts/db/seed-youtube-channels.ts
 *
 * Per ADR-0011 (course plugin decoupling): instead of hardcoding three
 * channels for ONE course (amish-secrets × it/en/es), the seed now
 * iterates `COURSES[]` (the canonical platform course registry) and
 * generates ONE channel per `course × platform-locale` pair.
 *
 * Adding a new course that needs YouTube attribution = add the entry to
 * `courses.config.ts` + run this script. Zero changes to this file.
 *
 * Platform-locale defaults (hardcoded for V1) — extend this list when
 * a new platform-locale needs channel attribution; the seed will then
 * generate additional channels for every registered course automatically.
 *
 * Pattern: upsert keyed on `channelUrl` (@unique). Re-running the
 * script produces the same end-state without errors — no blind
 * `createMany`, no duplicate rows on re-runs.
 *
 * Usage:
 *   npx tsx scripts/db/seed-youtube-channels.ts
 *
 * Verify via psql:
 *   psql "$DIRECT_URL" -c \
 *     'SELECT id, "channelName", locale, "defaultLandingSlug",
 *             "trackingCode", "isActive"
 *      FROM "YouTubeChannel"
 *      WHERE "isActive" = true
 *      ORDER BY locale;'
 *
 * Cross-script reference (consistency):
 *   - scripts/db/seed-locales.ts        — sibling DB-seed convention.
 *   - courses.config.ts                 — COURSES[] source-of-truth.
 *   - courses.config.ts                 — canonical bundled-course registry.
 */

import { prisma } from "../../src/lib/db/prisma";
import { ACTIVE_COURSES } from "../../courses.config";

interface PlatformLocale {
  locale: string;
  languageCode: string;
  countryCode: string;
}

interface ChannelSeed {
  channelName: string;
  channelUrl: string;
  locale: string;
  languageCode: string;
  countryCode: string;
  niche: string;
  defaultLandingSlug: string;
  trackingCode: string;
  isActive: boolean;
}

// V1 platform-wide YouTube locale defaults. Extend as the platform grows.
const PLATFORM_LOCALES: PlatformLocale[] = [
  { locale: "it-it", languageCode: "it", countryCode: "IT" },
  { locale: "en-us", languageCode: "en", countryCode: "US" },
  { locale: "es-es", languageCode: "es", countryCode: "ES" },
];

/** Build channel seed entries by crossing COURSES × PLATFORM_LOCALES. */
function buildChannelSeeds(): ChannelSeed[] {
  const seeds: ChannelSeed[] = [];
  for (const course of ACTIVE_COURSES) {
    const slugToken = course.slug.split("-").pop() ?? course.slug;
    for (const lang of PLATFORM_LOCALES) {
      seeds.push({
        channelName: `${course.title} ${lang.countryCode}`,
        channelUrl: `https://www.youtube.com/@${course.slug}-${lang.languageCode}`,
        locale: lang.locale,
        languageCode: lang.languageCode,
        countryCode: lang.countryCode,
        niche: course.slug,
        defaultLandingSlug: course.slug,
        trackingCode: `yt-${lang.languageCode}-${slugToken}`,
        isActive: true,
      });
    }
  }
  return seeds;
}

async function main(): Promise<void> {
  const CHANNELS = buildChannelSeeds();
  console.log(
    `🌐 Seeding YouTube channels (idempotent upsert on channelUrl)...\n` +
      `   ${ACTIVE_COURSES.length} active course(s) × ${PLATFORM_LOCALES.length} platform locale(s) ` +
      `= ${CHANNELS.length} channel row(s).\n`,
  );

  // ── Pre-flight: confirm referenced Locale rows exist. ────────
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
  // existing row's fields to match the latest seed values.
  for (const ch of CHANNELS) {
    // The non-null assertion is sound: the missing-locales pre-flight
    // above guarantees every code in CHANNELS has an existing locale
    // row mapped here.
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
      `  ✅ ${ch.locale.padEnd(6)} → ${ch.channelName.padEnd(28)} ${ch.channelUrl}`,
    );
  }

  const total = await prisma.youTubeChannel.count();
  console.log(
    `\n✅ Done! ${total} YouTubeChannel row(s) total ` +
      `(incl. pre-existing; this script adds ${
        CHANNELS.length === 1 ? "1" : CHANNELS.length
      } upserted this run).\n`,
  );

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("\n❌ Seed failed:", err);
  prisma.$disconnect().catch((disconnectError) => {
    console.warn("⚠️ Failed to disconnect Prisma after seed error:", disconnectError);
  });
  process.exit(1);
});
