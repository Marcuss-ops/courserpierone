#!/usr/bin/env bash
#
# scripts/ops/vercel-prod-env.sh
#
# Idempotent batch-add of all Vercel Production env vars for the
# Courssy codebase. Groups vars by category for readability.
#
# Usage:
#   # 0. Run from the project root (where vercel.json lives).
#
#   1. Authenticate with Vercel (one-time per shell):
#        vercel login
#
#   2. Set the env values as local shell vars (so the script can pipe
#      them into `vercel env add` without prompting). The script maps
#      each Vercel env var to a LOCAL_SHELL_VAR — see the category
#      table below for the exact mapping. Example:
#        export SUPABASE_DATABASE_URL='postgres://postgres.<REF>:<PWD>@aws-0-<region>.pooler.supabase.com:6543/postgres'
#        export SUPABASE_DIRECT_URL='postgres://postgres:<PWD>@db.<REF>.supabase.com:5432/postgres'
#        export LEMONSQUEEZY_API_KEY='sk_live_...'
#        ... (etc — see the categories below for the full list)
#
#   3. Run the script:
#        bash scripts/ops/vercel-prod-env.sh
#
#      Or, dry-run (print what WOULD be added without adding):
#        bash scripts/ops/vercel-prod-env.sh --dry-run
#
#      Or, auto-generate the random secrets (CRON_SECRET +
#      LOG_ERROR_SECRET + WS_SECRET) if their shell vars are unset:
#        bash scripts/ops/vercel-prod-env.sh --auto-generate
#
# Cross-refs:
#   - docs/production.md §1.2 (Production env list)
#   - docs/ops/lemon-squeezy-live-setup.md §1.3 + §5.2 (LS env schema)
#   - docs/production-hardening.md §11 (Deploy-time env matrix)
#   - src/lib/env.ts (canonical env definitions; the env schema
#     referenced by `npx tsc --noEmit` at build time)
#
# Why a script (not a runbook):
#   Vercel env vars must be set per-scope. With 25+ vars to add, the
#   manual process is error-prone (typos, wrong scope, missed vars).
#   This script makes it reproducible + idempotent: re-running skips
#   vars already set in the Production scope.
#
# Exit codes:
#   0  success (or dry-run)
#   1  vercel CLI not in PATH or not authenticated
#   2  not in a Vercel project root
#   3  `vercel env add` returned non-zero (re-run after fixing the
#      offending env var; the script will skip vars it already added)
#   64 usage error (unknown flag)
#
# NOT in scope (deliberately skipped):
#   - STRIPE_* (project is post-Phase 7 Stripe-removal; no new
#     checkouts are created via Stripe. Existing keys may still be
#     present for historical-order reads but are not required for
#     new deploys.)
#   - OPENAI_API_KEY (optional tier; skipped if shell var unset, not
#     required for core V1 flows — see docs/production.md §5.1).
#   - NEXT_PUBLIC_LOG_ERROR_SECRET (not yet referenced by any code
#     in the codebase; included for future Sentry-bridge parity.)

# CRITICAL: this script must be EXECUTED, not sourced. Sourcing would
# either kill the shell (via `set -e` + missing var) or silently skip
# checks. The shebang + the explicit `set -euo pipefail` make the
# executed-only contract explicit.

set -euo pipefail

# ─── Flag parsing ──────────────────────────────────────────────────

IS_DRY_RUN=false
IS_AUTO_GENERATE=false
for arg in "$@"; do
  case "$arg" in
    --dry-run)        IS_DRY_RUN=true ;;
    --auto-generate)  IS_AUTO_GENERATE=true ;;
    --help|-h)
      sed -n '2,/^# Exit codes:/p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      printf '\n❌ Unknown flag: %s\n' "$arg" >&2
      printf '   Run with --help for usage.\n\n' >&2
      exit 64
      ;;
  esac
done

# ─── Pre-flight: vercel CLI + auth + project root ─────────────────

if ! command -v vercel >/dev/null 2>&1; then
  printf '\n❌ vercel CLI not in PATH. Install: npm i -g vercel\n\n' >&2
  exit 1
fi

# `vercel env ls` requires auth. If it fails, prompt the user to login.
if ! vercel env ls >/dev/null 2>&1; then
  printf '\n❌ vercel CLI not authenticated. Run: vercel login\n\n' >&2
  exit 1
fi

