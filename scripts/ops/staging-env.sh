#!/usr/bin/env bash
#
# scripts/ops/staging-env.sh
#
# Helper to provision staging env vars in the operator's shell.
#
# Usage:
#   source scripts/ops/staging-env.sh
#
# After sourcing, run:
#   ./scripts/ops/staging-backfill.sh
# Or, to validate connectivity:
#   psql "$DIRECT_URL" -c "SELECT current_database();"
#
# This script is safe to source multiple times. It does NOT auto-
# fetch credentials from any vendor under either sourcing path —
# the operator must explicitly choose Path A (`.env.staging.local`)
# OR Path B (manual export); the script picks up whichever the
# operator provides:
#
#   Path A — `vercel env pull .env.staging.local --environment=preview`
#            writes the canonical Vercel env pull output to the
#            project root. This script auto-sources it on every
#            run (with project-root + CWD fallback resolution).
#
#   Path B — Manual `export DATABASE_URL + DIRECT_URL` in the
#            operator's shell BEFORE sourcing this script. Useful
#            for ad-hoc sessions or when vercel CLI is unavailable.
#
# When sourced, the script also silently exports PRIMARY_DATABASE_URL
# (if not already set) and prints a status summary. It does NOT
# modify DATABASE_URL or DIRECT_URL — those are owned by the
# operator.
#
# When executed directly (e.g. `bash scripts/ops/staging-env.sh --check`):
# runs the same checks + an optional psql smoke-test.
#
# Companion: scripts/ops/staging-backfill.sh (consumes these env vars).
# Cross-ref:  docs/ops/staging-bootstrap.md §1.2 + §2.3 (Vercel Preview
#             env + Supabase connection strings) and
#             docs/ops/staging-run-log-2026-07-12.md (the empirical
#             "exit code 10 — env guard" run-log that motivated this helper).
#
# Exit codes (executed mode only):
#   0  env validated (and --check smoke test passed if --check was passed)
#   1  required env var missing
#   2  psql not in PATH (--check only)
#   3  psql smoke test failed (--check only)
#   64 usage error (unknown flag)
#
# Why this is a sourced helper (not an executor):
#   The env vars need to land in the operator's CURRENT shell so that
#   subsequent `npx prisma migrate deploy` / `npx tsx scripts/...` /
#   `./scripts/ops/staging-backfill.sh` invocations can see them. A
#   child-process script would only set them for its own process and
#   exit without polluting the parent. The `source` builtin is the
#   idiomatic answer; this script uses safe defaults (no `set -e` so
#   a missing var doesn't kill the operator's session).
#
# CRITICAL: this script must NEVER use `exit` directly outside of
#   executed-only paths — `exit` in a sourced script closes the
#   operator's parent shell. Use the `_bail` helper below, which
#   `return`s in sourced mode and `exit`s in executed mode.

# ─── Sourced-mode detection ────────────────────────────────────────
#
# `BASH_SOURCE[0]` is the path of the file being sourced. `$0` is the
# path of the current shell (when sourced) OR the script being executed
# (when run as a child). Comparing them tells us the mode:
#   - SOURCED=true  when sourced:    `BASH_SOURCE[0] != $0`
#   - SOURCED=false when executed:   `BASH_SOURCE[0] == $0`

if [[ "${BASH_SOURCE[0]}" != "${0}" ]]; then
  SOURCED=true
else
  SOURCED=false
fi

# ─── _bail helper ──────────────────────────────────────────────────
#
# Use this in place of `exit N` in any code path that runs in BOTH
# sourced + executed mode. In sourced mode it `return`s; in executed
# mode it `exit`s. The optional message is printed to stderr first.

_bail() {
  local code="${1:-1}"
  shift || true
  if [[ $# -gt 0 ]]; then
    printf '%s\n' "$*" >&2
  fi
  if [[ "${SOURCED}" == "true" ]]; then
    return "$code"
  else
    exit "$code"
  fi
}

# ─── Flag parsing (only honored when executed directly) ─────────────

IS_CHECK=false
IS_DRY_RUN=false
for arg in "$@"; do
  case "$arg" in
    --check)   IS_CHECK=true ;;
    --dry-run) IS_DRY_RUN=true ;;
    --help|-h)
      sed -n '2,/^# CRITICAL:/p' "$0" | sed 's/^# \{0,1\}//'
      _bail 0
      ;;
    *)
      _bail 64 "$(printf '\n❌ Unknown flag: %s\n   Run with --help for usage.\n' "$arg")"
      ;;
  esac
done

