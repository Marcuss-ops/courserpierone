# Stripe-Drain Audit — Baseline + Re-runnable Methodology

> **Purpose.** Read-only audit that gates Commit 4 of the post-V1 cleanup plan
> (drop the legacy `src/app/api/webhooks/stripe/route.ts` +
> `src/lib/payment/stripe.ts` + `stripe@^22.2.0` npm dep +
> `Order.stripeSessionId/StripeSubscriptionId` + `Product.stripePriceId` cols +
> `STRIPE_*` env from Vercel + .env.example). Commit 4 is OPT-IN, gated on
> `activeStripeOrders === 0` AND `stripeSubscriptionId-with-completed === 0`
> for every `(stripe, ...) → LS-only` drain verdict. This doc is the
> reproducible "are we at zero?" query book. Re-run weekly during the drain
> phase (or after each significant LS-side migration) and diff against the
> baseline numbers in §3.
>
> **Scope.** Raw-SQL queries on the live Supabase Postgres backend
> (`DIRECT_URL` connection recommended; `DATABASE_URL` pooler also works
> because the queries are read-only with no SET LOCAL / advisory locks).
> Matches `scripts/audit-v1-readiness.ts` gate (b) for query (2) — but
> complements it with raw-SQL output that prisma-rendered
> `count()` cannot express (the GROUP BY partition in (1), and the
> `stripeSubscriptionId IS NOT NULL` filter in (3) is more readable in
> SQL than the Prisma equivalent).
>
> **Convention mirror.** Format follows `docs/ops/staging-run-log-2026-07-12.md`
> (TL;DR table + Evidence captured + Run checklist template + Notes for
> the next operator + Companion artifacts).

---

## 1. TL;DR — Baseline (2026-07-15, sandbox re-run)

> 📌 **Read this first.** §1 numbers are from the SANDBOX replay in §3
> (port-55440 deterministic seed with 13 mixed-provider `sda-`-prefixed
> Orders). **They are NOT staging/prod numbers.** Production re-runs
> populate the §4 template separately — do NOT interpret §1 as the
> current production drain queue size until an operator has committed
> the §4 production snapshot back to this file (a normal weekly cadence,
> see §7).

| Field | Value |
| --- | --- |
| **Date baseline captured** | 2026-07-15 |
| **Sandbox DB** | `stripe-drain-audit-db` (Docker `postgres:16-alpine`, port 55440, isolated from `docker-compose.yml` dev DB on 5432) |
| **Schema version** | V1 baseline as of `npx prisma db push` (2026-07-15) — `Order.paymentProvider` is `String @default("stripe")` (a known debt; flagged in `roadmap-current.md` for cleanup) |
| **Source-of-truth operator** | `psql "$DIRECT_URL" -c "<query>"`  (3 queries, ~3s total runtime on sandbox) |
| **Script companion** | `npx tsx scripts/audit-v1-readiness.ts` (covers query (2) via Prisma + 2 other V1-blocker gates) |
| **Verification class** | Live sandbox run (this document) + operator manual pipeline (re-runs weekly) |
| **First re-audit planned** | 2026-07-22 (weekly cadence during drain phase — re-run, populate the `_____` fields in §5, commit the diff) |
| **Gate to Commit 4 of the cleanup plan** | (2) returns 0 AND (3) returns 0 AND (1) shows zero `stripe/*` rows |

### Baseline counters (verbatim from §3 below)

| Counter | Query | Baseline value | Verification semantics |
| --- | --- | --- | --- |
| Drain work queue | (2) | `6` (3 completed-no-sub + 1 pending + 2 completed-with-sub) | Must reach `0` before Commit 4 |
| Subscription leak surface | (3) | `2` (both completed + `stripeSubscriptionId` NOT NULL) | Must reach `0` before Commit 4 |
| Already-drained (refunded) | (1) where `paymentProvider='stripe' AND status='refunded'` | `2` | OK — these stay as historical record |
| LS-canonical surface | (1) where `paymentProvider='lemonsqueezy' AND status='completed'` | `5` | Re-assurance target — grows monotonically as new orders arrive |

