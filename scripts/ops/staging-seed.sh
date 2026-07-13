#!/usr/bin/env bash
#
# scripts/ops/staging-seed.sh
#
# One-shot orchestrator for seeding the staging database with the
# minimum-viable dataset required by the V1 acceptance-test criteria:
#
#   1. seed-locales.ts          (~75 Locale rows + ~20 CountryLocaleRules)
#   2. seed-youtube-channels.ts (≥3 YouTubeChannel rows: it-it, en-us, es-es)
#   3. psql verification query  (confirms the 3 channels are present + active)
#
# Both seed scripts are idempotent (upsert on the @unique field):
#   - seed-locales.ts: upsert on `Locale.code`
#   - seed-youtube-channels.ts: upsert on `YouTubeChannel.channelUrl`
#
# Re-running this script is safe and converges to the same end-state.
# Use this after `staging-env.sh` (which sets DATABASE_URL) and BEFORE
# the staging-backfill.sh run.
#
# Why this is its own script (not just a runbook):
#   - The seed order matters: seed-youtube-channels.ts has a FK to
#     Locale (RESTRICT) and exits with code 2 if Locale rows are
#     missing. The orchestrator guarantees the right order.
#   - The psql verification at the end gives a single-line summary
#     that an operator can eyeball to confirm the seed worked.
#
# Usage:
#   # 1. Set the staging DB env vars (per scripts/ops/staging-env.sh):
#   source scripts/ops/staging-env.sh
#
#   # 2. Run the seed orchestrator:
#   bash scripts/ops/staging-seed.sh
#
# Exit codes:
#   0  all 3 stages green
#   1  DATABASE_URL is not set
#   2  seed-locales.ts failed
#   3  seed-youtube-channels.ts failed
#   4  psql verification failed (or returned unexpected count)
#   64 usage error (unknown flag)
#
# Companion: scripts/ops/staging-env.sh (sources DATABASE_URL)
#            scripts/ops/staging-backfill.sh (runs migrations + audit AFTER seeds)
# Cross-ref:  docs/v1-acceptance-test.md §1 (criterion 3: 3 YouTube channels)
#             prisma/schema.prisma (YouTubeChannel.localeId FK + Locale.code @unique)

set -euo pipefail

# ─── Flag parsing ──────────────────────────────────────────────────

for arg in "$@"; do
  case "$arg" in
    --help|-h)
      sed -n '2,/^set -euo pipefail/p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      printf '\n❌ Unknown flag: %s\n' "$arg" >&2
      printf '   Run with --help for usage.\n\n' >&2
      exit 64
      ;;
  esac
done

# ─── Pre-flight: DATABASE_URL must be set ─────────────────────────

if [[ -z "${DATABASE_URL:-}" ]]; then
  printf '\n❌ DATABASE_URL is not set.\n' >&2
  printf '   Source the staging env first: source scripts/ops/staging-env.sh\n' >&2
  printf '   (or export DATABASE_URL manually to your staging Supabase URL)\n\n' >&2
  exit 1
fi

# ─── Helpers ───────────────────────────────────────────────────────

banner() {
  local label="$1"
  local n="${2:-}"
  printf '\n\033[1;36m═══════════════════════════════════════════════════════════════\n'
  if [[ -n "$n" ]]; then
    printf '══ Stage %s: %s\n' "$n" "$label"
  else
    printf '══ %s\n' "$label"
  fi
  printf '\033[0m'
  printf '══ %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  printf '\n'
}

ok_or_exit() {
  local stage_label="$1"
  local exit_code="$2"
  local stage_n="${3:-?}"
  if [[ "$exit_code" -ne 0 ]]; then
    printf '\n\033[1;31m❌ Stage %s (%s) failed with exit code %s\033[0m\n' \
      "$stage_n" "$stage_label" "$exit_code" >&2
    printf '   Re-running is safe — both seed scripts are idempotent (upsert).\n' >&2
    exit "$stage_n"
  fi
}

# ─── Stage 1: seed-locales.ts ─────────────────────────────────────

banner "Stage 1 — seed-locales.ts (Locale + CountryLocaleRule rows)" 1
set +e
npx tsx scripts/db/seed-locales.ts
rc=$?
set -e
ok_or_exit "seed-locales.ts" "$rc" 1

# ─── Stage 2: seed-youtube-channels.ts ────────────────────────────

banner "Stage 2 — seed-youtube-channels.ts (≥3 YouTubeChannel rows)" 2
set +e
npx tsx scripts/db/seed-youtube-channels.ts
rc=$?
set -e
ok_or_exit "seed-youtube-channels.ts" "$rc" 2

# ─── Stage 3: psql verification ───────────────────────────────────

banner "Stage 3 — psql verification (3 active YouTubeChannel rows expected)" 3

if ! command -v psql >/dev/null 2>&1; then
  printf '\033[1;33m⚠️  psql not in PATH — skipping verification query.\033[0m\n'
  printf '   The seed scripts reported success; verify manually with:\n'
  printf '   npx prisma studio  (or any DB client)\n'
  printf '\n'
  printf '\033[1;32m✅ Stages 1-2 green (Stage 3 skipped).\033[0m\n'
  exit 0
fi

psql_bin="${PSQL_BIN:-psql}"

# Use DIRECT_URL when available (matches staging-bootstrap.md §2.3
# convention: direct connection for read queries, pgBouncer-pooled
# for runtime). Fall back to DATABASE_URL if DIRECT_URL is unset.
psql_url="${DIRECT_URL:-$DATABASE_URL}"

# The query: 3 expected rows (it-it, en-us, es-es). The output is the
# operator's eyeball verification that the seeds landed.
psql_out="$(
  "$psql_bin" "$psql_url" -t -A -F '|' <<'SQL'
SELECT
  "channelName",
  locale,
  "defaultLandingSlug",
  "trackingCode"
FROM "YouTubeChannel"
WHERE "isActive" = true
  AND locale IN ('it-it', 'en-us', 'es-es')
ORDER BY locale;
SQL
)" || {
  rc=$?
  printf '\n\033[1;31m❌ psql verification failed (exit code %s).\033[0m\n' "$rc" >&2
  printf '   The seed scripts reported success — the DB likely has the\n' >&2
  printf '   channels but psql could not connect (IPv6-only on free tier,\n' >&2
  printf '   password-encoding issue, or paused DB). Verify manually:\n' >&2
  printf '     npx prisma studio\n' >&2
  exit 4
}

printf '\n—— YouTubeChannel rows (active, it-it/en-us/es-es) ——\n'
if [[ -n "$psql_out" ]]; then
  printf '%s\n' "$psql_out"
else
  printf '\033[1;31m(no rows returned — seed may have failed silently)\033[0m\n'
fi

# Count the expected 3 rows (lines of non-empty output)
row_count=$(printf '%s\n' "$psql_out" | grep -c . || true)
if [[ "$row_count" -ne 3 ]]; then
  printf '\n\033[1;31m❌ Expected 3 YouTubeChannel rows, got %s.\033[0m\n' "$row_count" >&2
  exit 4
fi

# ─── Final summary ───────────────────────────────────────────────

banner "✅ All 3 stages green"
printf 'V1 staging seed complete:\n'
printf '   ✓ Locales seeded (Locale + CountryLocaleRule)\n'
printf '   ✓ YouTube channels seeded (≥3 active: it-it, en-us, es-es)\n'
printf '   ✓ psql verification passed (3 rows present)\n'
printf '\n'
printf 'Next: run scripts/ops/staging-backfill.sh to apply migrations + audit.\n'
printf '\n'
