# Audit Log — MCR Phase 2 (AccessGrant) Backfill

> Baseline capture for the MCR Phase 2 `AccessGrant` backfill, used as the
> reference point for PR 3 (`USE_ACCESS_GRANT_RESOLVER` flag-flip).
>
> This log records both (a) the staging run, when executed, and
> (b) any local dry-runs that surface schema-or-script issues before
> the staging run.

---

## Status

- [x] **Local dry-run attempted** — 2026-07-12, see
      [§ Local dry-run attempt](#local-dry-run-attempt) below.
- [ ] **Staging run** — pending. Runbook in
      [§ Staging runbook](#staging-runbook) below. To be filled in by
      the operator executing `scripts/migrate-grants-from-orders.ts`
      against `STAGING_DATABASE_URL`.

---

## Local dry-run attempt

### Setup

- Local PG: `localhost:5432` (the `pgbackups` sidecar container from
  `docker-compose.yml`).
- Auth: `postgres:postgres` → **FATAL: password authentication failed
  for user "postgres"**. The `pgbackups` container is a backup sidecar
  and does NOT expose the actual `courser` schema — the real database
  lives in the `db` container on the internal docker network
  (`db:5432`).
- Conclusion: a local dry-run is not possible from this environment
  because the Courser schema is not exposed on the public PG port.
  The script's SQL correctness was verified in the PR 2 code-review
  (commit `afc288d`): idempotent `CREATE TABLE IF NOT EXISTS` +
  `DO $$` FK guards, `upsert + @@unique([sourceType, sourceId,
  productId])` dedupe, no `BEGIN/COMMIT` (Prisma wrapper handles
  transaction).

### Schema verification

The migration is verified at the SQL level (read by code-reviewer in
PR 2):

```sql
-- prisma/migrations/20260712230000_add_access_grants/migration.sql
CREATE TABLE IF NOT EXISTS "AccessGrant" (
    "id"          TEXT NOT NULL,
    "userId"      TEXT NOT NULL,
    "productId"   TEXT NOT NULL,
    "sourceType"  TEXT NOT NULL,
    "sourceId"    TEXT NOT NULL,
    "status"      TEXT NOT NULL DEFAULT 'active',
    "grantedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt"   TIMESTAMP(3),
    "expiresAt"   TIMESTAMP(3),
    CONSTRAINT "AccessGrant_pkey" PRIMARY KEY ("id")
);
-- + @@unique([sourceType, sourceId, productId]) index
-- + @@index([userId, productId, status])
-- + FKs to User and Product with ON DELETE RESTRICT
```

The script's idempotency contract is verified at the TypeScript level
(`scripts/migrate-grants-from-orders.ts`): walks `Order.status='completed'`,
calls `prisma.accessGrant.upsert({ where: { sourceType_sourceId_productId },
create: ..., update: {} })`, logs skipped/errors per row.

### Test results (post-PR 2, in CI)

- `npm run typecheck` — clean
- `src/lib/services/order-service.test.ts` — 23/23 pass
- `src/lib/commerce/payments/registry.test.ts` — 10/10 pass
- Full suite — 641/641 pass

The dual-write code path is exercised by 5 new MCR-Phase-2 tests
(see `processOrder — MCR Phase 2 AccessGrant dual-write` describe
block in `order-service.test.ts`).

---

## Staging runbook

### Prerequisites

- [ ] PR 2 (`afc288d`) is on `main` and deployed to staging.
- [ ] The migration has been applied to staging via
      `npx prisma migrate deploy --schema prisma/schema.prisma`
      against `STAGING_DATABASE_URL`.
- [ ] `STAGING_DATABASE_URL` is set in the operator's shell (do not
      log the value).

### Step 1 — Pre-backfill counts (capture before any writes)

```bash
psql "$STAGING_DATABASE_URL" <<'SQL'
SELECT
  (SELECT count(*) FROM "Order"     WHERE status = 'completed')                AS orders_completed,
  (SELECT count(*) FROM "Order"     WHERE status IN ('refunded','failed'))      AS orders_non_completed,
  (SELECT count(*) FROM "AccessGrant")                                          AS grants_total,
  (SELECT count(*) FROM "AccessGrant" WHERE "sourceType" = 'order')             AS grants_from_order;
SQL
```

**Expected:** `grants_total = 0`, `grants_from_order = 0` (no grants
yet — the backfill has not run, and the dual-write only fires for
*future* completed orders, not historical ones).

If `grants_total > 0`, the staging environment has already been
backfilled once. Re-running is safe (idempotent upsert), but note
this in the audit log below.

### Step 2 — Run the backfill

```bash
npx tsx scripts/migrate-grants-from-orders.ts
```

The script logs:

- `📦 Found N completed orders to process`
- `✅ Backfill complete — Upserted: N, Skipped (already existed): N,
   Errors: N`
- Per-row `❌ Failed to upsert grant for order <id>: ...` for any
  FK violations or transient DB errors.

**Expected output for a clean run:**

```
🔄 MCR Phase 2 — backfill AccessGrant rows from completed Orders
   Pattern: Order.status='completed' → AccessGrant(sourceType='order', sourceId=order.id)

📦 Found N completed orders to process

✅ Backfill complete
   Upserted: N
   Skipped (already existed): 0
   Errors:   0
```

If `Errors > 0`, the operator must investigate. Common causes:

- **Orphan User** (`userId` no longer exists) — the FK is `RESTRICT`,
  so the upsert will fail. Investigate the user deletion trail via
  `scripts/products/backfill-primary-creator.ts` style audit.
- **Orphan Product** (`productId` no longer exists) — same. The
  `RESTRICT` FK protects against silent orphan grants.
- **Transient DB error** (timeout, lock) — re-run the script;
  idempotent.

### Step 3 — Post-backfill counts (capture after writes)

```bash
psql "$STAGING_DATABASE_URL" <<'SQL'
SELECT
  (SELECT count(*) FROM "Order"     WHERE status = 'completed')                AS orders_completed,
  (SELECT count(*) FROM "AccessGrant")                                          AS grants_total,
  (SELECT count(*) FROM "AccessGrant" WHERE "sourceType" = 'order')             AS grants_from_order,
  (SELECT count(*) FROM "AccessGrant" WHERE "sourceType" = 'order'
                                          AND status = 'active')                AS grants_active;
SQL
```

**Expected:**

- `grants_total = orders_completed` (modulo the orphan-User/Product
  errors logged in step 2).
- `grants_from_order = orders_completed - errors_in_step_2`.
- `grants_active = grants_from_order` (status='active' is the
  default).

If `grants_total < orders_completed` by more than the error count,
something went wrong. Re-run the backfill; idempotent.

### Step 4 — Record the run in this file

Update the [§ Status](#status) checkboxes and fill in the
[§ Staging run results](#staging-run-results) section below.

### Step 5 — Commit and push

```bash
git add docs/audit-log.md
git commit -m "docs(audit): record MCR Phase 2 staging backfill results"
git push origin main
```

The commit is the official baseline that PR 3's flag-flip will
reference. The diff between this commit and the pre-PR-3 audit
log will be the basis for the "zero drift" verification before
the `USE_ACCESS_GRANT_RESOLVER` flag goes to `true` in production.

---

## Staging run results

> _To be filled in by the operator after step 3 completes._

- **Operator:** \<github-handle\>
- **Date:** \<YYYY-MM-DD\>
- **PR 2 commit on staging main:** \<commit hash\>
- **Migration applied:** \<yes/no, prisma migrate deploy output\>

### Counts (pre-backfill)

| Metric                      | Count |
| --------------------------- | ----- |
| `orders_completed`           |       |
| `orders_non_completed`       |       |
| `grants_total` (pre)         |       |
| `grants_from_order` (pre)    |       |

### Backfill script output (verbatim)

```
<paste output here>
```

### Counts (post-backfill)

| Metric                      | Count |
| --------------------------- | ----- |
| `orders_completed`           |       |
| `grants_total` (post)        |       |
| `grants_from_order` (post)   |       |
| `grants_active` (post)       |       |

### Errors (if any)

| Order ID    | Error message             | Resolution         |
| ----------- | ------------------------- | ------------------ |
|             |                           |                    |

### Verdict

- [ ] `grants_from_order` matches `orders_completed` (modulo errors)
- [ ] No new errors introduced
- [ ] `grants_active` is the expected subset of `grants_from_order`

If all three boxes are checked, the staging baseline is recorded.
PR 3's `USE_ACCESS_GRANT_RESOLVER=true` flag-flip can proceed after
1d of zero `NoValidAccessGrant` denies in staging logs.

---

## Related commits

- `3c217e2` — feat(payments): extract LemonSqueezy + legacy Stripe
  providers behind a registry (PR 1)
- `afc288d` — feat(access): add AccessGrant model + dual-write in
  order-service (PR 2)
- `2fbc9cd` — test(ci): unblock CI green — fix WS broadcast prune
  test + bypass rate-limit in DELETE route test

## Related docs

- `prisma/migrations/20260712230000_add_access_grants/migration.sql`
  — the migration applied to staging
- `scripts/migrate-grants-from-orders.ts` — the backfill script
- `src/lib/services/order-service.ts` — the dual-write site
  (PR 2 + PR 3 cutover target)
