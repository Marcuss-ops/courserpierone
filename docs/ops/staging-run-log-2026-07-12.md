# Staging-Backfill Run-Log — 2026-07-12

> **Outcome: BLOCKED at env guard (exit code 10).** Run aborted before any
> stage executed. No migrations applied, no backfill ran, no audit
> executed, no DB counts measured. This log documents the empirical
> evidence + a checklist template the next operator fills once env is
> provisioned.

## TL;DR

| Field | Value |
| --- | --- |
| Date attempted | 2026-07-12 |
| Operator | Buffy (via FASE 3.2 followup) |
| Script | `scripts/ops/staging-backfill.sh` (Commit `0522599`) |
| Mode attempted | full pipeline (no flag passed) |
| **Outcome** | **exit code 10 — env guard** |
| Where it stopped | Guard at top of script: `if [[ -z "${DATABASE_URL:-}" ]]; then ... exit 10; fi` (line ~62) |
| Cross-ref (prior blocker) | [`docs/audit-log.md`](../audit-log.md) — entry noting the same blocker was already documented in a prior commit (`docs(audit): note staging run blocked by missing STAGING_DATABASE_URL`) |
| Next-run plan | Provision env (see §"How to unblock") → re-run → replace the empty `_____` fields in the checklist with measured counts |

## Evidence captured (verbatim from empirical run)

### Shell environment

```bash
$ env | grep -E '^(DATABASE_URL|DIRECT_URL|STAGING_|PRIMARY_DATABASE_URL)'
# (no output — four env classes absent from the operator shell)
```

### Filesystem

```bash
$ ls -la .env* | grep -vE '^total|^d|No such'
# .env.example       ← template only (committed to repo)
# .env.test.example  ← template only (committed to repo)
# (no .env.local / .env.staging / .env.production)
```

### Script invocation (single attempt, exit code captured)

```bash
$ ./scripts/ops/staging-backfill.sh; echo "rc=$?"

❌ DATABASE_URL must be set (canonical Prisma env name)
   Export DATABASE_URL='postgres://host:port/db' before running.

rc=10
```

The error text is **`❌ DATABASE_URL must be set (canonical Prisma env
name)`** — verbatim from `scripts/ops/staging-backfill.sh` line ~64. The
script ALSO checks `DIRECT_URL` independently with the same exit code
(different message: `❌ DIRECT_URL must be set (direct-connection URL
for prod parity)`). Today's run hit the `DATABASE_URL` branch first.

### Pre-existing audit-log entry

The same blocker was previously documented in [`docs/audit-log.md`](../audit-log.md):

> "staging run blocked by missing `STAGING_DATABASE_URL`. Operator
> shell exported neither `STAGING_DATABASE_URL` nor the equivalent
> (`DATABASE_URL`/`DIRECT_URL`) from a `.env`. The script is
> correct — verified in PR `afc288d`. Remedy: provision operator
> shell with the Vercel staging DB credentials and re-run."

This run-log augments that entry with the 2026-07-12 attempt's
empirical evidence (actual env-missing pattern + the verbatim
script-emitted error message + actual exit code 10) and the checklist
template below.

## Exit-code matrix (verbatim from `scripts/ops/staging-backfill.sh` header)

```
Exit codes:
  0  all 5 stages green
  1  stage 1 (migrate deploy) failed
  2  stage 2 (backfill-primary-creator) failed
  3  stage 3 (migrate-grants-from-orders) failed
  4  stage 4 (audit-v1-readiness) failed
  5  stage 5 (psql sanity) failed (audit + psql count mismatch)
  10 env guard: missing DATABASE_URL + DIRECT_URL
  64 usage error (unknown flag)
```

> Source: `scripts/ops/staging-backfill.sh` header comment block. The
> matrix above is verbatim — re-extractable with:
> ```bash
> sed -n '/^# Exit codes:/,/^set -euo pipefail/p' scripts/ops/staging-backfill.sh
> ```

## How to unblock

The script's env guard (`scripts/ops/staging-backfill.sh` line ~62)
checks `DATABASE_URL` first and `DIRECT_URL` second. Either-or
execution model: provide AT LEAST one of these (the scripts use both
in different stages — full pipeline prefers both).

Step-by-step:

```bash
# 1. Source the staging credentials from Vercel Preview env (§1.2 of
#    staging-bootstrap) or your local password manager.

# Required (full pipeline needs both; --dry-run needs only DATABASE_URL
# but mirrors DIRECT_URL → PRIMARY_DATABASE_URL for the audit stage):
export DATABASE_URL='postgres://staging-pooled-url'
export DIRECT_URL='postgres://staging-direct-url'

# Optional but recommended (mirror pattern used by 4 Prisma-touching
# scripts in scripts/ — see staging-backfill.sh header comment):
export PRIMARY_DATABASE_URL="${PRIMARY_DATABASE_URL:-$DIRECT_URL}"

# 2. Verify reachability from operator's local shell:
psql "$DIRECT_URL" -c "SELECT current_database(), current_user;"
# Expected: your staging DB name + `postgres` user.

# 3. Re-run the script:
./scripts/ops/staging-backfill.sh
# or audit-only:
./scripts/ops/staging-backfill.sh --dry-run
# or with production-audit guards enabled:
./scripts/ops/staging-backfill.sh --production
```

### Sourcing the staging credentials

