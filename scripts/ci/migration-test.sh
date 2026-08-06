#!/usr/bin/env bash
# Migration apply-test (Fase 0 step 4 of Quality Gate Upgrade).
#
# Verifies `prisma/migrations/*` apply cleanly to a fresh Postgres
# (cumulative, from empty). Complement of the in-line "Schema migration
# safety" check in ci.yml typecheck job (content-based) — this script
# is execution-based: it actually runs the SQL against a real DB.
#
# Catches:
# - Malformed SQL syntax
# - Migration chains with broken dependencies (table referenced before created)
# - Cumulative drift that typecheck + dep-cruiser + ts-prune wouldn't detect
# - Pre-existing migrations that wouldn't apply on a clean DB (we test
#   "from-scratch" semantics, not "as-deployed semantics" — those are
#   covered by the staging CI workflow)
#
# Usage:
#   bash scripts/ci/migration-test.sh
# Returns: exit 0 on success, exit 1 on any migration failure.
#
# Requires: docker (postgres:16-alpine) for local runs, psql client, npx prisma.
# In CI, set MIGRATION_TEST_MANAGED_DB=1 and provide DATABASE_URL/DIRECT_URL
# for a GitHub Actions PostgreSQL service container. The script then reuses
# that managed database instead of starting a second Docker container.

set -euo pipefail

CONTAINER_NAME="pg-migtest-$$"
DB_NAME="migtest_$$"
DB_PORT="5432"
TIMEOUT_SECONDS="60"
MANAGED_DB="${MIGRATION_TEST_MANAGED_DB:-0}"

if [ "$MANAGED_DB" = "1" ] && [ -z "${DATABASE_URL:-}" ]; then
  echo "::error::MIGRATION_TEST_MANAGED_DB=1 requires DATABASE_URL."
  exit 1
fi

echo "─ Migration apply-test $(date +%FT%TZ) ─"

if [ "$MANAGED_DB" = "1" ]; then
  # The caller owns this service database and its cleanup.
  DB_HOST="${MIGRATION_TEST_DB_HOST:-localhost}"
  DB_PORT="${MIGRATION_TEST_DB_PORT:-5432}"
  DB_NAME="${MIGRATION_TEST_DB_NAME:-${DATABASE_URL##*/}}"
  DB_URL="$DATABASE_URL"
  DIRECT_DB_URL="${DIRECT_URL:-$DATABASE_URL}"
  echo "Using managed PostgreSQL at ${DB_HOST}:${DB_PORT}/${DB_NAME}"
else
  # ── 1. Start ephemeral postgres via docker ─────────────────────────
  docker run -d \
    --name "${CONTAINER_NAME}" \
    -e POSTGRES_USER=postgres \
    -e POSTGRES_PASSWORD=postgres \
    -e POSTGRES_DB="${DB_NAME}" \
    -p "${DB_PORT}:5432" \
    postgres:16-alpine \
    > /dev/null

  # Trap: always clean up the container, even on error
  trap "echo '─ Cleanup ephemeral postgres ─'; docker rm -f ${CONTAINER_NAME} > /dev/null 2>&1 || true" EXIT
  DB_URL="postgresql://postgres:postgres@${DB_HOST:-localhost}:${DB_PORT}/${DB_NAME}"
  DIRECT_DB_URL="$DB_URL"
fi

# Make Prisma and psql use the selected database, regardless of inherited
# DATABASE_URL values in the caller's shell.
export DATABASE_URL="$DB_URL"
export DIRECT_URL="$DIRECT_DB_URL"

# ── 2. Wait for postgres readiness (loop with timeout) ───────────────
ready=false
for i in $(seq 1 "${TIMEOUT_SECONDS}"); do
  if pg_isready -h "${DB_HOST:-localhost}" -p "${DB_PORT}" -U "${MIGRATION_TEST_DB_USER:-postgres}" > /dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done

if [ "$ready" != "true" ]; then
  echo "::error::Postgres did not become ready within ${TIMEOUT_SECONDS}s"
  exit 1
fi

echo "✓ Postgres ready on ${DB_HOST:-localhost}:${DB_PORT}"

# The apply-test is intentionally from-scratch. A managed database must be a
# fresh CI service container, not a persistent/shared database whose existing
# tables could hide an invalid initial migration. Prisma's own bookkeeping
# table is absent before the first deploy, so exclude it for a clear error.
EXISTING_TABLE_COUNT=$(psql "$DATABASE_URL" \
  -At -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name <> '_prisma_migrations';")
if [ -z "${EXISTING_TABLE_COUNT}" ] || [ "${EXISTING_TABLE_COUNT}" -ne 0 ]; then
  echo "::error::Migration apply-test requires an empty public schema; found ${EXISTING_TABLE_COUNT} application table(s)."
  exit 1
fi

echo "✓ Fresh public schema confirmed"

# ── 3. Apply migrations cumulatively ─────────────────────────────────
# `prisma migrate deploy` is the canonical V1.x apply command (no shadow
# state, audit trail enforced by `migrations/` folder layout).
npx prisma migrate deploy

# ── 4. Sanity-check: tables exist in public schema ───────────────────
TABLE_COUNT=$(psql "$DATABASE_URL" \
  -At -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';")

if [ -z "${TABLE_COUNT}" ] || [ "${TABLE_COUNT}" -lt 5 ]; then
  echo "::error::Migration applied but only ${TABLE_COUNT} tables in public schema (expected ≥5 for our schema)"
  exit 1
fi

echo "✓ Migration apply-test passed: ${TABLE_COUNT} tables in public schema"