# ─── Auto-source .env.staging.local (if present) ──────────────────────────────────
#
# The file is the idiomatic vercel env pull output — operator-curated
# (not auto-fetched by this script). Idempotent: set -a / set +a toggles
# the allexport shell option for the duration of the source so every
# KEY=VALUE line in the file gets exported; re-sourcing the script is
# a no-op (every var is re-set to the same value).
#
# Provenance per var in .env.staging.local:
#   DATABASE_URL, DIRECT_URL        → Supabase Pooled/Direct (port 6543/5432)
#   LEMONSQUEEZY_API_KEY            → Lemon Squeezy Dashboard → Settings → API
#   LEMONSQUEEZY_STORE_ID           → Lemon Squeezy Dashboard → Settings → Stores
#   LEMONSQUEEZY_WEBHOOK_SECRET     → Lemon Squeezy Webhook creation (32-char hex)
#   NEXT_PUBLIC_APP_URL             → Vercel → Project → Settings → Domains (custom)
#   NEXT_PUBLIC_SUPABASE_*          → Mirror of server-side Supabase project URL + anon JWT
#   STRIPE_SECRET_KEY + _WEBHOOK_SECRET + ENABLE_STRIPE_CHECKOUT
#                                 → Stripe Dashboard → Developers → API keys
#                                   (active when ENABLE_STRIPE_CHECKOUT=true;
#                                    legacy/parity path during the LS-primary rollout)
#   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
#                                 → Stripe Dashboard → Developers → API keys
#                                   (browser-exposed pk_test_/pk_live_; surfaced as
#                                    .env even when ENABLE_STRIPE_CHECKOUT=false)
#
# SAFE: this script intentionally does NOT use `set -e` (see header).
# A missing .env.staging.local falls through silently with an
# informational note, so an operator without it isn’t kicked out of
# their shell.

# Resolve .env.staging.local location. Order of preference:
#   1. <project-root>/.env.staging.local  (canonical Vercel env pull destination)
#   2. <cwd>/.env.staging.local           (operator-override; works when sourced full-path)
# Both paths are tried; whichever exists first wins. If neither
# exists, the script falls back to manual export (Path B in the
# header blockquote).
# Note: this resolution is idempotent — SCRIPT_DIR is computed once
# per source invocation. Re-sourcing the script re-derives the same
# paths so a fallback is sticky across re-sources.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-${0}}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR/../.."
STAGING_ENV_FILE=""
if [[ -f "$PROJECT_ROOT/.env.staging.local" ]]; then
  STAGING_ENV_FILE="$PROJECT_ROOT/.env.staging.local"
elif [[ -f ./.env.staging.local ]]; then
  STAGING_ENV_FILE="./.env.staging.local"
fi