# Must run from the project root (where vercel.json or .vercel/ lives).
if [[ ! -f vercel.json && ! -d .vercel ]]; then
  printf '\n❌ Not in a Vercel project root. Run from the directory containing vercel.json.\n\n' >&2
  exit 2
fi

# ─── Fetch existing env vars (Production scope) ───────────────────

# `vercel env ls production` output format (TSV):
#   name     value       environments
#   DATABASE_URL  *****    Production, Preview, Development
# We extract just the names for the idempotency check.
EXISTING_PROD_ENVS=$(vercel env ls production 2>/dev/null | awk 'NR>1 && $1 != "" {print $1}' | sort -u)

# Helper: returns 0 (true) if env var is already set in Production scope
_is_in_production() {
  local var_name="$1"
  printf '%s\n' "$EXISTING_PROD_ENVS" | grep -qxF "$var_name"
}

# Helper: generate a random secret using openssl (32 bytes base64 = 44 chars)
_gen_secret() {
  openssl rand -base64 32
}

# ─── Categories ───────────────────────────────────────────────────
# Each entry: VERCEL_NAME|LOCAL_SHELL_VAR|DESCRIPTION
# LOCAL_SHELL_VAR is the operator's local env var to source the value
# from. Description is for the dry-run output.
#
# Stripe vars are DELIBERATELY absent (post-Phase 7 removal).

# Category 1: Database & Supabase
CATEGORY_DATABASE=(
  "DATABASE_URL|SUPABASE_DATABASE_URL|Supabase pooled URL (port 6543, pgBouncer)"
  "DIRECT_URL|SUPABASE_DIRECT_URL|Supabase direct URL (port 5432, IPv6-only on free tier)"
  "SUPABASE_URL|SUPABASE_URL|Supabase project URL (https://<ref>.supabase.co)"
  "SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SERVICE_ROLE_KEY|Supabase service role key (server-only, full privilege)"
  "NEXT_PUBLIC_SUPABASE_URL|SUPABASE_URL|Same as SUPABASE_URL (browser-exposed)"
  "NEXT_PUBLIC_SUPABASE_ANON_KEY|SUPABASE_ANON_KEY|Supabase anon JWT (browser-safe)"
  "NEXT_PUBLIC_APP_URL|APP_URL|Public app URL (e.g. https://www.courssy.com)"
)

# Category 2: Payment (Lemon Squeezy ONLY — post-Phase 7 Stripe removed)
CATEGORY_PAYMENT=(
  "LEMONSQUEEZY_API_KEY|LEMONSQUEEZY_API_KEY|LS live API key (post KYC/KYB approval)"
  "LEMONSQUEEZY_STORE_ID|LEMONSQUEEZY_STORE_ID|LS live store ID"
  "LEMONSQUEEZY_WEBHOOK_SECRET|LEMONSQUEEZY_WEBHOOK_SECRET|LS live webhook signing secret (32-char hex, 6-40 chars per LS)"
)

# Category 3: Email (SMTP)
CATEGORY_EMAIL=(
  "EMAIL_SERVER_HOST|EMAIL_SERVER_HOST|SMTP host"
  "EMAIL_SERVER_PORT|EMAIL_SERVER_PORT|SMTP port (typically 587)"
  "EMAIL_SERVER_USER|EMAIL_SERVER_USER|SMTP username"
  "EMAIL_SERVER_PASSWORD|EMAIL_SERVER_PASSWORD|SMTP password"
  "EMAIL_FROM|EMAIL_FROM|From address (e.g. noreply@courssy.com)"
)

# Category 4: Redis (Upstash)
CATEGORY_REDIS=(
  "KV_REST_API_URL|UPSTASH_REDIS_REST_URL|Upstash REST URL (preferred over UPSTASH_REDIS_REST_URL by the app)"
  "KV_REST_API_TOKEN|UPSTASH_REDIS_REST_TOKEN|Upstash REST token"
)