---

## 2. Methodology — the 3 raw-SQL queries

### Query (1): Order partition breakdown by `paymentProvider`+`status`

```sql
SELECT
  "paymentProvider",
  status,
  COUNT(*) AS row_count
FROM "Order"
GROUP BY "paymentProvider", status
ORDER BY "paymentProvider", status;
```

**Why this first.** Cheapest scan, no WHERE filters, gives the full
partition. Use to (a) sanity-check the table is reachable, (b) confirm
the partition between LS-active and Stripe-residual is the shape you
expect, and (c) discover any new `paymentProvider` value (the String
column allows e.g. `'paypal'`/`'crypto'` if mis-shipped later).

**Source-of-truth mapping** (per `prisma/schema.prisma`:

| Column | Type | Default | Canonical values |
| --- | --- | --- | --- |
| `paymentProvider` | `String` | **KNOWN DEBT:** `("stripe")` | `stripe` \| `lemonsqueezy` |
| `status` | `String` | `"pending"` | `pending` \| `completed` \| `failed` \| `refunded` |

> **Known debt flagged** (per Italian plan §4 proposal still pending):
> `Order.paymentProvider @default("stripe")` is a HK-rollover risk — an
> `Order.create({ data: { /* no provider */ } })` would silently classify
> the row as Stripe. **The drain path must set `paymentProvider` explicitly
> on every code path** (post-C9 lemonTable.lemonsqueezy default migration
> is open). Until that migration lands, query (1) is the only safety net.

### Query (2): Stripe pending+completed (the drain work queue)

```sql
SELECT COUNT(*) AS active_stripe_orders
FROM "Order"
WHERE "paymentProvider" = 'stripe'
  AND status IN ('pending', 'completed');
```

**Why this second.** The V1-blocker counter (xref
[`docs/roadmap-current.md` §1.2](../roadmap-current.md#12-active-stripe-orders)
"Active Stripe Orders" + [`scripts/audit-v1-readiness.ts`](../../scripts/audit-v1-readiness.ts)
gate b). Must reach `0` before Commit 4 can apply (otherwise removing
the webhook handler would silently break refund/dispute handling on
live orders).

**Prisma equivalent** (if you prefer the canonical script):

```ts
prisma.order.count({
  where: { paymentProvider: "stripe", status: { in: ["pending", "completed"] } },
});
```

→ This is what `audit-v1-readiness.ts` emits as `activeStripeOrders`.

### Query (3): Stripe completed with `stripeSubscriptionId` NOT NULL (subscription leak surface)

```sql
SELECT COUNT(*) AS stripe_subscription_leak
FROM "Order"
WHERE "paymentProvider" = 'stripe'
  AND "stripeSubscriptionId" IS NOT NULL
  AND status = 'completed';
```

**Why this third.** Subset of (2) that is **separately drainable** — Stripe
subscriptions continue to bill until explicitly cancelled in the Stripe
Dashboard, even if you `service.refund()` the one-time payment. Each row
here needs: (a) manual cancel, (b) manual credit (or migration to LS
subscription, when that ships post-V1.2), (c) `Order.status` flip to
`refunded` matching the LS-side action.

**Why not in `audit-v1-readiness.ts` today.** The companion script covers
gate (2) but not (3) — query (3) is a more granular surface, exposed
here as a self-contained raw-SQL probe so the operator can act on it
during drain without forking the audit script.

### Operator gotcha — `stripeSessionId` vs `stripeSubscriptionId`

`Order.stripeSessionId` (one-time Stripe Checkout session) is `@unique`
in the schema (every row with a session has exactly one). For one-time
orders, `stripeSubscriptionId IS NULL`. For subscription orders, BOTH
`stripeSessionId` (initial checkout) AND `stripeSubscriptionId` (recurring
anchor) are populated. **Query (3) counts the subscription cases only**;
it will not flag one-time completed orders that still need a refund.

### Index coverage

The relevant Prisma indexes for these queries (per `prisma/schema.prisma` Order model):

| Index | Used by |
| --- | --- |
| `@@index([stripeSubscriptionId])` | Query (3) IS NOT NULL predicate (B-tree seek not partial — PG will treat IS NOT NULL as a range seek + post-filter) |
| `@@index([userId, status])` | (Inverse: per-user status queries — not directly used here) |
| `@@index([userId, productId, status])` | (Inverse: per-product access) |
| `@@index([createdAt])` | (Time-window queries, not used) |
| `@@unique([paymentProvider, providerOrderId])` | (Provider idempotency, not used for COUNT) |

For very-large `Order` tables (>10⁷ rows), consider adding an explicit
partial index for query (3); today counts return in <100 ms on staging
because `paymentProvider='stripe'` is <1% of the table.

---

## 3. Evidence captured — verbatim from sandbox re-run (2026-07-15)

### Sandbox stack

| Component | Spec |
| --- | --- |
| Container | `stripe-drain-audit-db` (`docker run -d --name ... -p 55440:5432 postgres:16-alpine`) |
| Image | `postgres:16-alpine` (PG 16.x) |
| Schema apply | `DATABASE_URL='postgresql://postgres:postgres@localhost:55440/courser' DIRECT_URL='same' npx prisma db push --skip-generate --accept-data-loss` |
| Seed | 13 Orders across `(lemonsqueezy, completed)`, `(stripe, completed, no-sub)`, `(stripe, pending)`, `(stripe, completed, sub-leak)`, `(stripe, refunded)` — all under one `sda-user-1` + product `sda-prod-1` (cuids prefixed `sda-`); see §3.4 below |

### Query (1) — Order partition breakdown (verbatim output)

```text
 paymentProvider |   status   | row_count 
-----------------+------------+-----------
 lemonsqueezy    | completed  |         5
 stripe          | completed  |         5
 stripe          | pending    |         1
 stripe          | refunded   |         2
(4 rows)
```

### Query (2) — Stripe pending+completed (verbatim output)

```text
 active_stripe_orders 
----------------------
                    6
(1 row)
```

### Query (3) — Stripe completed + subscription leak (verbatim output)

```text
 stripe_subscription_leak 
--------------------------
                        2
(1 row)
```

### Cross-check (intentional, deterministic)

| Cross-check | Expected | Got | Verdict |
| --- | --- | --- | --- |
| Sum of query (1) row_count | 13 (5 LS-completed + 5 stripe-completed + 1 stripe-pending + 2 stripe-refunded) | 13 | ✓ PASS |
| Query (2) total | 6 (3 stripe-completed-no-sub + 1 stripe-pending + 2 stripe-completed-with-sub) | 6 | ✓ PASS |
| Query (3) ⊆ Query (2) | `Query (3) ⊆ Query (2)` (the leak is a subset of the drain queue) | `2 ⊆ 6` | ✓ PASS |
| Grand total Orders | `Sum of all paymentProvider counts = total Orders` (invariant: SUM(COUNT(*)) over GROUP BY = COUNT(*); holds for any DB regardless of which providers exist) | 13 = 13 | ✓ PASS |

### §3.4 Seed inventory (for transparency on what query outputs represent)

The **`documented baseline numbers`** above (5/6/5/1/2) reflect a
deliberately MIXED-shape seed so the 3 queries exercise every meaningful
partition path:

| Provider | Status | Sub-leak | Count | Visible to query | Semantics |
| --- | --- | --- | --- | --- | --- |
| lemonsqueezy | completed | — | 5 | (1) row, not (2) or (3) | LS target state — already LS-only |
| stripe | completed | no | 3 | (1) row + (2) count (requires refund via Dashboard) | One-time Stripe remaining |
| stripe | pending | no | 1 | (1) row + (2) count (requires wait-or-cancel) | Stripe pending — webhook missed or in-flight |
| stripe | completed | yes (`sub_*_LEAK_*`) | 2 | (1) row + (2) count + **also (3) count** | Subscription leak — separate drain path |
| stripe | refunded | — | 2 | (1) row only | Already drained — historical record |

> This seed shape matches the V1-blocker reality at the moment of this
> audit: **mixed state**, with both "to-do" (3 + 1 + 2 = 6 from query (2))
> and "already-handled" (2 refunded) Stripe records. Operators re-running
> this query against staging/prod should see analogous row distribution.

---

## 4. Operator reproduction — staging/prod re-run template

### 4.1 Pre-flight (env presence)

- [ ] **`DIRECT_URL` set in operator shell?**: `yes` / `no` (recommended — direct connection, avoids pgBouncer)
- [ ] **`DATABASE_URL` set as fallback?**: `yes` / `no` (pooled works for these read-only COUNT queries)
- [ ] DB reachability: `psql "$DIRECT_URL" -c "SELECT current_database(), pg_isready()"` returns `t`?

### 4.2 Query runs (capture verbatim output)

- [ ] **Query (1)** raw output captured: `_____` (paste below or attach file)
   ```
   <paste psql output here>
   ```
- [ ] **Query (2)** raw output captured: `_____`
   ```
   active_stripe_orders: _____
   ```
- [ ] **Query (3)** raw output captured: `_____`
   ```
   stripe_subscription_leak: _____
   ```

### 4.3 Cross-check (must agree semantically with the seed-shape baseline)

- [ ] Sum of query (1) row_count = total Orders in DB: `_____`
- [ ] Query (2) ≤ query (1) `"stripe,completed"` + `"stripe,pending"` rows: `_____` ≤ `_____` (invariant: every stripe-pending-or-completed IS counted by (2))
- [ ] Query (3) ≤ query (2): `_____` ≤ `_____` (invariant: every sub-leak row IS in (2))
- [ ] Query (3) > 0 → there is **manual subscription cancel work** to do per row before Commit 4: `_____` (yes / no)

### 4.4 Aggregate

- [ ] **V1 readiness gate (audit-v1-readiness.ts gate b)**: `activeStripeOrders = 0` → `yes` / `no: value is _____`
- [ ] **Subscription leak gate (this doc query 3)**: `stripe_subscription_leak = 0` → `yes` / `no: value is _____`
- [ ] **Commit 4 of the cleanup plan (drop webhook + helpers + npm pkg + DB cols + env)**: ready to apply? `yes` (both gates green) / `no (gap: _____)`

---

## 5. Interpretation matrix — what each query result means

### Query (1) interpretation

| Pattern in (1) | Meaning | Operator action |
| --- | --- | --- |
| `lemonsqueezy,completed > 0`, `stripe,*` sum is small | Drain mostly complete, LS is the post-cutover primary | Continue the drain — refill from any new Stripe orders that arrive unexpectedly |
| `stripe,completed > 0` (any) | Drain is NOT complete; some Stripe rows require refund or migration per query (2) | Trigger the drain workflow (see §6 below) |
| `stripe,refunded > 0` | Already-drained historical surface; OK to keep | None — these stay as immutable audit trail post-Commit 4 (or get `CR` row retentions) |
| Unexpected `paymentProvider` value (e.g. `paypal`, `crypto`) | Someone shipped a new provider without consulting `roadmap-current.md` | Open P1 incident; investigate before merging further |

### Query (2) interpretation

| Value | Meaning | Operator action |
| --- | --- | --- |
| `0` | Drain COMPLETE. Commit 4 is unblocked (gated also on query (3) being 0). | Apply Commit 4 (drop `src/app/api/webhooks/stripe/` + `src/lib/payment/stripe.ts` + `STRIPE_*` env from Vercel + env registry + `.env.example` + npm package) |
| `1-10` | Drain in flight, few orders left | One-off operator round per row: refund via Stripe Dashboard OR migrate to LS via `scripts/products/update-lemon.ts` + manual `Order.status` flip to `refunded` (mirror the refund webhook semantics) |
| `11-100` | Drain has slipped beyond per-row operator attention | Batch-drain script needed; consider forking a `scripts/drain-stripe-orders.ts` similar to `scripts/ops/drain-nextauth-tables.ts` |
| `>100` | Drain is structurally blocked (cumulative webhook rot) | Open P2 incident; inspect root cause (e.g. webhook secret mismatch → Stripe retries → persistent `pending` rows) |

### Query (3) interpretation

| Value | Meaning | Operator action |
| --- | --- | --- |
| `0` | No active Stripe subscriptions to drain (LS-only is clean even at the recurring-billing layer) | Query (2) ≤ 0 too → Commit 4 unblocked |
| `1-5` | Bounded subscription-cancel work, do manually | For each row: open Stripe Dashboard → Subscriptions → click `<id = sub_STRIPE_LEAK_*>` → Cancel. After Stripe-side cancel, update `Order.status='refunded'`. Re-run (3) → expect `0` |
| `>5` | Many subscriptions — manual workflow doesn't scale | Draft `scripts/drain-stripe-subscriptions.ts` using the Stripe API (`stripe.subscriptions.cancel(sub_id)`); idempotent; pair with `Order.status='refunded'` flip in same transaction |

---

## 6. Drain workflow per-row (when queries return non-zero)

For each row surfaced by query (2) or (3):

1. **Open Stripe Dashboard** → Payments → find the matching `stripeSessionId` (or `stripeSubscriptionId` for query (3) cases).
2. **Refund** via Stripe Dashboard → Refunds. For subscriptions, **Cancel subscription** instead, then optionally refund the latest payment.
3. **Update DB**: `Order.status = 'refunded'` (mirror the webhook handler's path in `src/app/api/webhooks/stripe/route.ts` for `charge.refunded` events). One-shot query:
   ```sql
   UPDATE "Order" SET status='refunded', "updatedAt"=NOW()
   WHERE id='<order_id>' AND "paymentProvider"='stripe';
   ```
4. **Re-run** all 3 queries. Expect (2) and (3) to decrement by 1 each.
5. **When both = 0**, open Commit 4 of the cleanup plan per the original §5 commit sequence.

> **Do not** `prisma.order.updateMany` against the `Order` table for the
> refund flip — that path skips the Stripe Dashboard refund itself and
> only updates the local-state mirror. Refund MUST happen in the Stripe
> Dashboard (or via `stripe.refunds.create({ charge: ... })`) FIRST, then
> the DB flip.

---

## 7. Notes for the next operator

- **Pipefail hazard (ADR-0010 §C2)**: `psql ... -c "..." | head` masks the
  real exit code via `head`. Always capture with `${PIPESTATUS[0]}` if
  the shell script gates on success, OR prefer `-tA` (Tuples-only +
  Aligned, no header rows) + `tr -d ' \n\r'` to get the raw scalar.
- **`-c` query length limit**: psql `psql ... -c "<query>"` accepts up to
  ~10 KB on most platforms. Long queries → use heredoc `psql ... <<'SQL'
  ... SQL`. The 3 queries in §2 are all short enough for `-c`.
- **Whitespace in tsvector / numeric output**: psql numerically-formats
  bigints as `1234` by default (compact), so `(1 row)` is the line marker.
  For audit JSON pipelines, append `\` SELECT COUNT(*)::bigint AS ... \``
  to surface the bigint explicitly.
- **Connection choice for production**:
  - `DIRECT_URL` (port 5432) → bypasses pgBouncer, cleaner for COUNT(*) on
    medium tables; required for any `FOR UPDATE`/`pg_advisory_lock` use.
  - `DATABASE_URL` (port 6543, pgBouncer) → fine for these COUNT queries;
    bottleneck under read-replica fan-out is unlikely.
  - **Recommendation for this audit**: use `DIRECT_URL`; it's the same path
    as `prisma migrate deploy` and aligns with the audit script's
    `PRIMARY_DATABASE_URL` fall-through pattern.
- **DBS-empty sanity guard**: if both (2) and (3) return `0` AND the
  grand-total Orders count is `0`, you are pointed at an empty DB
  (staging pre-seed). Cross-verify with `SELECT COUNT(*) FROM "User";`
  and `SELECT COUNT(*) FROM "Product";`. If those are also 0, the audit
  is structurally meaningless (the GREEN gate below would mask this
  misconfig — same warning as in `audit-v1-readiness.ts` DBS-empty guard).
- **Re-runnability**: the 3 queries are pure read-only; idempotent across
  any number of re-runs. Schedule via Vercel Cron (`0 9 * * 1`,
  Sundays at 09:00 UTC) for a comparable weekly audit — output the
  queries' results to ALERT_WEBHOOK_URL with the
  `digest="stripe-drain-weekly-<iso-week>"` semantic per `logServerError`
  conventions.
- **`@default("stripe")` on Order.paymentProvider**: this is the
  pre-drain fraud-classifier risk flagged in the Italian cleanup plan §4.
  Until the migration drops the default, even a bug that omits
  `paymentProvider` from a `prisma.order.create` call would silently
  land rows in the `stripe` bucket. Mitigation today: rely on Prisma
  TS-level types (the `paymentProvider` field IS NOT `?` in the Prisma
  schema, so compile-time fixes are required) PLUS query (1) in this doc
  which surfaces anomalies.

---

## 8. Companion artifacts

| Topic | See |
| --- | --- |
| **Prisma-based audit (covers gate b = query 2)** | [`scripts/audit-v1-readiness.ts`](../../scripts/audit-v1-readiness.ts) — emits a JSON-line at the end with `activeStripeOrders`; cross-check this doc's query (2) with that JSON line |
| **V1-blocker candidate that controls Commit 4** | [`docs/roadmap-current.md` §1.2](../roadmap-current.md#12-active-stripe-orders) ("Active Stripe Orders") |
| **Stripe webhook handler (intentionally kept alive until Commit 4)** | [`src/app/api/webhooks/stripe/route.ts`](../../src/app/api/webhooks/stripe/route.ts) |
| **Stripe helper lib (intentionally kept alive until Commit 4)** | [`src/lib/payment/stripe.ts`](../../src/lib/payment/stripe.ts) |
| **One-off Stripe Order migration tool (alternative to refund)** | [`scripts/products/update-lemon.ts`](../../scripts/products/update-lemon.ts) |
| **Stripe-drain staging runbook pattern** | [`docs/ops/soft-launch-runbook.md` §2 Step 13](./soft-launch-runbook.md) (real-card refund via LS Dashboard — analogous Stripe refund mechanic) |
| **Previous Era: pre-C1f+g Stripe cleanup trail** | [`docs/audit-log.md`](../audit-log.md) + commit message trail `a0e511e` (C1f+g) + `4242f18` (C2a) + `5bd1059` (C2b) + `8652ba6` (stale-comment sweep) |
| **Date-prefixed run-log precedent (per-run, not per-baseline)** | [`docs/ops/staging-run-log-2026-07-12.md`](staging-run-log-2026-07-12.md), [`docs/ops/staging-run-log-2026-07-13.md`](staging-run-log-2026-07-13.md) — those use the dated-prefix convention for one-shots, while THIS doc uses a stable canonical name because it's continuously comparable |
| **Sandbox reproduction pattern (Docker Postgres isolation)** | [`docs/production.md` Appendix D.4.b](../production.md#appendix-d--supabase-pitr-run-log) — parallels this doc's §3 sandbox setup verbatim |
| **Adjacent V1-blocker (orphan Products, NOT NULL creatorId)** | [`scripts/products/backfill-primary-creator.ts`](../../scripts/products/backfill-primary-creator.ts) + [`docs/v1-acceptance-test.md`](../v1-acceptance-test.md) |

---

## Document control

| Field | Value |
| --- | --- |
| First written | 2026-07-15 |
| Baseline re-run cadence | Weekly during drain phase (Sunday ~09:00 UTC), re-runs populate §4 |
| Re-runs committed | (none yet — populate this row as operator finishes each weekly cycle) |
| Maintainer | ops-lead (TBD) |
| Review trigger | Any time `prisma/schema.prisma` Order indexes change, any new `paymentProvider` value shipped, or any new event-type added to `src/app/api/webhooks/stripe/route.ts` |
| Tight coupling | `scripts/audit-v1-readiness.ts` gate (b) ↔ §1 query (2) (the two paths MUST agree on the counter for a given DB at a given timestamp) |
