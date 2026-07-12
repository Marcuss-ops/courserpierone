# V1 Acceptance Test Runbook

> **Documented for commit:** `HEAD of main at write-time` (idempotent — the runbook itself is the artifact being reviewed).
> **Estimated execution time:** 45–60 minutes against production, 10–15 minutes locally.
> **Last reviewer:** `-` (TODO once ops-lead signs off)

## ⚠️ CONSTRAINT — STRICTLY HONORED

This runbook exercises **EXISTING** test fixtures, scripts, webhook handlers, and admin paths on `main`. **NO code edits, NO new admin APIs, NO new product data, NO new script commands** are required to execute it. The user directive "no code edits to add a second product" extends to: no new test products, no new schema fixtures, no new admin endpoints. Any "fix you must ship first" surface is listed in §4 under BLOCKER — those are independent of this runbook and ship on their own commits.

If a check below fails AND a code change is needed to make it pass, the failing check is **not eligible for V1 sign-off** — escalate to a CODE-PR-FIRST + RE-RUN-V1 loop.

---

## 1. Acceptance Criteria Matrix (11 rows)

| # | Requirement | Status | Verification | Env | Block on |
|---|---|---|---|---|---|
| 1 | 1 real product | ✅ | `npx tsx scripts/products/list-products.ts` → expect `amish-secrets` (slug=published) | Sandbox + Prod | None |
| 2 | 3 locales | ✅ | `npm run test:e2e` (journey.spec.ts iterates `["it-it", "en-us", "es-es"]` natively); data/amish-secrets/{it,en,es}.json present | Sandbox + Prod | None |
| 3 | 3 YouTube channels | ⚠️ | Manual: `npx tsx scripts/db/seed-yt-channels.ts` doesn't exist on main. Run `npx prisma studio` → check `YouTubeChannel.count() >= 3` | Sandbox + Prod | yt-channel seed (BLOCKER — see §4) |
| 4 | 10+ test payments | ✅ | Loop `npm run test:e2e` 4× (3 locales × ~3 retries = 9+. With retries: 10+) | Sandbox + Prod | Stripe/LS test creds (`STRIPE_SECRET_KEY`, `LEMONSQUEEZY_API_KEY`, etc.) |
| 5 | 1+ real payment | ⚠️ | Manual: visit prod `/en-us/amish-secrets`, pay with real card. Validate access delivery | Prod only | Live Stripe/LS keys |
| 6 | 3 refunds | ⚠️ | Manual: in Stripe/LS Live Dashboard, refund 3 real orders. Verify `prisma.order.status === 'refunded'` for all 3 | Prod only | Live Stripe/LS dashboard access. NO automated e2e test exists for refunds on main (gap, see §4). |
| 7 | Cross-browser (Chrome/Safari/Firefox) | ❌ | `playwright.config.ts` configures only `chromium`. Safari (`webkit`) + Firefox projects NOT configured | Config | `playwright.config.ts` edit (BLOCKER — see §4). Locally only Chrome is verifiable today. |
| 8 | No code edits to add a 2nd product | ✅ | Policy. Runbook above + the entire test suite uses 1 fixed `test-course-e2e` slug | Both | None |
| 9 | Backup restored | ⚠️ | Sandbox: `docker compose logs pgbackups` shows latest dump at `./backups/`. Prod: Supabase Dashboard → Database → Backups → PITR active + latest snapshot healthy | Both | Sandbox-proven. Prod needs Supabase Pro plan check. |
| 10 | Analytics attributing a sale to the right channel | ❌ | Schema additions SHIPPED (`AnalyticEvent.channelId/locale/revenueCents`, commit `714d66e`). Query layer (`src/lib/analytics/queries.ts`) + `/api/analytics/admin` + `/admin/analytics` UI are NOT shipped (DEFER TO V1.1 per analytic audit plan). | Prod | Schema ready; queries/UI deferred. Channel attribution NOT queryable yet. |
| 11 | Log any critical error in 30 days | ⚠️ | `server-error-sink.ts` ships → Redis + ALERT_WEBHOOK_URL. But 30-day window impossible on Day 1; SPOF if Slack itself is down not yet mitigated; synthetic-ping cron not shipped (open per docs/production.md §6.5) | Prod | Calendar reminder set for `launch_date + 30d`. |