Per [`scripts/ops/staging-bootstrap.md` §2.3](../../scripts/ops/staging-bootstrap.md#get-section-23):

- `DATABASE_URL` ↔ Supabase **pooled** URL (pgBouncer port 6543) — used at runtime
- `DIRECT_URL` ↔ Supabase **direct** URL (port 5432, IPv6-only on free tier) — used at migrate time

Vercel Preview env (§1.2) holds both. Operator's local shell can override either with `export ...` to use the staging connection directly without routing through Vercel.

## Run checklist — fill in once env is provisioned

> Re-run the script and replace each `_____` with the actual measured
> value. Then re-commit this file with the values filled in. This
> produces a per-attempt run-record (chain: previous attempts in the
> `staging-run-log-*.md` filename series).

### Stage 0 — env guard

- [ ] **`exit code`**: `_____` (expected `0` if env set)
- [ ] env lines used (mask secrets):
  - `DATABASE_URL`: `_____`
  - `DIRECT_URL`: `_____`
  - `PRIMARY_DATABASE_URL`: `_____`

### Stage 1 — `prisma migrate deploy`

- [ ] **`exit code`**: `_____` (expected `0`)
- [ ] migrations applied: `_____`
- [ ] migrations skipped (already applied): `_____`
- [ ] first 5 lines of `npx prisma migrate deploy` output:

```
_____
_____
_____
_____
_____
```

### Stage 2 — `backfill-primary-creator.ts` (read-only verify)

- [ ] **`exit code`**: `_____` (expected `0` post-Phase 4 mode)
- [ ] products WITH `creatorId IS NULL`: `_____`
- [ ] products WITH `creatorId IS NOT NULL`: `_____`
- [ ] orphanProducts count (from audit JSON `📋 JSON (machine-readable)` line): `_____`

### Stage 3 — `migrate-grants-from-orders.ts` (idempotent upsert)

- [ ] **`exit code`**: `_____` (expected `0`)
- [ ] new AccessGrants inserted: `_____`
- [ ] AccessGrants already present (upsert handshake): `_____`

### Stage 4 — `audit-v1-readiness.ts` (3-gate read-only audit)

- [ ] **`exit code`**: `_____` (expected `0`)
- [ ] gate 1 result (`orphanProducts`): `_____`
- [ ] gate 2 result (`activeStripeOrders`): `_____`
- [ ] gate 3 result (`residualNextAuth` (account/session/verificationToken totals)): `_____`
- [ ] audit JSON captured for stage 5 cross-check (path or paste): `_____`

### Stage 5 — `psql` direct-DB cross-check

- [ ] **`exit code`**: `_____` (expected `0` if audit↔psql counts agree)
- [ ] JSON `orphanProducts`: `_____`
- [ ] psql `SELECT count(*) FROM "Product" WHERE "creatorId" IS NULL`: `_____`
- [ ] agreement? (yes/no): `_____`

### Final aggregate

- [ ] **all 5 stages exit 0**: `yes` / `no: stage _____ failed`
- [ ] staging Supabase DB remains clean post-migration: `yes` / `no`

## Notes for the next operator

- **IPv6 caveat**: free-tier Supabase is **IPv6-only** on direct
  connections. Operator's local shell must be dual-stack OR IPv6-capable
  (typical: works). Vercel build infrastructure is **IPv4-only** — a
  `postbuild: prisma migrate deploy` in `package.json` infinite-hangs;
  apply migrations locally per [`staging-backfill.sh`](../../scripts/ops/staging-backfill.sh)
  instead.
- **`PRIMARY_DATABASE_URL` mirror pattern**: the 4 Prisma-touching
  scripts in `scripts/` (backfill-primary-creator, migrate-grants-from-orders,
  audit-v1-readiness, + staging-backfill.sh itself) honor
  `PRIMARY_DATABASE_URL` first and fall back to `DIRECT_URL`. Setting
  both is the safest pattern (`staging-backfill.sh` line ~73 mirrors
  DIRECT_URL → PRIMARY_DATABASE_URL when the latter is absent).
- **Idempotency**: every stage is idempotent. Re-running the script
  always converges to the same end-state. Safe to re-run after a
  partial failure on any single stage.
- **`--production` flag passthrough**: passes `--production` to stage 4
  audit — enables the DBS-empty sanity guard (warns if total
  products/orders/users are all zero, i.e. pointed-at-wrong-DB
  misconfig detection). Use this when pointing at a brand-new staging
  DB before any data has been seeded.

## Companion artifacts

| Topic | See |
| --- | --- |
| Five-stage pipeline definition + idempotency notes | `scripts/ops/staging-backfill.sh` (header comment block) |
| First-time env provisioning | [`scripts/ops/staging-bootstrap.md`](../../scripts/ops/staging-bootstrap.md) (`§1.2` Preview env list, `§2.3` Supabase URLs) |
| Audit-v1-readiness contract (what the 3 gates measure) | [`docs/v1-acceptance-test.md`](../../docs/v1-acceptance-test.md) |
| Production env hardening + ACCEPTED NITs | [`docs/production-hardening.md`](../../docs/production-hardening.md) |
| Earlier blocker note (same root cause, prior commit) | [`docs/audit-log.md`](../audit-log.md) |
| Roadmap (`FASE 2.x` staging followups) | [`docs/roadmap-current.md`](../../docs/roadmap-current.md) |