# Category 5: Security & Ops
# CRON_SECRET, LOG_ERROR_SECRET, WS_SECRET are auto-generated if --auto-generate
# is passed AND the corresponding shell var is unset.
CATEGORY_SECURITY=(
  "ALERT_WEBHOOK_URL|ALERT_WEBHOOK_URL|Slack/Discord incoming webhook URL (alerts from server-error-sink + deploy-gate)"
  "CRON_SECRET|CRON_SECRET|ops rand -base64 32|Secret for cron route auth (Bearer token); auto-generates with --auto-generate"
  "LOG_ERROR_SECRET|LOG_ERROR_SECRET|ops rand -base64 32|Secret for error log route auth; auto-generates with --auto-generate"
  "WS_SECRET|WS_SECRET|ops rand -base64 32|Secret for WebSocket bridge auth (server.ts); auto-generates with --auto-generate"
  "OPENAI_API_KEY|OPENAI_API_KEY|OpenAI API key (optional tier — see docs/production.md §5.1)"
)

# Category 6: OAuth (Google — required by Supabase Auth for Google sign-in)
CATEGORY_OAUTH=(
  "GOOGLE_CLIENT_ID|GOOGLE_CLIENT_ID|Google OAuth client ID"
  "GOOGLE_CLIENT_SECRET|GOOGLE_CLIENT_SECRET|Google OAuth client secret"
)

# ─── Add env vars by category ─────────────────────────────────────

ADDED=0
SKIPPED=0
FAILED=0

add_var() {
  local vercel_name="$1"
  local shell_var="$2"
  local description="$3"

  if _is_in_production "$vercel_name"; then
    printf '  [skip] %-32s (already in Production)\n' "$vercel_name"
    SKIPPED=$((SKIPPED + 1))
    return 0
  fi

  local value="${!shell_var:-}"

  # Auto-generate the 3 random secrets if the flag is set
  if [[ -z "$value" && "$IS_AUTO_GENERATE" == true ]]; then
    case "$vercel_name" in
      CRON_SECRET|LOG_ERROR_SECRET|WS_SECRET)
        value="$(_gen_secret)"
        printf '  [gen]  %-32s (auto-generated %d-char secret)\n' "$vercel_name" "${#value}"
        ;;
    esac
  fi

  if [[ -z "$value" ]]; then
    printf '  [skip] %-32s (shell var $%s is unset; pass --auto-generate to auto-generate the random secrets)\n' "$vercel_name" "$shell_var"
    SKIPPED=$((SKIPPED + 1))
    return 0
  fi

  if [[ "$IS_DRY_RUN" == true ]]; then
    printf '  [dry-run] %-32s <- $%s (%s)\n' "$vercel_name" "$shell_var" "$description"
    SKIPPED=$((SKIPPED + 1))
    return 0
  fi

  printf '  [add]  %-32s <- $%s\n' "$vercel_name" "$shell_var"
  if printf '%s\n' "$value" | vercel env add "$vercel_name" production >/dev/null 2>&1; then
    ADDED=$((ADDED + 1))
  else
    local rc=$?
    printf '  [FAIL] %-32s (vercel env add returned %d)\n' "$vercel_name" "$rc" >&2
    FAILED=$((FAILED + 1))
    return 1
  fi
}

add_category() {
  local category_name="$1"
  shift
  local entries=("$@")
  printf '\n—— %s ——\n' "$category_name"
  for entry in "${entries[@]}"; do
    IFS='|' read -r vercel_name shell_var description <<< "$entry"
    add_var "$vercel_name" "$shell_var" "$description" || true
  done
}

add_category "1. Database & Supabase"       "${CATEGORY_DATABASE[@]}"
add_category "2. Payment (Lemon Squeezy)"   "${CATEGORY_PAYMENT[@]}"
add_category "3. Email (SMTP)"              "${CATEGORY_EMAIL[@]}"
add_category "4. Redis (Upstash)"           "${CATEGORY_REDIS[@]}"
add_category "5. Security & Ops"            "${CATEGORY_SECURITY[@]}"
add_category "6. OAuth (Google)"            "${CATEGORY_OAUTH[@]}"

# ─── Final summary ───────────────────────────────────────────────

printf '\n—— Summary ——\n'
printf '  Added:   %d\n' "$ADDED"
printf '  Skipped: %d (already in Production or shell var unset)\n' "$SKIPPED"
if [[ "$FAILED" -gt 0 ]]; then
  printf '  Failed:  %d\n' "$FAILED" >&2
  printf '\n⚠️  Some env vars failed to add. Re-run the script after fixing them —\n' >&2
  printf '   already-added vars will be skipped on re-run.\n' >&2
  exit 3
fi
printf '\n✅ vercel-prod-env complete. Verify: npx vercel env ls production\n'
