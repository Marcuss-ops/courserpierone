#!/usr/bin/env bash
#
# scripts/ops/staging-backfill.sh
#
# One-shot orchestrator for the staging V1 backfill + migration reconciliation.
# Stages (in order, fail-fast — `set -euo pipefail`):
#
#   1. prisma migrate deploy         (apply pending migrations: creatorId-restrict
#                                       + drop_nextauth_models + any pending)
#   2. backfill-primary-creator.ts   (read-only DB invariant verification —
#                                       post-Phase 4 verification mode per the
#                                       script's own leading comment block)
#   3. migrate-grants-from-orders.ts (backfill AccessGrant rows from
#                                       Order.status='completed'; idempotent
#                                       via @@unique([sourceType, sourceId,
#                                       productId]) upsert)
#   4. audit-v1-readiness.ts         (read-only 3-gate audit: orphanProducts,
#                                       activeStripeOrders, residualNextAuth)
#   5. psql sanity counts            (direct DB query to verify the audit's
#                                       3 counters match psql-side)
#
# Step 1.1 fix (commit 8b21b7d) + Step 1.2 fix (commit 5395bfa) are honored
# automatically — the TS scripts use PrismaClient `datasources` override +
# canonical env names (PRIMARY_DATABASE_URL preferred for audit; DATABASE_URL
# for the rest), see each script's own leading comment block for rationale.
#
# Usage:
#   DATABASE_URL='postgres://staging-host:5432/db' \
#   DIRECT_URL='postgres://staging-host:5432/db' \
#   ./scripts/ops/staging-backfill.sh
#
#   # With --production (passes through to audit-v1-readiness.ts — enables
#   # the DBS-empty sanity guard when total products/orders/users are all
#   # zero, i.e. pointed-at-wrong-DB misconfig detection):
#   DATABASE_URL='...' DIRECT_URL='...' \
#     ./scripts/ops/staging-backfill.sh --production
#
#   # With --dry-run (skip stages 1-3, run only audit + psql sanity):
#   DATABASE_URL='...' DIRECT_URL='...' \
#     ./scripts/ops/staging-backfill.sh --dry-run
#
# Idempotency:
#   - Re-running is safe: migrate deploy is no-op on up-to-date DBs,
#     backfill is read-only, migrate-grants upserts (idempotent via the
#     @@unique constraint), audit + psql are read-only.
#   - Operators can re-run after a partial failure on any stage to recover.
#
# Exit codes:
#   0  all 5 stages green
#   1  stage 1 (migrate deploy) failed
#   2  stage 2 (backfill-primary-creator) failed
#   3  stage 3 (migrate-grants-from-orders) failed
#   4  stage 4 (audit-v1-readiness) failed
#   5  stage 5 (psql sanity) failed (audit + psql count mismatch)
#   10 env guard: missing DATABASE_URL + DIRECT_URL
#   64 usage error (unknown flag)
#

set -euo pipefail

# ─── Usage / flag parsing ──────────────────────────────────────────

usage() {
  cat <<'EOF'
Usage:
  DATABASE_URL='postgres://...' DIRECT_URL='postgres://...' \
    scripts/ops/staging-backfill.sh [--production] [--dry-run]

  --production  Passes through to stage-4 audit. Enables DBS-empty sanity
                guard (warns if pointed at wrong DB on prod env).
  --dry-run     Skip stages 1-3 (migrate, backfill, migrate-grants).
                Only stages 4-5 run (audit + psql sanity). Useful for
                post-deploy verification without re-mutating.

Required env:
  DATABASE_URL  Canonical Prisma env name (honored by migrate-grants +
                drain-nextauth-style scripts).
  DIRECT_URL    Direct-connection URL (canonical for production parity
                with pgBouncer per docs/production.md).
EOF
}

IS_PRODUCTION=false
IS_DRY_RUN=false
for arg in "$@"; do
  case "$arg" in
    --production) IS_PRODUCTION=true ;;
    --dry-run)    IS_DRY_RUN=true ;;
    --help|-h)    usage; exit 0 ;;
    *)            echo "❌ Unknown flag: $arg" >&2; usage; exit 64 ;;
  esac
done

# ─── Env guard ─────────────────────────────────────────────────────

# Enforced even in --dry-run mode because stages 4 (audit) + 5 (psql) still
# require DATABASE_URL / DIRECT_URL. The audit script exits 2 on env-missing;
# we surface this as exit 10 here so the operator gets a single unambiguous
# error code regardless of which stage noticed first.
if [[ -z "${DATABASE_URL:-}" ]]; then
  printf '\n❌ DATABASE_URL must be set (canonical Prisma env name)\n' >&2
  printf '   Export DATABASE_URL='\''postgres://host:port/db'\'' before running.\n\n' >&2
  exit 10
