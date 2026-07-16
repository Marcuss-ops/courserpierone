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
# Requires: docker (postgres:16-alpine), psql client, npx prisma.

set -euo pipefail

CONTAINER_NAME="pg-migtest-$$"
DB_NAME="migtest_$$"
DB_PORT="5432"
TIMEOUT_SECONDS="60"

echo "─ Migration apply-test $(date +%FT%TZ) ─"

# ── 1. Start ephemeral postgres via docker ───────────────────────────
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

# ── 2. Wait for postgres readiness (loop with timeout) ───────────────
ready=false
for i in $(seq 1 "${TIMEOUT_SECONDS}"); do
  if pg_isready -h localhost -p "${DB_PORT}" -U postgres > /dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done

if [ "$ready" != "true" ]; then
  echo "::error::Postgres did not become ready within ${TIMEOUT_SECONDS}s"
  exit 1
fi

echo "✓ Postgres ephemeral ready on port ${DB_PORT}"

# ── 3. Apply migrations cumulatively ─────────────────────────────────
# `prisma migrate deploy` is the canonical V1.x apply command (no shadow
# state, audit trail enforced by `migrations/` folder layout).
DATABASE_URL="postgresql://postgres:postgres@localhost:${DB_PORT}/${DB_NAME}" \
DIRECT_URL="postgresql://postgres:postgres@localhost:${DB_PORT}/${DB_NAME}" \
  npx prisma migrate deploy

# ── 4. Sanity-check: tables exist in public schema ───────────────────
TABLE_COUNT=$(DATABASE_URL="postgresql://postgres:postgres@localhost:${DB_PORT}/${DB_NAME}" \
  psql -U postgres -d "${DB_NAME}" -At -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';")

if [ -z "${TABLE_COUNT}" ] || [ "${TABLE_COUNT}" -lt 5 ]; then
  echo "::error::Migration applied but only ${TABLE_COUNT} tables in public schema (expected ≥5 for our schema)"
  exit 1
fi

echo "✓ Migration apply-test passed: ${TABLE_COUNT} tables in public schema"
