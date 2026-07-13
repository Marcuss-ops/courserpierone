# Lemon Squeezy Live-Setup Operator Checklist

> **Scope.** A focused, copy-pasteable **checklist** for the operator
> bringing Lemon Squeezy (LS) from test mode to live mode and updating
> the DB-side `Product.lemonVariantId` + `countryOverrides.*.lemonVariantId`
> + `pricesByCurrency.*.lemonVariantId` after the Copy-to-Live generates
> new variant IDs.
>
> This is a **checklist companion** to the deep-dive runbook at
> [`./lemon-squeezy-live-setup.md`](./lemon-squeezy-live-setup.md) (which
> covers the WHY for each step in 6 verticals V1-V6). When this
> checklist says "do X", the long-form context for X is one click
> away in the deep-dive runbook. **Do not duplicate that content** —
> link, don't re-explain.
>
> **Audience.** A single operator executing the cutover in a
> pre-scheduled 2-hour window. The deep-dive runbook stays open
> alongside this checklist for reference.
>
> **Companion docs:**
> - [`./lemon-squeezy-live-setup.md`](./lemon-squeezy-live-setup.md) —
>   V1-V6 verticals deep-dive (KYC/KYB, products, variants, webhook,
>   signing secret, custom data). **Read this BEFORE running the
>   checklist.**
> - [`./soft-launch-runbook.md`](./soft-launch-runbook.md) — §1
>   pre-flight assumes this checklist is GREEN; the real-buyer runbook
>   starts after Copy-to-Live + DB update.
> - [`./uptime-monitor-setup.md`](./uptime-monitor-setup.md) — the
>   monitor must be wired AFTER the live LS store is up (not part of
>   this checklist).
> - `src/lib/env.ts` (`LEMONSQUEEZY_*` definitions) — canonical env
>   var names.
>
> **Source-of-truth code paths (read on fail, not before):**
> 1. `src/lib/commerce/payments/providers/lemonsqueezy/index.ts` —
>   `createCheckout()` sets the canonical 4 custom data fields
>   (`courseSlug`, `locale`, `email?`, `channelId?`).
> 2. `src/app/api/webhooks/lemonsqueezy/route.ts` — webhook handler:
>   HMAC verify → idempotency gate → `processOrder()` for
>   `order_created` → `order_refunded` flips BOTH `Order` and
>   `AccessGrant` atomically via `prisma.$transaction(...)`.
> 3. `prisma/schema.prisma` `model Product` — `lemonVariantId`
>   (top-level String), `countryOverrides` (String → jsonb after §3.0
>   migration), `pricesByCurrency` (String → jsonb after §3.0 migration).

---

## §0 — TL;DR

| Field | Value |
| --- | --- |
| Goal | Bring LS test-mode to live mode, update DB variant IDs, ready for V&V |
| Estimated time | **2-3 business days** (KYC/KYB review is the bottleneck, not the clicks) |
| Click count | **6 dashboard sections** in the LS Dashboard |
| SQL operations | **1 schema migration** (TEXT → jsonb) + **3 UPDATE patterns** (1 plain + 2 `jsonb_set`) + **1 drift-verification CTE** (2-way diff: forward + reverse, §3.5.4) |
| Money movement | Real corporate credit cards in the V&V phase (per `soft-launch-runbook.md`) |
| Pre-flight gate | All `soft-launch-runbook.md` §1 boxes GREEN (this checklist is a hard dependency) |
| Cross-ref | [`lemon-squeezy-live-setup.md` §1-6](./lemon-squeezy-live-setup.md) for WHY each step matters |

---

## §1 — Pre-flight (T-0)

ops-1 runs, ops-2 verifies. ALL boxes required.

- [ ] **ops-1**: `soft-launch-runbook.md` §1 pre-flight boxes are ALL GREEN. (The soft-launch runbook assumes LS live mode is wired; this checklist produces that state.)
- [ ] **ops-1**: KYC/KYB documents ready — government photo ID + address proof (utility bill or bank statement, ≤3 months old) + beneficial-owner declaration. KYC takes 2-3 business days for LS to review. **Timeline: submit KYC at T-3 days.**
- [ ] **ops-1**: Payout bank account configured in the legal entity name (or PayPal where LS supports — check the LS Dashboard country availability). The account MUST match the KYC entity name.
- [ ] **ops-1**: For each product, a pre-flight inventory is captured:
  - Current test-mode LS variant IDs (from LS Dashboard → Stores → [TEST store] → Products → [product] → Variants)
  - Current DB-side `Product.lemonVariantId` (from `psql "$DIRECT_URL" -c 'SELECT slug, "lemonVariantId" FROM "Product";'`)
  - Current DB-side `countryOverrides` map (from `psql "$DIRECT_URL" -c 'SELECT slug, "countryOverrides" FROM "Product" WHERE "countryOverrides" IS NOT NULL;'`)
  - Current DB-side `pricesByCurrency` map (from `psql "$DIRECT_URL" -c 'SELECT slug, "pricesByCurrency" FROM "Product" WHERE "pricesByCurrency" IS NOT NULL;'`)