> ✅ = ready today; ⚠️ = needs manual setup (creds, data, dashboard) but uses existing tools; ❌ = ship-blocker.

---

## 2. Sandbox-Runnable Subset (execute locally even without prod)

These run against the local docker-compose stack. Useful for ops to learn the runbook before production cutover.

```bash
# 0. Bring up stack
docker compose up -d db redis pgbackups

# 1. Confirm 1 product (criterion 1)
npx tsx scripts/products/list-products.ts | jq '.[0]'
# Expect: { "slug": "amish-secrets", "updatedAt": "<iso>", "createdAt": "<iso>" }

# 2. Confirm 3 locales (criterion 2 — data files)
ls -1 data/amish-secrets/{it,en,es}.json
# Expect: 3 files printed

# 3. Run the journey test (criteria 1+2+4 partial — webhook simulated)
npm run test:e2e -- tests/e2e/journey.spec.ts
# Expect on Stripe/Supabase creds present: 3 passed (one per locale)
# Without creds: 3 skipped (graceful — see journey.spec.ts L40-49)

# 4. Run checkout tests (criterion 4 — additional simulated payments)
npm run test:e2e -- tests/e2e/checkout.stripe.spec.ts
npm run test:e2e -- tests/e2e/checkout.ls.spec.ts
# Expect: 1 passed each (if creds); skipped otherwise

# 5. Confirm backup infra (criterion 9 — sandbox side)
docker compose logs pgbackups | tail -10
# Expect: cron schedule line + "Backup successfully completed" for latest run

# 6. Confirm YouTube channels (criterion 3 — sandbox side)
# Open Prisma Studio; the YouTubeChannel count is NOT seeded by any script on main.
# This is a known gap: SEE §4 BLOCKER category.
```

> **Sandbox parity caveat:** local Postgres does not match prod Supabase PITR semantics. Sandbox backup verification only proves the cron-job pipeline works, NOT that prod data is recoverable from a specific snapshot timestamp.

---

## 3. Production Runbook (manual execution after launch)

> Roles: **ops-1** (drives), **ops-2** (verifies).
> Pause points: every REQUIRES VERIFICATION line is a hard stop.

### Prep — T-0
1. Confirm `STRIPE_LIVE_*`, `LEMONSQUEEZY_LIVE_*`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` are set in Vercel env.
2. `ALERT_WEBHOOK_URL` configured + test ping returns 2xx (POST `{"text":"V1 ATC ping"}` and assert response).
3. Supabase Pro plan confirmed active (PITR requires Pro).
4. `YouTubeChannel` table seeded with ≥3 rows pointing to `/en-us/amish-secrets` (BLOCKER per §4 — do this FIRST).

### ATC-1 Real Payment (criterion 5)
1. Visit `https://[production-domain]/en-us/amish-secrets` in incognito Chrome.
2. Click CTA — complete Stripe/LS checkout with a real corporate credit card.
3. `REQUIRES VERIFICATION`: orders.email matches the buyer email, Order.status=`completed`, Order.amount > 0.
4. `REQUIRES VERIFICATION`: portal `/en-us/amish-secrets/portal` shows lessons (AccessGate grants access).
5. Apply the same procedure to `/it-it/amish-secrets` for 1+ additional real payment per locale.

### ATC-2 Refunds (criterion 6)
1. In Stripe Live Dashboard, refund **3** of the test orders (use real orders if needed).
2. Wait ≤30 s for webhook delivery.
3. `REQUIRES VERIFICATION` per refund: `prisma.order.findUnique({ where: { id } }).status === 'refunded'` AND access to `/portal` is REVOKED for that user.
4. If a webhook lags > 30 s, the alert path or refund handler is broken — **P0 P0 incident per docs/production.md §3.1**.

### ATC-3 Backup Restored (criterion 9)
1. Supabase Dashboard → Database → Backups → confirm "Point-in-time recovery" is ENABLED.
2. Note the latest hourly snapshot timestamp (e.g., `2026-07-12T14:00:00Z`).
3. **Do NOT actually restore in prod.** Instead: spawn a `db-restore-test` ephemeral Supabase project (Pro feature) and PITR-restore to that target timestamp. Verify the test project has the expected schema + sample rows.
4. `REQUIRES VERIFICATION`: restore operation completes ≤30 min; rows count matches expected; forward-only migrations re-applied cleanly.