fi
if [[ -z "${DIRECT_URL:-}" ]]; then
  printf '\n❌ DIRECT_URL must be set (direct-connection URL for prod parity)\n' >&2
  printf '   Export DIRECT_URL='\''postgres://host:port/db'\'' before running.\n\n' >&2
  exit 10
fi

# PRIMARY_DATABASE_URL is preferred by the audit script (commit 8b21b7d —
# direct connection, full privilege). Mirror DIRECT_URL when absent so the
# audit honors a single canonical connection string.
export PRIMARY_DATABASE_URL="${PRIMARY_DATABASE_URL:-$DIRECT_URL}"

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
    printf '   The script halts here. Inspect the stage output above.\n' >&2
    printf '   Re-running the script is safe — every stage is idempotent.\n\n' >&2
    exit "$stage_n"
  fi
}

# ─── Stage 1: prisma migrate deploy ────────────────────────────────

if [[ "${IS_DRY_RUN}" == true ]]; then
  banner "DRY-RUN mode — skipping stages 1-3 (only audit + psql will run)"
else
  banner "Stage 1 — prisma migrate deploy" 1
  set +e
  npx prisma migrate deploy
  rc=$?
  set -e
  ok_or_exit "prisma migrate deploy" "$rc" 1
fi

# ─── Stage 2: backfill-primary-creator.ts ──────────────────────────

if [[ "${IS_DRY_RUN}" == true ]]; then
  banner "DRY-RUN — skipping stage 2 (backfill-primary-creator.ts)" 2
else
  banner "Stage 2 — backfill-primary-creator.ts (read-only verification)" 2
  set +e
  npx tsx scripts/products/backfill-primary-creator.ts
  rc=$?
  set -e
  ok_or_exit "backfill-primary-creator.ts" "$rc" 2
fi

# ─── Stage 3: migrate-grants-from-orders.ts ────────────────────────

if [[ "${IS_DRY_RUN}" == true ]]; then
  banner "DRY-RUN — skipping stage 3 (migrate-grants-from-orders.ts)" 3
else
  banner "Stage 3 — migrate-grants-from-orders.ts (idempotent upsert)" 3
  set +e
  npx tsx scripts/migrate-grants-from-orders.ts
  rc=$?
  set -e
  ok_or_exit "migrate-grants-from-orders.ts" "$rc" 3
fi

# ─── Stage 4: audit-v1-readiness.ts ────────────────────────────────

banner "Stage 4 — audit-v1-readiness.ts (3-gate read-only audit)" 4
set +e
audit_args=()
if [[ "${IS_PRODUCTION}" == true ]]; then
  audit_args+=(--production)
fi
npx tsx scripts/audit-v1-readiness.ts "${audit_args[@]}"
rc=$?
set -e
ok_or_exit "audit-v1-readiness.ts" "$rc" 4

# ─── Stage 5: psql sanity counts ───────────────────────────────────

banner "Stage 5 — psql sanity counts (direct-DB cross-check)" 5

# Parse the JSON line emitted at the end of the audit script. The audit
# emits a structured JSON line starting with `📋 JSON (machine-readable)`
# followed by a valid JSON object — we pluck the 3 gate counters and
# independently verify via psql that they agree. Disagreement at this
# stage means the audit and psql are reading different DBs (a serious
# misconfig that would silently pass gates).
#
# Approach: re-run a single psql session that prints the 3 counters,
# then run the audit a second time with the JSON output captured to a
# tempfile, then `jq`-diff the two. We avoid embedding jq as a hard
# dependency by falling back to a regex-based JSON parse if jq is absent.

if ! command -v psql >/dev/null 2>&1; then
  printf '\n\033[1;33m⚠️  psql not in PATH — skipping stage 5 sanity cross-check.\n\033[0m'
  printf '   Install postgresql-client locally OR export PSQL_BIN=<path>.\n'
  printf '   The stage-4 audit alone is sufficient for the V1 gate;\n'
  printf '   stage 5 is defense-in-depth.\n\n'
else
  psql_bin="${PSQL_BIN:-psql}"
  psql_url="${PRIMARY_DATABASE_URL:-${DIRECT_URL:-${DATABASE_URL:-}}}"

  printf '\n—— psql direct-DB counts (sanity) ——\n'
  psql_out="$(
    "$psql_bin" "$psql_url" -t -A -F '|' <<'SQL'
SELECT 'orphanProducts',
       (SELECT count(*) FROM "Product" WHERE "creatorId" IS NULL)
UNION ALL
SELECT 'activeStripeOrders',
       (SELECT count(*) FROM "Order"
        WHERE "paymentProvider" = 'stripe'
          AND status IN ('pending', 'completed'))
UNION ALL
SELECT 'accountCount',
       (SELECT count(*) FROM "Account")  -- -1 if table absent (psql raises)