if [[ -n "$STAGING_ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1091  # .env.staging.local is operator-curated, intentionally outside the lint target
  source "$STAGING_ENV_FILE"
  set +a
  printf '—— sourced %s (%d lines, %d env vars) ——
' \
    "$STAGING_ENV_FILE" \
    "$(wc -l < "$STAGING_ENV_FILE")" \
    "$(grep -cE '^[A-Z_][A-Z0-9_]*=' "$STAGING_ENV_FILE" || echo 0)"
else
  printf '—— .env.staging.local NOT found (searched project root: %s and cwd: %s) ——
' \
    "$PROJECT_ROOT" "$(pwd)"
  printf '   Recommendation: run `vercel env pull .env.staging.local \
'
  printf '                              --environment=preview` from
'
  printf '   the project root (vercel login first, project team SSO
'
  printf '   required). The script auto-sources it on every subsequent
'
  printf '   invocation. See the header "Credential sourcing" block for
'
  printf '   the full workflow.
'
fi

# ─── PRIMARY_DATABASE_URL mirror ────────────────────────────────────
#
# PRIMARY_DATABASE_URL is the canonical env name honored by the audit +
# drain scripts (per staging-backfill.sh and commit 8b21b7d — direct
# connection, full privilege). When unset, mirror DIRECT_URL so the
# audit honors a single canonical connection string. Idempotent: if
# already set, leave it alone (operator may have intentionally pointed
# it at a different DB, e.g. a read replica).

PRIMARY_MIRRORED=false
if [[ -z "${PRIMARY_DATABASE_URL:-}" && -n "${DIRECT_URL:-}" ]]; then
  export PRIMARY_DATABASE_URL="$DIRECT_URL"
  PRIMARY_MIRRORED=true
fi

# ─── Credential sourcing notes (full blockquote in header; recapped here) ──
# The header comment (top of file) has the full Path A / Path B workflow.
# This sibling blockquote reminds operators that:
#   - `.env.staging.local` is auto-sourced if present (already happened above)
#   - DATABASE_URL/DIRECT_URL are NOT auto-overwritten by this script —
#     whatever the operator set (via the file, manual export, or pre-existing
#     shell-state) is what the downstream tools see.

# ─── Status print ──────────────────────────────────────────────────

printf '\n—— scripts/ops/staging-env.sh status ——\n'

if [[ -n "${DATABASE_URL:-}" ]]; then
  printf '✓ DATABASE_URL         set (%d chars)\n' "${#DATABASE_URL}"
else
  printf '✗ DATABASE_URL         UNSET — required for migrate deploy + runtime\n'
  printf '    export DATABASE_URL="postgres://postgres.<STAGING-REF>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres"\n'
  printf '    See docs/ops/staging-bootstrap.md §2.3 (pooled, port 6543, pgBouncer)\n'
fi

if [[ -n "${DIRECT_URL:-}" ]]; then
  printf '✓ DIRECT_URL           set (%d chars)\n' "${#DIRECT_URL}"
else
  printf '✗ DIRECT_URL           UNSET — required for migrate deploy + audit\n'
  printf '    export DIRECT_URL="postgres://postgres:<password>@db.<STAGING-REF>.supabase.com:5432/postgres"\n'
  printf '    See docs/ops/staging-bootstrap.md §2.3 (direct, port 5432, IPv6-only on free tier)\n'
fi

if [[ -n "${PRIMARY_DATABASE_URL:-}" ]]; then
  if [[ "$PRIMARY_MIRRORED" == true ]]; then
    printf '✓ PRIMARY_DATABASE_URL mirrored from DIRECT_URL (%d chars)\n' "${#PRIMARY_DATABASE_URL}"
  else
    printf '✓ PRIMARY_DATABASE_URL set (%d chars) — explicit (not mirrored)\n' "${#PRIMARY_DATABASE_URL}"
  fi
else
  printf '✗ PRIMARY_DATABASE_URL UNSET — audit scripts will fail\n'
  printf '    Set DIRECT_URL (PRIMARY_DATABASE_URL auto-mirrors) OR export PRIMARY_DATABASE_URL directly.\n'
fi

# ─── Next-steps hint ──────────────────────────────────────────────

if [[ -n "${DATABASE_URL:-}" && -n "${DIRECT_URL:-}" ]]; then
  printf '\n✅ Staging env ready. Next steps:\n'
  printf '   1. Smoke-test connectivity:\n'
  printf '        psql "$DIRECT_URL" -c "SELECT current_database();"\n'
  printf '   2. Run the staging backfill pipeline:\n'
  printf '        ./scripts/ops/staging-backfill.sh\n'
  printf '   3. Or run audit-only (--dry-run):\n'
  printf '        ./scripts/ops/staging-backfill.sh --dry-run\n'
else
  printf '\n⚠️  One or more required env vars are unset. See above.\n'
  printf '   Re-source this script after exporting the missing vars.\n'
fi

# ─── --dry-run mode (printed-and-exit) ────────────────────────────

if [[ "$IS_DRY_RUN" == true ]]; then
  _bail 0
fi

# ─── --check mode (validate + psql smoke test) ────────────────────

if [[ "$IS_CHECK" == true ]]; then
  if [[ -z "${DIRECT_URL:-}" ]]; then
    _bail 1 "$(printf '\n❌ --check requires DIRECT_URL to be set.\n\n')"
  fi

  if [[ -z "${DATABASE_URL:-}" ]]; then
    _bail 1 "$(printf '\n❌ --check requires DATABASE_URL to be set.\n\n')"
  fi

  if ! command -v psql >/dev/null 2>&1; then
    _bail 2 "$(printf '\n❌ psql not in PATH. Install postgresql-client or set PSQL_BIN=<path>.\n\n')"
  fi

  psql_bin="${PSQL_BIN:-psql}"
  printf '\n—— psql smoke test against DIRECT_URL ——\n'
  if "$psql_bin" "$DIRECT_URL" -c "SELECT current_database(), current_user, version();" 2>&1; then
    printf '\n✅ psql smoke test passed. Staging DB is reachable.\n'
    _bail 0
  else
    rc=$?
    _bail 3 "$(printf '\n❌ psql smoke test failed with exit code %s.\n   Common causes:\n   - free-tier Supabase is IPv6-only: ensure your shell has IPv6\n   - password has unescaped special chars (use %%XX URL encoding)\n   - DB is paused (Supabase free tier pauses after 1wk of inactivity)\n\n' "$rc")"
  fi
fi