### ATC-4 Cross-Browser (criterion 7)
**Today this is BLOCKED by playwright.config.ts missing `firefox` + `webkit` projects.**

Manual workaround for V1 launch:
1. For each of `amish-secrets` in `it-it`, `en-us`, `es-es`, perform a manual "click-through" smoke test in:
   - Chrome (latest stable)
   - Safari (macOS user, latest stable)
   - Firefox (latest stable)
2. `REQUIRES VERIFICATION` per browser: landing renders, CTA button visible, portal paywall shows pre-checkout, lesson page loads post-checkout.
3. **Add Safari + Firefox to `playwright.config.ts` projects** as a separate atomic commit post-V1 (open ticket — see §4 BLOCKER).

### ATC-5 Analytics Attribution (criterion 10)
**Schema is ready, queries are NOT.**

Manual verification:
1. Run `npm run dev` against prod DB mirror (or use `npx prisma studio` on prod with care).
2. Visit landing page with `?utm_source=youtube&utm_campaign=channelA` — verify `AnalyticEvent` row is created with the UTM in `metadata` field.
3. Complete purchase — verify the `purchase` event ALSO captures the same UTM.
4. Confirm the two events share the same `sessionId`.
5. **Channel-to-revenue attribution per channel is NOT yet queryable** without `src/lib/analytics/queries.ts` (deferred to V1.1 per the analytics audit plan you already shipped the schema for at commit `714d66e`).

### ATC-6 30-Day Log Review (criterion 11)
1. Confirm `ALERT_WEBHOOK_URL` Slack/Discord channel is receiving `server-error-sink` events today (post-deploy).
2. Set calendar reminder for `LAUNCH_DATE + 30 days`.
3. On that day, run:
   ```bash
   redis-cli -u "$REDIS_URL" --scan --pattern 'errlog:*' | head -1000
   # AND
   grep -c 'ERROR\|CRITICAL' production-logs-30d.tar.gz
   ```
4. Triage any P0/P1 errors per `docs/production.md` §3.1 severity matrix.

---

## 4. Known Gaps & Classification

### ❌ BLOCKER — fix BEFORE V1.0 sign-off
*These are independent of this runbook and ship on separate atomic commits.*

1. **Cross-browser Playwright config** — `playwright.config.ts` adds `firefox` + `webkit` projects. ~10 LOC. (criterion 7)
2. **YouTubeChannel seed** — at least 3 rows pointing to `/en-us/amish-secrets` with `locale`, `languageCode`, `defaultLandingSlug` populated. Upstream: add `scripts/db/seed-yt-channels.ts` (no new product data; admin-only operation). (criterion 3)
3. **Refund e2e test** — `tests/e2e/refund.stripe.spec.ts` that fires 3 sequential refunds via webhook simulation and asserts Order.status → `refunded`. Counts toward criterion 4 (10+ test payments) AND criterion 6 partially. ~50 LOC. (criterion 6)

### ⚠️ MANUAL WORKAROUND — acceptable for V1.0, automate V1.1
These are runbook-executable today with existing tools but lack first-class automation. Acceptable to ship if ops commits to executing them.

4. **Real refund execution** — Stripe/LS dashboard UI-driven instead of an automated spec. (criterion 6)
5. **Real payment execution** — manual click-through with corporate card. (criterion 5)
6. **Backup PITR verification** — Supabase dashboard + ephemeral project restore. (criterion 9)
7. **Cross-browser** until the BLOCKER fix lands (criterion 7)
8. **YouTubeChannel** until BLOCKER lands (criterion 3)

### ⏸ DEFER-TO-V1.1 — acknowledge in V1.0 release notes
9. **Analytics query + UI** — Schema ships (commit `714d66e`); query layer + `/api/analytics/admin` + `/admin/analytics` page are NEXT. Without these, channel attribution is observable in DB but NOT queryable in admin UI. (criterion 10)
10. **Synthetic-ping cron for ALERT_WEBHOOK_URL** — docs/production.md §6.5 already calls this out as open work. Without it, Slack/Discord outage → silent alerting. (criterion 11 partial)
11. **30-day sustained logging review** — not possible on Day 1. Calendar reminder is the placeholder.