- [ ] **ops-1**: For each product, the post-Copy-to-Live expected variant IDs are listed in a staging table (filled in DURING §2.3, BEFORE §3). This table is the single source of truth for §3.2/§3.3.
- [ ] **ops-2**: The pre-flight inventory from the previous 2 boxes is correct: test IDs match LS Dashboard, DB IDs match psql, no drift. If drift detected, STOP — investigate before copy-to-live (per `lemon-squeezy-live-setup.md` §3.3 the drift is already a bug; copy-to-live would multiply it by 3).
- [ ] **ops-1**: A 2-hour window scheduled with no production traffic (Copy-to-Live + DB update + §4 verification = ~30-60 min; the 2-hour buffer absorbs KYC review reminders, variant-creation UI lag, etc.).
- [ ] **ops-1 + ops-2**: This checklist is printed (or pinned in a side-pane) — the click sequence in §2 has no undo.

> **PAUSE POINT — REQUIRES VERIFICATION**: all 8 boxes checked before
> §2. If any check fails, stop and resolve (reschedule KYC, fix the
> drift, etc.).

---

## §2 — LS Dashboard click sequence (6 sections)

For each section, the operator performs the clicks and the verifier
observes. **Read the linked deep-dive section FIRST** for WHY each
step matters; the checklist below is the WHAT.

### §2.1 — KYC/KYB activation (T-3 days, ahead of §2.2-§2.6)