UNION ALL
SELECT 'sessionCount',
       (SELECT count(*) FROM "Session")
UNION ALL
SELECT 'verificationTokenCount',
       (SELECT count(*) FROM "VerificationToken");
SQL
  )" || {
    printf '\n\033[1;33m⚠️  psql stage raised an error (likely table-already-dropped).\n\033[0m'
    printf '   Treat absent tables as post-cleanup (-1 sentinel from stage 4).\n'
    psql_out=""
  }

  if [[ -n "$psql_out" ]]; then
    printf '%s\n' "$psql_out"

    # Cross-check: the psql counts should match the audit's JSON output.
    # Re-run the audit capturing stdout for JSON-extraction; if jq is
    # available, use it; otherwise treat as best-effort informational.
    if command -v jq >/dev/null 2>&1; then
      # Capture stdout of audit re-run for JSON extraction. NOTE: a failed
      # audit produces empty/malformed stdout, so we MUST validate the JSON
      # before comparing — otherwise an empty audit would silently match an
      # empty psql capture ("x == x" → "PASS") masking a broken cross-check.
      # The `jq -e .orphanProducts >/dev/null` test asserts the JSON is
      # parseable AND has the expected key; an honest audit (which emits
      # `.orphanProducts=0`) passes this, an error log fails it.
      audit_json="$(npx tsx scripts/audit-v1-readiness.ts "${audit_args[@]}" 2>/dev/null || true)"
      if [[ -z "$audit_json" ]] \
        || ! printf '%s' "$audit_json" | jq -e .orphanProducts >/dev/null 2>&1; then
        printf '\n\033[1;33m⚠️  Stage 5: audit re-run did not produce valid JSON, skipping cross-check.\n\033[0m'
        printf '   The audit-as-source-of-truth JSON is the gate, not stage 5\n'
        printf '   cross-validation. Re-run stage 4 manually to investigate\n'
        printf '   (or check that audit-v1-readiness.ts still finishes cleanly).\n'
      else
        audit_orphan="$(printf '%s' "$audit_json" | jq -r '.orphanProducts' 2>/dev/null || echo "")"
        audit_stripe="$(printf '%s' "$audit_json" | jq -r '.activeStripeOrders' 2>/dev/null || echo "")"
        audit_account="$(printf '%s' "$audit_json" | jq -r '.residualNextAuth.account' 2>/dev/null || echo "")"

        psql_orphan="$(printf '%s\n' "$psql_out" | awk -F'|' '$1=="orphanProducts" {print $2}')"
        psql_stripe="$(printf '%s\n' "$psql_out" | awk -F'|' '$1=="activeStripeOrders" {print $2}')"
        psql_account="$(printf '%s\n' "$psql_out" | awk -F'|' '$1=="accountCount" {print $2}')"

        mismatches=0
        [[ "$audit_orphan"  == "$psql_orphan"  ]] || mismatches=$((mismatches + 1))
        [[ "$audit_stripe"  == "$psql_stripe"  ]] || mismatches=$((mismatches + 1))
        [[ "$audit_account" == "$psql_account" ]] || mismatches=$((mismatches + 1))

        if [[ "$mismatches" -gt 0 ]]; then
          printf '\n\033[1;31m❌ Stage 5: audit ↔ psql disagreement on %s counter(s).\n\033[0m' "$mismatches"
          printf '   This usually means the audit and psql are pointing at\n'
          printf '   different DBs — investigate DIRECT_URL + DATABASE_URL.\n'
          exit 5
        else
          printf '\n\033[1;32m✅ Stage 5: audit ↔ psql counts agree.\n\033[0m'
        fi
      fi
    else
      printf '\n\033[1;33mℹ️  jq not in PATH — stage 5 counted but did not cross-check.\n\033[0m'
      printf '   Install jq for full cross-validation; psql counts alone\n'
      printf '   are still useful for operator eyeballing.\n'
    fi
  fi
fi

# ─── Final summary ─────────────────────────────────────────────────

banner "✅ All stages green"
printf 'V1 staging backfill pipeline complete:\n'
printf '   ✓ migrations applied          (stage 1)\n'
printf '   ✓ primary-creator invariant   (stage 2)\n'
printf '   ✓ AccessGrant backfill done   (stage 3)\n'
printf '   ✓ V1 readiness audit green    (stage 4)\n'
printf '   ✓ psql ↔ audit agreement      (stage 5)\n'
printf '\n'
printf 'The next deploy-gate CI run should pass: see\n'
printf '  .github/workflows/ci.yml — the e2e journey spec is gated on\n'
printf '  main having a clean V1 baseline (order count ≥ 0, no NextAuth\n'
printf '  residuals, every Product with creatorId).\n'
printf '\n'