---

## 5. V1.0 Sign-Off Checklist (DEFINITIVE go/no-go)

Use this to declare V1 ready. ALL ✅ boxes are required.

### Code surface
- [ ] Cross-browser Playwright config added (`firefox` + `webkit` projects in `playwright.config.ts`) — BLOCKER fix shipped
- [ ] YouTubeChannel seed exists (≥3 rows) — BLOCKER fix shipped
- [ ] Refund e2e test present — BLOCKER fix shipped
- [ ] `npm run typecheck` passes on `main` (no errors in src/ out of legacy `dashboard/page.tsx`)
- [ ] `npm run test:e2e` passes locally on Chrome with Stripe+Supabase test creds
- [ ] Deploy-gate (`.github/workflows/ci.yml`) green on `main` HEAD

### Sandbox verification
- [ ] `npx tsx scripts/products/list-products.ts` returns `amish-secrets` as published
- [ ] `data/amish-secrets/{it.json,en.json,es.json}` present and pass `npx tsx scripts/validate/validate-locales.ts amish-secrets`
- [ ] `docker compose logs pgbackups` shows recent successful backup
- [ ] `npx prisma studio` confirms YouTubeChannel.count >= 3 (post-BLOCKER fix)

### Production verification (manual, ops-1 + ops-2)
- [ ] 1+ real payment completed in `/en-us/amish-secrets` AND `/it-it/amish-secrets` AND `/es-es/amish-secrets`
- [ ] Order.status=`completed` and portal grants access for the real buyer
- [ ] 3 refunds processed via Stripe/LS Live Dashboard
- [ ] All 3 refunds transition Order.status=`refunded` within ≤30s of webhook delivery
- [ ] Supabase PITR restore-to-ephemeral-project succeeds ≤30min
- [ ] Manual click-through smoke test passes in Chrome + Safari + Firefox for IT/EN/ES

### Observability
- [ ] `ALERT_WEBHOOK_URL` healthy today (curl returns 2xx)
- [ ] server-error-sink fires correctly for a deliberate test error (curl `/api/health-test` raises one to confirm)
- [ ] `prisma.analyticEvent.count({ where: { eventType: 'purchase' } })` >= 1 for the real paid order
- [ ] Same event has the correct `utm_campaign` per AT-3 step (post-purchase)

### Sign-off
- [ ] ops-1 (initials + timestamp) signs the runbook
- [ ] ops-2 (initials + timestamp) co-signs
- [ ] All `❌ BLOCKER` items from §4 resolved
- [ ] All `⏸ DEFER-TO-V1.1` items listed in V1.0 release notes

---

## 6. Replay Instructions (template for V1.1, V2.0, etc.)

To reuse this runbook against a future release:
1. Re-check §1 matrix: any ✅ now ❌? Update status column.
2. Re-check §4: any of MANUAL WORKAROUND or DEFER items now shippable? Move to ✅ + remove the workaround.
3. Re-run §2 sandbox subset.
4. Re-run §3 production sequence.
5. Re-sign §5 checklist on the new HEAD.

---

## Appendix A — Quick Reference

| What | Where |
|------|-------|
| Production deployment playbook | `docs/production.md` |
| Existing e2e journey test | `tests/e2e/journey.spec.ts` |
| Existing per-payment tests | `tests/e2e/checkout.{stripe,ls}.spec.ts` |
| Deploy-gate CI | `.github/workflows/ci.yml` |
| Migration deploy | `.github/workflows/prisma-migrate.yml` |
| Error → alert pipeline | `src/lib/logging/server-error-sink.ts` |
| Refund webhook (Stripe) | `src/app/api/webhooks/stripe/route.ts` |
| Refund webhook (LS) | `src/app/api/webhooks/lemonsqueezy/route.ts` |
| Analytics schema (ready) | `prisma/schema.prisma` (commit `714d66e`) |
| Analytics queries (deferred) | `src/lib/analytics/queries.ts` (open) |

## Document control

| Field | Value |
|---|---|
| First written | this commit |
| Reviewer | ops-lead (TBD) |
| Replay cadence | per V-minor release |