> Deep-dive: [`lemon-squeezy-live-setup.md` §1](./lemon-squeezy-live-setup.md#1--store-live-activation)

```
□ LS Dashboard → Settings → "Activate your store" (sidebar)
□ Fill business questionnaire: tax country, registered company name,
  business type (individual / sole proprietorship / company)
□ Upload KYC docs: gov photo ID + address proof
□ Upload payout method: bank statement in legal entity name
□ Click "Submit" → wait 2-3 business days for LS review
□ LS staff approves → bottom-left toggle unlocks "Live"
```

> **OUTPUT**: bottom-left toggle now shows `Live` highlighted (not
> `Test`). The store has a public URL `https://store.{slug}.com`.

### §2.2 — Toggle Test → Live

> Deep-dive: [`lemon-squeezy-live-setup.md` §1.2](./lemon-squeezy-live-setup.md#12-toggle-test--live)

```
□ Bottom-left of LS Dashboard → click toggle: Test → Live
□ Confirm in URL: dashboard URL changes to live-mode context
□ Note: store.{slug}.com URL is now reachable
```

> **OUTPUT**: store is in Live mode. Future product / variant /
> webhook operations are against the Live store, NOT the Test store.

### §2.3 — Create products in Live mode (or Copy-to-Live)

> Deep-dive: [`lemon-squeezy-live-setup.md` §2](./lemon-squeezy-live-setup.md#2--products)

Two paths. **Recommended: Copy-to-Live** (preserves test-mode
descriptions verbatim). Manual creation is the fallback.

#### §2.3.a — Copy-to-Live (recommended)

```
□ LS Dashboard → Products → [test product] → "..." menu → "Copy to Live Mode"
□ Repeat for each product
□ IMPORTANT: each copy creates a NEW LS product with a NEW ID.
  The test-mode product remains in Test mode (invisible in Live).
□ CRITICAL: the variants are also re-assigned with NEW IDs.
  Capture the new IDs per §1's staging table.
```

> **STAGING TABLE (per product)** — fill these in NOW before §2.4:
>
> | Product slug | Old test variant ID | New live variant ID (from §2.4 below) | Old `countryOverrides` map | New `countryOverrides.*.lemonVariantId` map | Old `pricesByCurrency` map | New `pricesByCurrency.*.lemonVariantId` map |
> | --- | --- | --- | --- | --- | --- | --- |
> | `<slug-1>` | `<old-id>` | `<new-id-from-§2.4>` | `BR: 123, JP: 456` | `BR: <new>, JP: <new>` | `USD: 789, EUR: 012` | `USD: <new>, EUR: <new>` |
> | `<slug-2>` | ... | ... | ... | ... | ... | ... |

#### §2.3.b — Manual creation (fallback)

```
□ LS Dashboard → Stores → [LIVE store] → Products → "+ New product"
□ Name: matches Product.name in DB (case-sensitive)
□ Description: matches the lead paragraph of Product.description (LS strips HTML)
□ Price: matches Product.price (USD cents → whole units: divide by 100)
□ Status: Published (NOT draft)
□ Files: leave empty (LS-hosted file delivery is NOT used; access is gated by Order.status)
```

### §2.4 — Publish variants per pricing tier

> Deep-dive: [`lemon-squeezy-live-setup.md` §3](./lemon-squeezy-live-setup.md#3--variants)

For each country in the `Product.countryOverrides` map:

```
□ LS Dashboard → Stores → [LIVE store] → Products → [product] → Variants → "+ New variant"
□ Name: "<COUNTRY>/<CURRENCY>" (e.g. "BR/BRL", "JP/JPY", "EU/EUR")
□ Price: from countryOverrides.{country}.price (in whole units, NOT cents)
□ Currency: from countryOverrides.{country}.currency
□ Status: Published (draft = no checkout URL)
□ SAVE → copy the new Variant ID at the bottom of the variant page
□ ADD the new Variant ID to the staging table (§2.3.a)
```

For each currency in the `Product.pricesByCurrency` map (fallback
tier for unmapped countries):

```
□ Same as above, with Name: "<CURRENCY>/<CURRENCY>" (e.g. "USD/USD")
□ Price: from pricesByCurrency.{currency}.price (whole units)
□ ADD the new Variant ID to the staging table
```

For the top-level fallback `Product.lemonVariantId` column (the
"default" variant for unmapped countries):

```
□ Same as above, with Name: "Default/<DEFAULT-CURRENCY>"
□ ADD the new Variant ID to the staging table → maps to the
  `Product.lemonVariantId` column in §3.1
```

> **OUTPUT**: the staging table is now COMPLETE. Every product has:
> 1 top-level `lemonVariantId` + 1 entry per country in
> `countryOverrides` + 1 entry per currency in `pricesByCurrency`.
> Proceed to §3 for the DB update.

### §2.5 — Configure webhook URL

> Deep-dive: [`lemon-squeezy-live-setup.md` §4](./lemon-squeezy-live-setup.md#4--webhook-endpoint)

```
□ LS Dashboard → Settings → Webhooks → "+ Create webhook"
□ Webhook URL: "https://<production-domain>/api/webhooks/lemonsqueezy"
  (NOT the Vercel Preview URL; per staging-bootstrap.md §3.2, staging
  uses the Preview URL. The production URL is the CUSTOM DOMAIN.)
□ Signing secret: generate with `openssl rand -hex 16` (32 chars hex)
□ Subscribe to ALL 5 events:
  - order_created
  - order_refunded
  - subscription_created
  - subscription_cancelled
  - subscription_payment_failed
□ SAVE → note the new signing secret for §2.6
```

> **OUTPUT**: webhook created. The 5 events are subscribed. The signing
> secret is captured for the next step.

### §2.6 — Wire signing secret to Vercel

> Deep-dive: [`lemon-squeezy-live-setup.md` §5](./lemon-squeezy-live-setup.md#5--signing-secret)

```
□ Vercel Dashboard → Project → Settings → Environment Variables
□ Find LEMONSQUEEZY_WEBHOOK_SECRET (Production scope)
□ Update the value to the new signing secret from §2.5
□ IMPORTANT: this is a "rolling" rotation. The dual-key procedure
  (per lemon-squeezy-live-setup.md §5.4) is NOT needed here — the
  LS webhook secret is a single-key env var, and the dual-key window
  is for COMPROMISE recovery, not for initial setup.
□ Trigger a redeploy: Vercel → Deployments → "..." menu → "Redeploy"
  (or push a no-op commit to main to trigger the deploy-gate workflow)
□ After redeploy: send a test event from LS Dashboard → Webhooks →
  [the webhook] → "Send test event" → "order_created"
□ Verify: Vercel logs show `[LS Webhook] order_created: <id>, email: <email>`
```

> **OUTPUT**: Vercel env is updated, redeployed, and the test event
> is acknowledged. The §3 SQL update can now proceed.

---

## §3 — Post-Copy-to-Live SQL update (the user's primary ask)

> **Schema reality (verified 2026-07-13)**: per the baseline migration
> at `prisma/migrations/20260709112844_baseline_default_language/migration.sql`
> L13-14, the `countryOverrides` and `pricesByCurrency` columns are
> currently `TEXT` (NOT `jsonb`). The `jsonb_set()` function only
> works on `jsonb` columns. **§3.0 is a one-time migration required
> before §3.2 and §3.3 can run.**

### §3.0 — Schema migration: TEXT → jsonb (one-time, required for §3.2/§3.3)

> **⚠️ Lock warning**: `ALTER TABLE ... ALTER COLUMN ... TYPE` takes
> an `ACCESS EXCLUSIVE` lock on `Product`. The GIN `CREATE INDEX`
> (without `CONCURRENTLY`) ALSO takes a write-block lock. The §1
> pre-flight already schedules a 2-hour no-traffic window — that's
> the lock budget. On a `Product` table with hundreds of rows this
> is sub-second; on tens of thousands of rows, 10-30s. Do NOT run
> this during production traffic.

**Step 1 — Update `prisma/schema.prisma`** (before the migration so
`prisma migrate dev` doesn't detect drift):

```diff
 model Product {
   ...
-  pricesByCurrency String?
+  pricesByCurrency String? @db.JsonB
-  countryOverrides String?
+  countryOverrides String? @db.JsonB
   ...
 }
```

**Step 2 — Pre-flight: confirm current state**

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'Product'
  AND column_name IN ('countryOverrides', 'pricesByCurrency');
-- expect: both rows show data_type = 'text'
```

**Step 3a — Generate the migration file against staging/local**
(NOT raw SQL; this generates the migration file + keeps
`schema.prisma` and the staging DB in sync):

```bash
npx prisma migrate dev --name product_jsonb_columns
```

Prisma's auto-generated `prisma/migrations/<timestamp>_product_jsonb_columns/migration.sql`
will contain the `ALTER COLUMN ... TYPE jsonb USING ...::jsonb`.
The `prisma generate` re-run also regenerates the Prisma Client
types (so the TS code can still use the existing `Record<string, ...>`
shape on these fields).

**Step 3b — Commit + push → CI runs `prisma migrate deploy` against
production** (non-interactive, no prompts):

```bash
git add prisma/schema.prisma \
        prisma/migrations/<timestamp>_product_jsonb_columns/
git commit -m "feat(db): convert Product.countryOverrides + pricesByCurrency to jsonb
  ... (the §3.0 schema migration from the LS live-setup checklist)
"
git push origin main
# CI runs: .github/workflows/prisma-migrate.yml -> prisma migrate deploy
#          against the production DB (via the IPv6 GH runner)
```

> **DO NOT run `prisma migrate dev` against production.** It is
> interactive (prompts for confirmation, regenerates Prisma Client,
> and may fail in non-TTY contexts). Production deploys always go
> through `prisma migrate deploy` via the CI workflow.

**Step 4 — (OPTIONAL) GIN indexes for future SQL-level containment
queries**:

> **Skip for V1.0** — the current `pricing.ts` code does NOT issue
> `@>` containment queries (it does `JSON.parse()` + object lookup
> post-fetch). The GIN indexes are forward-looking for a V1.1+
> refactor of `getCountryPriceOverride()`. Including them in V1.0
> costs a few seconds of index build + ~10-20% of JSON storage with
> zero current-code-path benefit.

If the operator chooses to include them (e.g. as part of the V1.1
refactor), use the **`--create-only` flag** to avoid the interactive
re-prompt wall on a second `migrate dev` invocation:

```bash
# 1. Generate the migration file WITHOUT applying it
npx prisma migrate dev --create-only --name product_jsonb_columns

# 2. Edit prisma/migrations/<timestamp>_product_jsonb_columns/migration.sql
#    to append the GIN CREATE INDEX statements (below), AFTER the two
#    ALTER COLUMN statements and BEFORE the auto-generated COMMIT (if any).

# 3. Apply the modified file
npx prisma migrate dev
```

The SQL to append (between the ALTERs and the COMMIT in the
auto-generated file):

```sql
CREATE INDEX IF NOT EXISTS "Product_countryOverrides_gin"
  ON "Product" USING gin ("countryOverrides" jsonb_path_ops);
CREATE INDEX IF NOT EXISTS "Product_pricesByCurrency_gin"
  ON "Product" USING gin ("pricesByCurrency" jsonb_path_ops);
```

> **Do NOT use Prisma's `@@index` for `jsonb_path_ops`** — the
> Prisma schema syntax for `jsonb_path_ops` is not yet stable across
> versions. Manually append the `CREATE INDEX` statements to the
> auto-generated migration file (raw SQL in the migration is fine;
> Prisma's introspection accepts it).

> **`CREATE INDEX CONCURRENTLY` option** (mitigates the §3.0 lock
> warning): if the operator wants the GIN indexes WITHOUT blocking
> writes (and has a longer maintenance window), drop the
> `CREATE INDEX` statements from inside the migration transaction
> (so `prisma migrate dev` generates only the two `ALTER COLUMN`
> statements), then run the `CREATE INDEX CONCURRENTLY` in a
> SEPARATE session:
>
> ```sql
> -- Inside a separate psql session, NOT inside the migration:
> CREATE INDEX CONCURRENTLY "Product_countryOverrides_gin"
>   ON "Product" USING gin ("countryOverrides" jsonb_path_ops);
> ```
>
> `CONCURRENTLY` cannot be inside a transaction. The index build
> takes longer (~2-3× the blocking time) but does NOT block writes
> on `Product`. The §1 pre-flight's 2-hour no-traffic window absorbs
> the blocking variant; if the operator is NOT in a no-traffic
> window (e.g. running the migration against staging with live
> traffic), `CONCURRENTLY` is the right choice.

The git commit is now in Step 3b (covers schema + migration file
together). If the operator adds the GIN indexes in Step 4, the
auto-generated migration file is already updated, so no extra
commit is needed — just include the GIN append in the same commit
message.

```

**Step 5 — Post-migration: confirm**

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'Product'
  AND column_name IN ('countryOverrides', 'pricesByCurrency');
-- expect: both rows show data_type = 'jsonb'
```

> **Why the GIN indexes (and the caveat)**: with `TEXT` columns,
> the codebase did a full scan-then-`JSON.parse()` for every
> landing-page render (per `src/lib/utils/pricing.ts` L67-74 +
> L137-141). The CURRENT code path does `parseCountryOverrides()` →
> `JSON.parse()` → object lookup `overrides[country.toUpperCase()]`
> — it does NOT issue SQL-level containment queries like
> `WHERE "countryOverrides" @> '{"BR": {}}'`. The GIN indexes with
> `jsonb_path_ops` accelerate EXACTLY those containment queries,
> which the current code path does NOT use. They are **forward-looking**:
> they enable a future SQL-level refactor of `getCountryPriceOverride()`.
> The perf cost of building them is one-time (sub-second on a small
> table); the storage cost is ~10-20% of the `countryOverrides` JSON size.
>
> **Recommendation**: include the GIN indexes IF a future refactor
> will use SQL-level containment (track in `FUTURE.md`). Skip them
> for the V1.0 cutover (just land the column-type change).

### §3.1 — Update `Product.lemonVariantId` (top-level column)

`lemonVariantId` is a top-level `String?` column, NOT a nested JSONB
field. The right tool is a plain `UPDATE`, not `jsonb_set`.

```sql
-- One row per product. Repeat for each product with a Copy-to-Live.
UPDATE "Product"
SET "lemonVariantId" = '<NEW-LIVE-variant-id>'
WHERE slug = '<product-slug>';

-- Verify
SELECT slug, "lemonVariantId"
FROM "Product"
WHERE slug = '<product-slug>';
-- expect: lemonVariantId = '<NEW-LIVE-variant-id>'

-- Bulk verification across all products (run after all §3.1 UPDATEs)
SELECT slug, "lemonVariantId"
FROM "Product"
WHERE status = 'published' AND "lemonVariantId" IS NULL;
-- expect: 0 rows
```

### §3.2 — Update `Product.countryOverrides.*.lemonVariantId` (per-country)

For each `countryCode` key in the `countryOverrides` JSONB object:

```sql
-- Per country. Repeat for each country in the per-country override map.
UPDATE "Product"
SET "countryOverrides" = jsonb_set(
  "countryOverrides",
  '{<COUNTRY-CODE>,lemonVariantId}',
  '"<NEW-LIVE-<COUNTRY>-variant-id>"',
  false  -- create_if_missing: false. If the country key is missing, fail loudly.
)
WHERE slug = '<product-slug>';

-- Concrete example: update BR (Brazil) variant for product amish-secrets
UPDATE "Product"
SET "countryOverrides" = jsonb_set(
  "countryOverrides",
  '{BR,lemonVariantId}',
  '"987654"',
  false
)
WHERE slug = 'amish-secrets';

-- Verify
SELECT slug, "countryOverrides"->'BR'->>'lemonVariantId' AS br_variant_id
FROM "Product"
WHERE slug = 'amish-secrets';
-- expect: 987654
```

> **jsonb_set path syntax**: the path is a Postgres array literal
> `'{BR,lemonVariantId}'` (single-quoted outer, comma-separated
> inside, no spaces). For nested paths, use `'{A,B,C}'`. The value
> MUST be a valid jsonb literal: a string must be wrapped in double
> quotes inside the single-quoted SQL string, i.e. `'"123"'`, NOT
> `'123'`. The `create_if_missing` flag (4th arg) is `false` so a
> typo'd country code fails loudly rather than silently creating
> a new entry.

### §3.3 — Update `Product.pricesByCurrency.*.lemonVariantId` (per-currency)

For each `currencyCode` key in the `pricesByCurrency` JSONB object:

```sql
-- Per currency. Repeat for each currency in the per-currency map.
UPDATE "Product"
SET "pricesByCurrency" = jsonb_set(
  "pricesByCurrency",
  '{<CURRENCY-CODE>,lemonVariantId}',
  '"<NEW-LIVE-<CURRENCY>-variant-id>"',
  false
)
WHERE slug = '<product-slug>';

-- Concrete example: update USD variant for product amish-secrets
UPDATE "Product"
SET "pricesByCurrency" = jsonb_set(
  "pricesByCurrency",
  '{USD,lemonVariantId}',
  '"123456"',
  false
)
WHERE slug = 'amish-secrets';

-- Verify
SELECT slug, "pricesByCurrency"->'USD'->>'lemonVariantId' AS usd_variant_id
FROM "Product"
WHERE slug = 'amish-secrets';
-- expect: 123456
```

### §3.4 — Verification: no drift remains

```sql
-- 1) Every published product must have a top-level lemonVariantId
SELECT slug, "lemonVariantId"
FROM "Product"
WHERE status = 'published' AND "lemonVariantId" IS NULL;
-- expect: 0 rows

-- 2) Every country override entry must have a non-null lemonVariantId
SELECT slug, kv.key AS country_code
FROM "Product", jsonb_each("countryOverrides") AS kv(key, value)
WHERE status = 'published'
  AND (kv.value->>'lemonVariantId' IS NULL OR kv.value->>'lemonVariantId' = '');
-- expect: 0 rows

-- 3) Every currency in pricesByCurrency must have a non-null lemonVariantId
SELECT slug, kv.key AS currency_code
FROM "Product", jsonb_each("pricesByCurrency") AS kv(key, value)
WHERE status = 'published'
  AND (kv.value->>'lemonVariantId' IS NULL OR kv.value->>'lemonVariantId' = '');
-- expect: 0 rows
```

> **All 3 queries must return 0 rows.** If any returns rows, fix the
> missing IDs (likely a country/currency that was in LS Dashboard
> but missing from the staging table) and re-run.

### §3.5 — Drift verification (LS Dashboard ↔ DB cross-check)

> **Purpose.** Final guardrail before §4 (end-to-end verification).
> Confirm there is NO drift between the LS Dashboard (source of
> truth for live-mode variant IDs) and the DB (cached snapshot).
> Drift can be introduced by:
>
> - A variant re-creation in LS Dashboard (LS regenerates the ID;
>   the DB stays stale until a new `jsonb_set` is run)
> - A typo'd ID in §3.1 / §3.2 / §3.3 (e.g. `987654` vs `987645`)
> - A missed country / currency (the staging table from §2.3.a
>   didn't list it)
> - A manual DB edit that didn't reach LS (or vice versa)
>
> **Scope semantic**: §3.4 checks **internal** consistency (no NULL
> IDs in the DB). §3.5 checks **external** consistency (DB IDs match
> LS Dashboard IDs). Both are required: an ID can be present in the
> DB but wrong; both queries must agree with the LS staging table.
> **Run AFTER §3.4 returns clean (0 rows).** Run BEFORE §4
> (end-to-end real-buyer test).

#### §3.5.1 — Top-level `lemonVariantId` dump (DB)

```sql
SELECT slug, "lemonVariantId" AS db_live_variant_id
FROM "Product"
WHERE status = 'published'
ORDER BY slug;
```

> **Lightweight eyeball variant**: §3.5.1–§3.5.3 are the read-only
> dumps an operator runs WITHOUT a staging CSV. For a rigorous
> 0-row verdict use §3.5.4 (requires loading the staging table from
> §2.3.a via `\copy` after creating the TEMP TABLE).

> **Operator action**: cross-reference each row against the staging
> table from §2.3.a (the SINGLE source of truth for live variant
> IDs captured during the cutover).
>
> **Drift indicators**:
> - Row in DB but not in staging table → undocumented new product
>   (the staging table missed it; fill in from LS Dashboard NOW)
> - Row in staging table but missing from DB → missed §3.1 UPDATE
> - Both rows present but IDs differ → §3.1 typo OR LS regenerated
>   the ID after Copy-to-Live (re-run §3.1 against the new LS ID)

#### §3.5.2 — `countryOverrides.*.lemonVariantId` dump (DB)

```sql
SELECT slug, kv.key                       AS country_code,
       kv.value->>'lemonVariantId'        AS db_live_variant_id
FROM "Product", jsonb_each("countryOverrides") AS kv
WHERE "Product".status = 'published'
ORDER BY slug, country_code;
```

> **Operator action**: cross-reference against the staging table's
> `countryOverrides.*.lemonVariantId` column. One DB row per
> `(slug, country_code)` pair. The `,  field` in the staging table
> distinguishes `countryOverride` rows from `currencyPrice` rows.

#### §3.5.3 — `pricesByCurrency.*.lemonVariantId` dump (DB)

```sql
SELECT slug, kv.key                       AS currency_code,
       kv.value->>'lemonVariantId'        AS db_live_variant_id
FROM "Product", jsonb_each("pricesByCurrency") AS kv
WHERE "Product".status = 'published'
ORDER BY slug, currency_code;
```

> **Operator action**: cross-reference against the staging table's
> `pricesByCurrency.*.lemonVariantId` column.

#### §3.5.4 — Programmatic drift detection (2-way diff via `TEMP TABLE`)

For an automated cross-check (replacing the manual eyeball of
§3.5.1–§3.5.3 dumps with a single `0 rows = no drift` verdict):

```sql
-- 0. Spin up a tmp staging table from the §2.3.a spreadsheet.
--    One row per (slug, field, country_or_curr, expected_id):
--      field           = 'lemonVariantId' | 'countryOverride' | 'currencyPrice'
--      country_or_curr = NULL for top-level rows; otherwise the
--                        country code (e.g. 'BR') or currency code ('USD')
CREATE TEMP TABLE staging_live_ids (
  slug             TEXT NOT NULL,
  field            TEXT NOT NULL CHECK (field IN ('lemonVariantId', 'countryOverride', 'currencyPrice')),
  country_or_curr  TEXT,
  expected_id      TEXT NOT NULL
);

-- Paste the §2.3.a spreadsheet as CSV (one header row, 4 columns).
-- The staging table from §2.3.a is the SINGLE source of truth.
\copy staging_live_ids FROM '/path/to/staging_live_ids.csv' WITH (FORMAT csv, HEADER true)
-- Note: `\copy` is a psql meta-command — it requires psql interactive
-- mode or `psql -f file.sql`. `psql -c "..."` will reject `\copy`. For
-- shell-automation, use `COPY staging_live_ids FROM STDIN` and pipe the
-- CSV through psql input.
```

Then run a 2-way diff (forward + reverse, atomically):

```sql
WITH db_live_ids AS (
  -- Top-level column
  SELECT p.slug,
         'lemonVariantId' AS field,
         NULL::TEXT       AS country_or_curr,
         p."lemonVariantId" AS actual_id
    FROM "Product" p
    WHERE p.status = 'published' AND p."lemonVariantId" IS NOT NULL
  UNION ALL
  -- countryOverrides entries
  SELECT p.slug, 'countryOverride', kv.key, kv.value->>'lemonVariantId'
    FROM "Product" p, jsonb_each(p."countryOverrides") kv
    WHERE p.status = 'published' AND kv.value->>'lemonVariantId' IS NOT NULL
  UNION ALL
  -- pricesByCurrency entries
  SELECT p.slug, 'currencyPrice', kv.key, kv.value->>'lemonVariantId'
    FROM "Product" p, jsonb_each(p."pricesByCurrency") kv
    WHERE p.status = 'published' AND kv.value->>'lemonVariantId' IS NOT NULL
),
-- Forward drift: staging expected X, DB has Y != X
-- Use `->` (jsonb) for the first navigation; `->>text->>text` is
-- undefined on older PG and behaves version-dependently. The chain
-- `jsonb->text->>'key'` is defined for JSONB LHS and degrades
-- gracefully via the standard NULL short-circuit on BOTH whole-NULL
-- maps AND missing country/currency keys — no explicit
-- CASE-WHEN-IS-NOT-NULL wrapper is needed. (Only `db_live_ids` uses
-- `kv.value->>'lemonVariantId'` on jsonb from `jsonb_each`; that
-- branch is also JSONB→text and is defined on every PG version.)
forward_drift AS (
  SELECT s.slug, s.field, s.country_or_curr, s.expected_id AS expected,
         CASE s.field
           WHEN 'lemonVariantId'  THEN p."lemonVariantId"
           WHEN 'countryOverride' THEN p."countryOverrides"->s.country_or_curr->>'lemonVariantId'
           WHEN 'currencyPrice'   THEN p."pricesByCurrency"->s.country_or_curr->>'lemonVariantId'
         END AS actual
    FROM staging_live_ids s
    LEFT JOIN "Product" p ON p.slug = s.slug
   WHERE s.expected_id IS DISTINCT FROM
         COALESCE(CASE s.field
           WHEN 'lemonVariantId'  THEN p."lemonVariantId"
           WHEN 'countryOverride' THEN p."countryOverrides"->s.country_or_curr->>'lemonVariantId'
           WHEN 'currencyPrice'   THEN p."pricesByCurrency"->s.country_or_curr->>'lemonVariantId'
         END, '')
),
-- Reverse drift: DB has ID X, staging has no row or mismatching ID
reverse_drift AS (
  SELECT d.slug, d.field, d.country_or_curr, d.actual_id, s.expected_id
    FROM db_live_ids d
    LEFT JOIN staging_live_ids s
      ON s.slug = d.slug
     AND s.field = d.field
     AND COALESCE(s.country_or_curr, '') = COALESCE(d.country_or_curr, '')
   WHERE s.expected_id IS NULL
      OR s.expected_id != d.actual_id
)
-- Combine both directions into ONE result set for the operator
SELECT 'forward'  AS drift_direction, slug, field, country_or_curr, expected AS expected_id, actual
  FROM forward_drift
UNION ALL
SELECT 'reverse'  AS drift_direction, slug, field, country_or_curr, expected_id, actual_id
  FROM reverse_drift
ORDER BY drift_direction, slug, field, country_or_curr NULLS FIRST;
-- expect: 0 rows total (both forward + reverse drift = 0)
```

> **Result interpretation**:
> - **`forward` rows**: the staging table listed an ID that the DB
>   disagrees with → typo in §3.x or LS regenerated the variant
>   post-Copy-to-Live. Fix in §3.5.5.
> - **`reverse` rows**: an ID exists in the DB but the staging
>   table has no matching entry → undocumented drift (the staging
>   table snapshot from §2.3.a was incomplete). Backfill the staging
>   table from the LS Dashboard, then either re-run §3 to add the
>   missing entry OR accept (it was already there).
> - **0 rows total**: PASS. Proceed to §4.

> **Why `IS DISTINCT FROM` (not `!=`)**: NULL-tolerant comparison
> for the `country_or_curr` join. Also handles the edge case where
> `p."countryOverrides"->>NULL->>'lemonVariantId'` returns SQL NULL
> (non-existent country key) instead of crashing.

#### §3.5.5 — Drift remediation

If §3.5.4 returns rows, fix each drift row with a targeted
`jsonb_set` UPDATE:

```sql
-- Example 1: countryOverride drift (BR variant, expected "987654")
UPDATE "Product"
SET "countryOverrides" = jsonb_set(
  "countryOverrides",
  '{BR,lemonVariantId}',
  '"987654"',  -- the LS Dashboard's CURRENT ID (not the stale DB ID)
  false
)
WHERE slug = 'amish-secrets';

-- Example 2: currencyPrice drift (USD variant, expected "123456")
UPDATE "Product"
SET "pricesByCurrency" = jsonb_set(
  "pricesByCurrency",
  '{USD,lemonVariantId}',
  '"123456"',
  false
)
WHERE slug = 'amish-secrets';

-- Example 3: top-level drift (default-currency variant)
UPDATE "Product"
SET "lemonVariantId" = '777777'
-- `lemonVariantId` is String (top-level column, NOT nested in JSONB),
-- per `prisma/schema.prisma` model Product. The §3.0 TEXT→jsonb migration
-- only affected `countryOverrides` + `pricesByCurrency`; `lemonVariantId`
-- always was String. Plain UPDATE, NOT jsonb_set.
WHERE slug = 'amish-secrets';
```

> **Drift remediation loop**: after each correction, re-run §3.5.4
> to confirm the row is gone. Once `UNION ALL` returns 0 rows, drift
> is resolved. Proceed to §4.

#### §3.5.6 — Post-cutover drift monitoring (optional, weekly cadence)

> For the first month post-cutover, re-run §3.5.4 weekly against
> the SAME frozen staging table from §2.3.a. Any row that appears
> is a regression. The most common cause is LS Regenerating a
> variant ID (e.g., after a price change in LS Dashboard); the
> remediation is re-run §3.x for the affected `(slug, field,
> country_or_curr)` triple with the new LS Dashboard ID.
>
> After the first month with 0 drift events, drop the cadence to
> monthly + on-demand. Drift is a regression signal — the DB is
> stale relative to LS; the DB is the cache, LS is authoritative.

---

## §4 — Verification (end-to-end)

After §3.4 returns clean (0 rows from all 3 queries), the LS live
mode is wired. Verify end-to-end with the soft-launch runbook:

> See [`./soft-launch-runbook.md` §2 Step 4](./soft-launch-runbook.md)
> — the real-buyer 3-locale checkout test exercises the new variant
> IDs end-to-end. Specifically:
>
> - One real card per locale (it-it, en-us, es-es) — 3 charges
> - For each charge, LS uses the new live variant ID
>   (verify in LS Dashboard → Orders → [the order] → "Variant")
> - Webhook fires → `processOrder` resolves the product via
>   `Product.lemonVariantId` (or `countryOverrides[country].lemonVariantId`
>   for country-specific purchases)
> - The Order + AccessGrant land in the DB (per
>   `soft-launch-runbook.md` §2 Step 6-7)

If any of the 3 charges fail at the LS checkout (422 "price mismatch"
or "variant not found"), the §3 SQL update missed a country/currency.
Re-run §3.2/§3.3 for the missing key, then re-test.

---

## §5 — Failure modes

| Symptom | Likely cause | Recovery |
| --- | --- | --- |
| LS Dashboard "Copy to Live Mode" creates duplicate product (e.g. 2 copies of amish-secrets in Live) | The "Copy to Live Mode" operation is one-time per product; re-running it duplicates. | LS Dashboard → Products → [the duplicate] → "..." → "Delete" (it's safe — no orders are linked to the test-mode product). |
| `jsonb_set` returns "function jsonb_set(jsonb, text[], jsonb, boolean) does not exist" | The columns are still `TEXT` (the §3.0 migration wasn't run). | Run the §3.0 migration. Re-run §3.2/§3.3. |
| `jsonb_set` returns "no element found at path" (e.g. for `{BR,lemonVariantId}` but the `BR` key is missing) | The `countryOverrides` map doesn't have a `BR` key for this product. | Use `psql "$DIRECT_URL" -c "SELECT \"countryOverrides\" FROM \"Product\" WHERE slug = '<product-slug>';"` to inspect the actual map. Either add the missing country to the JSONB (manually) or skip the country update. |
| LS checkout returns 422 "price mismatch" for a specific country | The `countryOverrides.{country}.price` in DB doesn't match the LS variant's price. | Re-verify §2.4 step "Price: from `countryOverrides.{country}.price` (in whole units, NOT cents)". Common bug: entered cents (e.g. 9900) instead of units (e.g. 99.00). Fix the LS variant price. |
| LS checkout returns 422 "variant not found" for the default currency | The top-level `Product.lemonVariantId` was not updated (the default fallback for unmapped countries). | Re-run §3.1. |
| Webhook 401 "invalid signature" | `LEMONSQUEEZY_WEBHOOK_SECRET` in Vercel env doesn't match the LS webhook's actual signing secret. | Re-paste the secret from §2.5 into Vercel env. Redeploy. |
| Webhook 404 (production) | Routing domain mismatch — LS is firing at staging URL, not production URL. | Re-verify §2.5 step: the webhook URL is `https://<production-domain>/api/webhooks/lemonsqueezy`, NOT the Vercel Preview URL. |
| `processOrder` fails silently (Vercel logs show `[LS Webhook] order_created` but no DB write) | A `Product.countryOverrides` key is missing the `lemonVariantId` (the §3.4 check didn't run). | Run §3.4 to find the missing key. Fix the §3.2 UPDATE. Replay the webhook from LS Dashboard. |
| `pricesByCurrency` jsonb_set fails with "invalid input syntax for type json" | The value is malformed — likely a missing outer double quote (e.g. `'123'` instead of `'"123"'`). | Re-check the SQL: the value is a jsonb string literal, so it needs BOTH the SQL outer single quotes AND inner JSON double quotes: `'"<id>"'`. |
| `BEGIN/COMMIT` block in §3.0 hangs (long-running lock) | Another query is holding a lock on `Product` (e.g. a Vercel function mid-write). | Check for long-running queries: `SELECT pid, state, query, age(clock_timestamp(), query_start) FROM pg_stat_activity WHERE state <> 'idle' AND query LIKE '%Product%' ORDER BY age DESC;`. Cancel blocking queries. |
| The §3.0 migration fails with "cannot cast type text to jsonb" | One of the `countryOverrides` / `pricesByCurrency` rows has invalid JSON (e.g. trailing comma). | Find the bad row: `SELECT slug, "countryOverrides" FROM "Product" WHERE "countryOverrides" IS NOT NULL;` — visually inspect for malformed JSON. Fix the row first (or DELETE it if it's a stale test fixture), then re-run §3.0. |

---

## §6 — Cross-references

| Topic | See |
| --- | --- |
| V1-V6 verticals deep-dive (WHY each step matters) | [`./lemon-squeezy-live-setup.md`](./lemon-squeezy-live-setup.md) |
| Real-buyer 3-locale checkout test (the V&V after this checklist) | [`./soft-launch-runbook.md`](./soft-launch-runbook.md) §2 Step 4 |
| Pre-flight gates before this checklist | [`./soft-launch-runbook.md`](./soft-launch-runbook.md) §1 |
| MCR Phase 2 AccessGrant dual-write (post-cutover source of truth) | [`../audit-log.md`](../audit-log.md) |
| Production env wiring (the `LEMONSQUEEZY_*` env vars) | `src/lib/env.ts` (`LEMONSQUEEZY_*` definitions) |
| Staging LS test-mode counterpart | [`scripts/ops/staging-bootstrap.md`](../../scripts/ops/staging-bootstrap.md) §3 |
| The `Product.lemonVariantId` schema field | `prisma/schema.prisma` `model Product` |
| Baseline migration that created the `TEXT` columns (the §3.0 trigger) | `prisma/migrations/20260709112844_baseline_default_language/migration.sql` L13-14 |
| The provider that consumes `lemonVariantId` for checkout | `src/lib/commerce/payments/providers/lemonsqueezy/index.ts` (`createCheckout`) |
| The webhook handler that resolves the product from the variant ID | `src/app/api/webhooks/lemonsqueezy/route.ts` (`handleLsOrder` → `processOrder`) |
| The pricing utility that reads `countryOverrides` + `pricesByCurrency` | `src/lib/utils/pricing.ts` (`parseCountryOverrides`, `getCountryPriceOverride`, `parsePricesByCurrency`) |
| Course config generation that embeds the variant IDs in the cached config | `src/lib/config/generate-course-config.ts` (L157-178) |

---

## §7 — Document control

| Field | Value |
| --- | --- |
| First written | FASE 3.2 (this runbook) |
| Companion | `docs/ops/lemon-squeezy-live-setup.md` (deep-dive V1-V6); `docs/ops/soft-launch-runbook.md` (downstream V&V) |
| Review cadence | After each LS vendor dashboard overhaul (rare) or after each major release that touches `Product.lemonVariantId` / `countryOverrides` / `pricesByCurrency` schema |
| Tight coupling | The §3.0 schema migration is a one-time op. After it lands, future operators of this checklist can SKIP §3.0 (the columns are already `jsonb`). The runbook should be updated to reflect "skip §3.0 if the columns are already `jsonb`" once the migration has been applied to production. |
