# V1 Readiness Verification — 2026-07-12

> **Author:** go-live coordination, commit on `main` (no branch).
> **Context:** the FASE 1.3 ("Drain orphanProducts") followup from the
> go-live PLAN was reconciled against the codebase reality on `main` at
> commits `8b21b7d` (audit-script PrismaClient fix) / `5395bfa`
> (backfill-script PrismaClient fix).

## TL;DR

- **`orphanProducts = 0` is structurally enforced** by migration
  `20260712210000_creator_id_required_restrict`. `Product.creatorId`
  is `NOT NULL` at the DB level on every DB where that migration ran,
  so a runtime backfill is unnecessary and would fail at Prisma-types
  level (TS rejects `where: { creatorId: null }` when the column is
  non-nullable).
- Local dev DB (`courserpierone-db-1`) only has `_prisma_migrations`
  applied (`20260712210000_drop_creator_id_index`). No `Product` /
  `User` rows exist locally — verification against local is not
  informative. The meaningful gate is staging/prod where the full
  migration set is applied.

## What changed in this turn

- Reconciliation of FASE 1.3 with current reality on `main`:
  - `scripts/products/backfill-primary-creator.ts` is **read-only
    verification** post-Phase-1.4 (per its own leading comment
    block). It does NOT accept `PRIMARY_CREATOR_EMAIL` and it does
    NOT have an `--apply` mode; `--dry-run` and the default
    invocation are identical (pure read-only query).
  - No drain action to perform against staging/prod: orphan=0 is a
    DB-level constraint, not a runtime invariant to populate.

## Local dev state (diagnostic, 2026-07-12)

`docker compose ps` reports `courserpierone-db-1` healthy
(`Up 6 hours (healthy)`).

| Probe                              | Result                                                   |
|------------------------------------|----------------------------------------------------------|
| Databases (non-template)           | `courser`, `postgres`                                    |
| Tables in `courser` (public)       | only `_prisma_migrations`                                |
| Tables in `postgres` (public)      | none                                                     |
| Last applied Prisma migration      | `20260712210000_drop_creator_id_index` (in `courser`)    |
| `Product`/`User`/`AccessGrant` rows | 0 each (tables don't even exist locally)                |
| NextAuth tables                    | not present (no `Account`/`Session`/`VerificationToken`) |

Implication: there's nothing to drain locally. The migration system
needs to run end-to-end on staging for the FASE 1.3 / 1.4 gate to
be evaluated; on local we can only confirm the migration files exist
on disk.

## Staging/prod runbook (operator action when env is available)

Once staging or production has the full Prisma migration set applied:

```bash
# 1. Confirm product creatorId NOT NULL at DB level (structural gate):
psql "$DIRECT_URL" -c "SELECT is_nullable \
  FROM information_schema.columns \
  WHERE table_name='Product' AND column_name='creatorId';"
# expected: NO

# 2. Confirm zero orphan rows (defense-in-depth check):
psql "$DIRECT_URL" -c \
  'SELECT count(*) FROM "Product" WHERE "creatorId" IS NULL;'
# expected: 0

# 3. Run the read-only verification script (no env needed beyond
#    canonical names — honored via commit 8b21b7d fix):
PRIMARY_DATABASE_URL="$DIRECT_URL" \
  npx tsx scripts/products/backfill-primary-creator.ts
# expected: prints total products + canonical admin/creator
#           candidate (auto-detected by createdAt ASC)

# 4. Run the canonical V1 readiness audit (commit 8b21b7d fix honored
#    PRIMARY_DATABASE_URL override):
PRIMARY_DATABASE_URL="$DIRECT_URL" \
  npx tsx scripts/audit-v1-readiness.ts
# expected: orphanProducts=0, residualNextAuth all -1 (absent, ✓)
#           or 0, all blockers absent → GREEN.
```

Any of steps 1–4 returning a non-expected value is a V1-blocker that
must be investigated before sign-off. Steps 1 + 2 are pure SQL and
work without Prisma installed in the operator shell.

## Relation to the go-live PLAN

- **FASE 1.3** ("Drain orphanProducts"): completed by the migration
  itself; no script action. The "drain" wording in the original plan
  is now obsolete and is removed from the active queue. (If you see
  the plan recommendation that says "run
  `backfill-primary-creator.ts` with `PRIMARY_CREATOR_EMAIL` …", that
  is pre-Phase-1.4 advice and no longer applies.)
- **FASE 1.4** ("Drain NextAuth residuals"): depends on whether the
  staging/prod schema has `Account`/`Session`/`VerificationToken`
  tables. The local dev DB does NOT, which is expected (no app data
  to migrate from NextAuth on a dev scratch). On a real environment
  where NextAuth was historically live, the operator must run the
  cleanup migration with archiving first (see
  `prisma/migrations/20260712220000_drop_nextauth_models`).

## Sign-off prerequisites (do not change)

These are the STILL-OPEN blockers from the original V1 plan that
need real action — not handled by the structural migration alone:

- A8 Playwright firefox + webkit projects (pre-release gate only).
- Seed of ≥3 `YouTubeChannel` rows (`scripts/db/seed-youtube-channels.ts`
  not yet authored).
- Refund e2e test on Lemon Squeezy (`tests/e2e/refund.lemonsqueezy.spec.ts`
  not yet authored).
- CI alignment to LS-first (payment stack is LS-only).
- MCR Phase 2 backfill on staging (`scripts/migrate-grants-from-orders.ts`,
  commit `5395bfa` consolidation done).
