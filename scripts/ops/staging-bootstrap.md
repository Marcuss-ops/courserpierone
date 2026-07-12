# Staging Environment Bootstrap — Operator Runbook

> **Scope.** One-shot operator procedure to bring up a staging environment for the
> Courssy codebase. Five independent verticals, each wired end-to-end with
> Vercel env vars: (1) Vercel Preview, (2) Supabase staging project,
> (3) Lemon Squeezy test mode, (4) Redis (Upstash preview), (5) SMTP test.
>
> **Audience.** Operator setting up a new staging environment post-Phase 7
> Stripe-removal — V1.x is LS-primary, so this runbook drops the Stripe
> staging trail entirely and wires LS test mode as the canonical payment path.
>
> **Companion runbooks (do not duplicate, link instead):**
> - [`../../docs/production.md`](../../docs/production.md) — deploy + rollback + secret rotation
> - [`../../docs/ops/supabase-auth-setup.md`](../../docs/ops/supabase-auth-setup.md) — Supabase Auth wiring (Site URL / `/auth/callback` / Google OAuth)
> - [`../../OAUTH-SETUP.md`](../../OAUTH-SETUP.md) — Google OAuth three-layer walkthrough
> - [`../../SECURITY.md`](../../SECURITY.md) — RBAC + threat model + secret rotation tier
> - [`staging-backfill.sh`](staging-backfill.sh) — runs AFTER this bootstrap; orchestrates migrations + backfill + audit
>
> **Source-of-truth env schema:** [`../../src/lib/env.ts`](../../src/lib/env.ts) (`ENV_DEFINITIONS` array — the canonical list of every var this runbook wires).
>
> **Cross-script helper (when present):** the shared PrismaClient `datasources` override pattern at all audit/backfill/migrate-grants scripts honors `PRIMARY_DATABASE_URL` (preferred) over `DATABASE_URL` (fallback). This runbook sets `PRIMARY_DATABASE_URL` to mirror `DIRECT_URL` so staging parity holds.

---

## TL;DR — Five verticals to wire

```
┌─ V1: Vercel ──────────────────  • new Preview env (no prod scope)
│                                • branch: staging (or any branch)
│                                • env vars per §1
│
├─ V2: Supabase ────────────────  • new project (<PROJECT-REF>-staging)
│                                • new DB (no pgBouncer pooler on free tier;
│                                  pool via pgBouncer sidecar or direct connect)
│                                • site URL = NEXT_PUBLIC_APP_URL_staging
│                                • redirect URLs per docs/ops/supabase-auth-setup §2
│
├─ V3: Lemon Squeezy test mode ─  • test-mode API key + Store ID
│                                • test variants per product (per-
│                                  product LEMONSQUEEZY_STORE_ID optional)
│                                • webhook endpoint → Vercel Preview URL
│                                  (NOT production domain)
│                                • webhook secret regenerated per webhook
│
├─ V4: Redis (Upstash preview) ─  • new Upstash database labeled "staging"
│                                • REST URL + REST token (KV_REST_API_*)
│                                • fallback: REDIS_URL via docker-compose
│                                  redis service (cfg in docker-compose.yml)
│
└─ V5: SMTP (Mailtrap.io) ─────  • sandbox inbox (catches all sent mail
                                 for operator inspection)
                               • SMTP creds (host/port/user/password) →
                                 EMAIL_SERVER_* env vars
                               • EMAIL_FROM = staging-<noreply@…>
```

After all five verticals are wired, run [`staging-backfill.sh`](staging-backfill.sh) (with `DATABASE_URL` + `DIRECT_URL` pointed at the staging Supabase direct endpoint) to apply migrations + verify invariant counters.

---

## §1 — Vercel (Preview environment)

### 1.1 Create the Preview environment

Vercel → Project → Settings → Environments → **Preview** is the staging slot
by default. The Production env remains untouched.

- Branch that maps to Preview: `staging` (recommended), OR any branch name.
  Vercel auto-deploys on push to the chosen branch.
- Build settings: same as Production (Node 22, `npm ci`, `next build`).
- ⚠️ **Never** add `prisma migrate deploy` as a `postbuild` step (Vercel +
  Supabase free tier = IPv4/IPv6 mismatch makes `migrate deploy` infinite-
  hang in "Building"). Apply migrations locally per `staging-backfill.sh`.

### 1.2 Environment variables (Preview scope only)

Vercel → Project → Settings → Environment Variables. Add the following,
**all with scope = `Preview`** (NOT `Production`):

| Variable | Scope | Value (sourcing) |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | Preview | `https://<project>-staging.vercel.app` (or your custom staging domain) |
| `DATABASE_URL` | Preview | Supabase **pooled** URL from §2.3 |
| `DIRECT_URL` | Preview | Supabase **direct** URL from §2.3 |
| `SUPABASE_URL` | Preview | `https://<PROJECT-REF>-staging.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Preview | Supabase project settings §2.4 |
| `NEXT_PUBLIC_SUPABASE_URL` | Preview | same as `SUPABASE_URL` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Preview | anon JWT from §2.4 |
| `LEMONSQUEEZY_API_KEY` | Preview | test-mode API key from §3.1 |
| `LEMONSQUEEZY_STORE_ID` | Preview | LS test store from §3.1 |
| `LEMONSQUEEZY_WEBHOOK_SECRET` | Preview | regenerated per-webhook from §3.2 |
| `KV_REST_API_URL` | Preview | Upstash REST URL from §4.1 |
| `KV_REST_API_TOKEN` | Preview | Upstash REST token from §4.1 |
| `EMAIL_SERVER_HOST` | Preview | Mailtrap host from §5.1 (e.g. `sandbox.smtp.mailtrap.io`) |
| `EMAIL_SERVER_PORT` | Preview | `587` (or `2525` if Mailtrap blocks 587) |
| `EMAIL_SERVER_USER` | Preview | Mailtrap inbox username |
| `EMAIL_SERVER_PASSWORD` | Preview | Mailtrap inbox password |
| `EMAIL_FROM` | Preview | `staging+noreply@<staging-domain>` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Preview | (mirroring from prod is OK; staging can reuse the same Google OAuth client as long as the Supabase Site URL allowlist includes the staging URL) |
| `CRON_SECRET` | Preview | `openssl rand -base64 32` — generate fresh for staging |

> The flat-env model in [`../../src/lib/env.ts`](../../src/lib/env.ts)
> does NOT discriminate `sk_test_*` from `sk_live_*` (same holds for
> `LEMONSQUEEZY_*`). Test/prod separation lives entirely in the Vercel
> environment scopes (`Production` vs `Preview`). The application reads
> `LEMONSQUEEZY_API_KEY` from whichever scope the active deployment belongs
> to — the test-mode key for staging, the live-mode key for production.
> See `docs/production-hardening.md` § row #1 for the architecture rationale.

### 1.3 Deployment verification

```bash
# Confirm scopes via Vercel CLI
npx vercel env ls
# Look for "Preview" scoping on the staging-only vars above.

# Trigger a Preview deploy (or push to the staging branch):
npx vercel --target=preview

# After deploy, hit the staging URL:
curl -sS 'https://<project>-staging.vercel.app/api/health' | jq
# Expected: { ok: true, services: { database: { status: "up" }, ... } }
```

---

## §2 — Supabase (separate staging project)

### 2.1 Create a new project

Supabase Dashboard → New Project.

| Field | Value |
| --- | --- |
| Name | `courser-staging` (or any memorable name) |
| Database password | generate via `openssl rand -base64 32`, save to 1Password |
| Region | same region as your production project (to minimize latency mismatch with Vercel Preview) |
| Plan | Free for staging-no-traffic; Pro if you need PITR or staging backups |

> Each Supabase project gets its own JWT issuer (`https://<PROJECT-REF>-staging.supabase.co/auth/v1`), its own service-role + anon keys, and its own Postgres connection. **Do NOT share a project with production.**

### 2.2 Site URL configuration

Setting `Site URL` on the new project — Dashboard → Authentication → URL Configuration.

| Field | Staging value |
| --- | --- |
| **Site URL** | `https://<project>-staging.vercel.app` (matches `NEXT_PUBLIC_APP_URL` from §1.2) |
| **Redirect URLs** (one per line) | `https://<project>-staging.vercel.app/auth/callback`<br>`https://<project>-staging.vercel.app/**` |

Full reference for the Site URL + Redirect URLs contract lives in [`docs/ops/supabase-auth-setup.md` §1 + §2](../../docs/ops/supabase-auth-setup.md) — read that before any divergence.

### 2.3 Postgres connection (pooled + direct)

Supabase Dashboard → Project → Settings → Database.

| Variant | Where it's used | URL pattern |
| --- | --- | --- |
| **Connection string** (pooled, port 6543) | Prisma runtime queries (`DATABASE_URL`) | `postgres://postgres.<PROJECT-REF>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres` |
| **Direct connection** (port 5432) | `prisma migrate deploy` + `DIRECT_URL` for migrations | `postgres://postgres:<password>@db.<PROJECT-REF>.supabase.com:5432/postgres` |

> ⚠️ Free-tier Supabase has **IPv6-only** direct connections. Vercel's
> build infrastructure is **IPv4-only** (per the existing project convention
> `[README.md#prisma-migrate-deploy-from-vercel-block]`). Apply migrations
> locally via [`staging-backfill.sh`](staging-backfill.sh) instead.

The IP-version caveat doesn't apply to local shells (which are typically
dual-stack or IPv6-capable).

### 2.4 Service-role + anon keys

Project Settings → API.

| Key | Where it's used | Wiring |
| --- | --- | --- |
| **`anon` `public`** (anon JWT, safe to expose) | `NEXT_PUBLIC_SUPABASE_ANON_KEY` (browser + server client) | Vercel Preview env (§1.2) |
| **`service_role`** (server-only, full privilege) | `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL` | Vercel Preview env (§1.2) |

Test locally:

```bash
curl -sS 'https://<PROJECT-REF>-staging.supabase.co/auth/v1/settings?apikey=<NEXT_PUBLIC_SUPABASE_ANON_KEY>' | jq
# Expected: HTTP 200 + body containing external provider config (eventually with Google enabled — §2.5).
```

### 2.5 Google OAuth provider (cross-link only)

Re-use the production Google OAuth client (same `GOOGLE_CLIENT_ID` +
`GOOGLE_CLIENT_SECRET`) — only the **Supabase Site URL allowlist** changes
to include the staging URL.

| Field | Value |
| --- | --- |
| Google provider | Toggle ON, paste GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET |
| Authorized callback URL (displayed by Supabase) | `https://<PROJECT-REF>-staging.supabase.co/auth/v1/callback` |

> Full three-layer walkthrough: [`OAUTH-SETUP.md`](../../OAUTH-SETUP.md) §2 + §3. Don't duplicate here.

### 2.6 Vercel-side verification

After §1.2 env vars are wired and §2 connection strings collected:

```bash
# Sanity: Supabase reachable from the Vercel-region (one-shot):
psql "$DIRECT_URL" -c "SELECT current_database(), current_user;"
# Expected: your staging DB name + `postgres` user.
```

---

## §3 — Lemon Squeezy (test mode)

### 3.1 LS test store + API key

Lemon Squeezy Dashboard → Settings → API.

| Setting | Staging value |
| --- | --- |
| API Key | `Create test-mode key` — **not** the production API key. Test keys are visually distinct (label includes a `test_` prefix or sandbox badge per LS UI). |
| Store | Use `Store ID = 1` (LS's built-in test store) OR a dedicated staging store if your team uses multiple sandboxes. |

> Test-mode API keys are scoped to test variants + test purchases — they
> CANNOT charge real cards and CANNOT create live-mode orders. Use them
> freely in staging without billing risk.

LS Dashboard → Stores → pick your test store → Variants → create one
test variant per staging-priced product. Each Variant ID is wired into
`Product.lemonVariantId` via the admin panel (or admin SQL for bulk).

### 3.2 Webhook endpoint + secret

LS Dashboard → Settings → Webhooks → **Create webhook**.

| Field | Value |
| --- | --- |
| Webhook URL | `https://<project>-staging.vercel.app/api/webhooks/lemonsqueezy` (NOT the production URL) |
| Events | Order Created, Order Refunded (the two events the handler consumes — see `src/app/api/webhooks/lemonsqueezy/`) |
| Signing secret | **regenerated per-webhook** by LS — copy to Vercel Preview env as `LEMONSQUEEZY_WEBHOOK_SECRET` |

> Each LS webhook has a distinct signing secret. The staging secret must
> NOT match production (production-hardening.md § row #1 requires a
> separate secret per env). Re-paste in Vercel Preview env after every
> LS webhook reset.

### 3.3 Smoke-test (signed webhooks from LS test mode)

```bash
# Use the LS dashboard's "Send test event" feature to fire a test
# order_created event. Verify in Vercel Logs:
#   POST /api/webhooks/lemonsqueezy → HTTP 200, log line:
#   [lemonsqueezy] order_created received id=ls-test-...
```

The existing `tests/e2e/checkout.ls.spec.ts` covers a signed-webhook
assertion end-to-end — running it against Vercel Preview (with stable
LS creds + Postgres) verifies the full auth flow.

### 3.4 What this does NOT cover

- **OAuth/dispute events** — Phase 2 webhook inbox covers pre-cutover
  refund/dispute events. Staging doesn't typically need them unless the
  fallback payment flow is being exercised. Out of scope here.
- **LS Subscription variants** — V1 sells single-shot digital products;
  subscriptions are post-V1.2 (per roadmap).

---

## §4 — Redis (Upstash preview database)

### 4.1 Create a preview database

Upstash Console → Create Database.

| Field | Value |
| --- | --- |
| Name | `courser-staging` (or any memorable name) |
| Region | same region as your Supabase staging project (latency minimization) |
| Type | Global for production-like replication, OR Regional for staging-lite |
| TLS | enabled (default — leave on) |

Console → Database → **REST API** section.

| Setting | Where it's used | Wiring |
| --- | --- | --- |
| `UPSTASH_REDIS_REST_URL` | `KV_REST_API_URL` (preferred) | Vercel Preview env (§1.2) |
| `UPSTASH_REDIS_REST_TOKEN` | `KV_REST_API_TOKEN` (preferred) | Vercel Preview env (§1.2) |

> The app reads `KV_REST_API_URL` first, falling back to
> `UPSTASH_REDIS_REST_URL` (per [`src/lib/redis.ts` leaf comments](../../src/lib/redis.ts)).
> Either name works; the canonical is `KV_REST_API_*` to align with Vercel
> KV adapter convention.

### 4.2 Docker fallback (no Upstash account)

If you don't want to wire Upstash in staging (lighter setup), use a local
Redis via `docker-compose`. The repo's `docker-compose.yml` already
exposes a redis service.

```bash
docker compose up -d redis
# Verify:
docker exec -it $(docker compose ps -q redis) redis-cli ping
# Expected: PONG

# Local Redis URL:
# REDIS_URL=redis://localhost:6379
# Wire to Vercel Preview env. (Vercel Preview functions → localhost is
# unreachable, so docker-compose fallback works only for LOCAL staging
# testing, not Vercel-hosted Preview. For Vercel-hosted Preview, use
# Upstash.)
```

### 4.3 Smoke-test (rate-limit INCR from staging code)

After deployment, hit any rate-limited endpoint (`/api/checkout`) several
times and verify the rate-limit key increments. `src/lib/redis.ts` reads
Redis via **two distinct transports**: `KV_REST_API_URL`+`KV_REST_API_TOKEN`
(Upstash REST, HTTPS endpoint) and `REDIS_URL` (ioredis, TCP). `redis-cli`
only speaks the Redis wire protocol (TCP `redis://` / `rediss://`); use
`curl` to hit Upstash REST. Pick the command that matches how staging
was wired:

```bash
# Path A — REDIS_URL (ioredis, TCP)
redis-cli -u "$REDIS_URL" INCR rate:checkout:<ip-hash>
# Expected: increments by 1 per request.

# Path B — KV_REST_API_URL + KV_REST_API_TOKEN (Upstash REST, HTTPS)
curl -sS -H "Authorization: Bearer $KV_REST_API_TOKEN" \
  -X POST "$KV_REST_API_URL/incr/rate%3Acheckout%3A<ip-hash>" | jq -r '.result'
# Expected: JSON body with `.result` field incrementing by 1 per request.
```

Cross-check via the existing diagnose endpoint:

```bash
curl -sS 'https://<project>-staging.vercel.app/api/health' | jq
# Expected: services.redis.status == "up" (transport-agnostic).
```

### 4.4 Why this matters for staging

The rate-limiter in [`src/lib/utils/rate-limit.ts`](../../src/lib/utils/rate-limit.ts)
falls back to in-memory when Redis is unreachable. In-memory fallback
works for single-instance but breaks in Vercel Preview multi-instance
deployments — the rate-limit becomes per-instance. To exercise the
Redis-mode code path in staging, Upstash (or docker-compose with
networking exposed) is required.

---

## §5 — SMTP (Mailtrap sandbox)

### 5.1 Mailtrap setup

Mailtrap.io → Sign up → Sandbox → Create Inbox.

| Field | Value |
| --- | --- |
| Inbox name | `courser-staging` |
| SMTP credentials | shown in the inbox page; copy to Vercel Preview env |

> Mailtrap.io's sandbox inbox **catches all email** sent from staging
> without delivering to the recipient. It's ideal for staging: no risk
> of accidentally emailing real customers + full visibility into
> template-rendered content for QA.

### 5.2 Environment variables (Preview scope)

Vercel Preview env (§1.2) gets these from the Mailtrap inbox page:

| Variable | Value (example) |
| --- | --- |
| `EMAIL_SERVER_HOST` | `sandbox.smtp.mailtrap.io` |
| `EMAIL_SERVER_PORT` | `587` (or `2525` if Mailtrap blocks 587 from Vercel egress IPs) |
| `EMAIL_SERVER_USER` | the username Mailtrap shows |
| `EMAIL_SERVER_PASSWORD` | the password Mailtrap shows |
| `EMAIL_FROM` | `staging+noreply@<project>-staging.vercel.app` (or any branded sender Mailtrap allows) |

### 5.3 Smoke-test (purchase confirms land in Mailtrap sandbox)

```bash
# After deploying Preview:
# 1. Trigger a test purchase via the LS test webhook (or run the e2e
#    `tests/e2e/checkout.ls.spec.ts` against the Preview URL).

# 2. Open the Mailtrap sandbox inbox — the purchase-confirm email should
#    appear in <2s. Verify the localized body (en/it/es/fr depending on
#    what locale was used in the test purchase).
```

### 5.4 SMTP failure mode surface

If SMTP is unconfigured or unreachable:
- `src/lib/services/email.ts` falls back to stdout-logging (per the file's
  leading comment block and `documents §Email loggato su stdout`).
- No exception thrown — emails are silently lost.
- ➡️ DANGER in staging too: a missing EMAIL_SERVER_PASSWORD means test
  purchases proceed but emails never reach the Mailtrap inbox — making
  staging look "broken" without obvious symptoms.

Mitigation: §6 verification step forces a smoke-emit + Mailtrap-check.

---

## §6 — Verification

After all 5 verticals are wired, run this end-to-end smoke:

### 6.1 Health endpoint aggregator

```bash
curl -sS 'https://<project>-staging.vercel.app/api/health' | jq
# Expected:
# {
#   "ok": true,
#   "services": {
#     "database":  { "status": "up", "latencyMs": <n> },
#     "redis":     { "status": "up", "latencyMs": <n> }   ← or "down" if in-memory fallback
#   }
# }
```

If `database.status != "up"`, the Vercel Preview env's `DATABASE_URL` or
`DIRECT_URL` is misconfigured (or the staging Supabase project is not
yet accessible). §7.1 + §7.2 below.

### 6.2 Smoke-purchase

```bash
# 1. Trigger a LS test webhook from LS Dashboard → Webhooks → "Send test".
#    The webhook URL points at the Vercel Preview (per §3.2).

# 2. Verify in Vercel Logs:
#    POST /api/webhooks/lemonsqueezy → 200, log "[lemonsqueezy] order_created".
#    The order row lands in the staging DB.

# 3. Run the dedicated LS test:
npx playwright test tests/e2e/checkout.ls.spec.ts \
  --project=chromium \
  LEMONSQUEEZY_API_KEY='<staging-key>' \
  LEMONSQUEEZY_STORE_ID='<staging-store-id>' \
  LEMONSQUEEZY_WEBHOOK_SECRET='<staging-webhook-secret>' \
  TEST_DATABASE_URL='<DIRECT_URL from §2.3>' \
  NEXT_PUBLIC_APP_URL='https://<project>-staging.vercel.app'

# Expected: 1 test passing (the LS purchase flow).
```

### 6.3 Rate-limit exercise (Redis path)

`src/lib/redis.ts` reads Redis via **two distinct transports**: `KV_REST_API_URL`
+ `KV_REST_API_TOKEN` is the Upstash REST API (HTTPS), `REDIS_URL` is ioredis
over TCP. `redis-cli` only speaks the Redis wire protocol (TCP). Pick the
verification command that matches how staging is actually wired.

#### Path A — `REDIS_URL` (ioredis, TCP)

```bash
# Hit /api/checkout from staging with rapid requests to force the
# rate-limiter over the threshold. Verify on the Redis host:
redis-cli -u "$REDIS_URL" --scan --pattern 'rate:checkout:*' | head
# Expected: at least 1 key matching rate:checkout:* pattern, with INCR count ≥ 6
# (the rate limit triggers after N requests within the window).
```

#### Path B — `KV_REST_API_URL` + `KV_REST_API_TOKEN` (Upstash REST, HTTPS)

`redis-cli` cannot talk to Upstash's HTTPS REST endpoint — use `curl` with
the Upstash REST API. The SCAN-equivalent is the `KEYS` command; the
INCR-equivalent is `POST /incr/<key>`. Both URL-encode `:` as `%3A`:

```bash
# Scan for rate-limit keys:
curl -sS -H "Authorization: Bearer $KV_REST_API_TOKEN" \
  "$KV_REST_API_URL/keys/rate%3Acheckout%3A*" | jq -r '.result[]'
# Expected: at least 1 key matching the rate pattern.

# Fetch the INCR counter value for a specific (ip-hash) key:
curl -sS -H "Authorization: Bearer $KV_REST_API_TOKEN" \
  "$KV_REST_API_URL/get/rate%3Acheckout%3A<ip-hash>" | jq -r '.result'
```

#### Cross-check via health endpoint (transport-agnostic)

```bash
curl -sS 'https://<project>-staging.vercel.app/api/health' | jq
# Expected: services.redis.status == "up". If "down", the rate-limiter
# silently falls back to in-memory and §4.4 caveats apply.
```

> ⚠️ When in doubt, run Path A or B but ALSO ping `/api/health` — the
> health endpoint's `redis.status` is transport-agnostic and confirms
> the application-wire-level Redis reachability regardless of how staging
> was wired.

### 6.4 Staging-backfill (one-shot)

Run [`staging-backfill.sh`](staging-backfill.sh) to apply migrations +
verify the audit gates pass:

```bash
DATABASE_URL='<pooled-from-§2.3>' \
DIRECT_URL='<direct-from-§2.3>' \
./scripts/ops/staging-backfill.sh --production
```

- `--production` flag passes through to the audit (per `scripts/audit-v1-readiness.ts`).
- All 5 stages should be green.
- Exit code 0 = staging is fully wired.

---

## §7 — Common failure modes

| Symptom | Root cause | Fix |
| --- | --- | --- |
| `database.status == "down"` on `/api/health` | Vercel Preview env's `DATABASE_URL` / `DIRECT_URL` mismatch staging Supabase. OR staging project not yet accessible (IPv4-only egress, free-tier IPv6-only DB). | §2.3 — verify pooled URL is in `DATABASE_URL`, direct URL in `DIRECT_URL`. Apply migrate deploy **locally** (Vercel builds don't have IPv6). |
| `/api/health` → `redis.status == "down"` (and many cross-instance rate-limit gaps) | `KV_REST_API_*` env vars not set in §1.2, OR Upstash database created in a region other than Vercel | §4.1 — re-paste the REST URL + token; pick Vercel-region-matched Upstash region. |
| LS webhook 401 "invalid signature" | `LEMONSQUEEZY_WEBHOOK_SECRET` in Vercel Preview doesn't match the LS webhook's actual signing secret | §3.2 — re-create the LS webhook and re-paste the secret. Each LS webhook has a distinct secret. |
| LS webhook 404 (route not found) | Routing domain mismatch — LS is firing at production URL, not Preview URL | §3.2 — verify webhook URL is `https://<project>-staging.vercel.app/api/webhooks/lemonsqueezy`, not production. |
| Sign-in OAuth "redirect_uri_mismatch" | Supabase Site URL on staging project doesn't include staging URL | §2.2 — re-set Site URL + Redirect URLs allowlist with staging URL. |
| Purchase fires but Mailtrap inbox stays empty | SMTP misconfigured OR `EMAIL_FROM` rejected by Mailtrap | §5.2 — verify all `EMAIL_SERVER_*` + `EMAIL_FROM` env vars; check Mailtrap inbox "Activity" tab for delivery errors. |
| Build "Building…" infinite hang | `postbuild: "prisma migrate deploy"` accidentally added to package.json | `git revert` the package.json change + commit; apply migrate deploy locally per `staging-backfill.sh`. Cross-ref `docs/production.md#prisma-migrate-deploy-from-vercel`. |
| Rate-limit fires way too early (e.g., 1 request → 429) | In-memory fallback active (Redis unreachable) AND dev-only threshold of 1 | §4.1 — verify Redis wiring is correct. |
| `redirect_uri_mismatch` on Google sign-in | Reused Google OAuth client but didn't update Google Cloud Console's Authorized redirect URIs | §2.5 — add `https://<PROJECT-REF>-staging.supabase.co/auth/v1/callback` to Google's Authorized redirect URIs. |

---

## §8 — Operational hygiene

### 8.1 Quarterly audit

- **Vercel env scoping:** all staging-only vars are **Preview-scope only**.
  Run `npx vercel env ls`, grep for the staging-only names
  (`STAGING_*` prefix or `*_staging` suffix if you used one), confirm every
  line says scope = Preview.
- **Supabase staging DB size:** Supabase Dashboard → Project → Database →
  Settings → "Reset database" only if intentional. Free-tier limits are
  500MB — verify drift has not brought staging above 80% (refresh plan or
  clean up old test data before hitting the cap).
- **Upstash staging-quota:** Upstash free tier = 10K requests/day. If you
  exceed, either upgrade or pause staging for a day (Redis is non-critical
  for the rate-limiter — the in-memory fallback is documented and tested).
- **Mailtrap inbox:** clear old sandbox emails monthly. Mailtrap retains
  100 emails on free tier indefinitely if not manually cleared.

### 8.2 Cross-env secret hygiene

| Vendor change | Staging action |
| --- | --- |
| LS rotates test webhook secret | §3.2 — re-paste new secret in Vercel Preview env. |
| LS test API key expires | §3.1 — create new test-mode API key, paste in Vercel Preview. |
| Upstash rotates REST token | §4.1 — paste new token in Vercel Preview. |
| Mailtrap rotates SMTP password | §5.2 — paste new password in Vercel Preview. |
| Supabase rotates anon JWT | §2.4 — paste new anon JWT in Vercel Preview. (Service-role rotation uses dual-key per `docs/production.md §5.2`.) |
| Google rotates OAuth client secret | Re-paste in Supabase provider config (§2.5 staging project). No Vercel change. |

### 8.3 What this runbook does NOT cover

| Topic | See |
| --- | --- |
| **Production bootstrap** (live keys + Pro Supabase plan + Upstash Pro) | Run this runbook + flip every "test"-marked item to "live" — they're structurally identical except for the test/live key boundary. |
| **Per-PR preview environments** | Vercel Preview automatically creates one per branch push. The env scoping above lets each PR-Preview inherit the staging Secret — by design (avoids per-PR secret creation). |
| **CI workflow integration** | Future: `.github/workflows/staging-verify.yml` running `staging-backfill.sh --dry-run` on `main` push. Per the FASE 2.x roadmap followups. |
| **DR/backup for staging** | Staging is non-critical — Supabase free-tier PITR is not available. Rerun this runbook from scratch if staging gets corrupted. |
| **End-to-end OAuth diags** | Run [`scripts/diagnose-oauth.ts`](../../scripts/diagnose-oauth.ts) end-to-end against staging env vars after any rotation. |

---

## §9 — Cross-references

| Topic | See |
| --- | --- |
| Supabase Auth wiring (Site URL / `/auth/callback` / Google OAuth) | [`docs/ops/supabase-auth-setup.md`](../../docs/ops/supabase-auth-setup.md) |
| Three-layer Google OAuth walkthrough | [`OAUTH-SETUP.md`](../../OAUTH-SETUP.md) |
| Production deploy / rollback / secret rotation | [`docs/production.md`](../../docs/production.md) |
| Source-of-truth env schema | [`src/lib/env.ts`](../../src/lib/env.ts) (`ENV_DEFINITIONS` array) |
| Threat model + RBAC + secret rotation tier | [`SECURITY.md`](../../SECURITY.md) |
| Pre-flight migrations + backfill runner | [`staging-backfill.sh`](staging-backfill.sh) |
| Production-hardening gap analysis (Vercel env separation + Redis mode) | [`docs/production-hardening.md`](../../docs/production-hardening.md) |
| Roadmap (FASE 2.x staging followups) | [`docs/roadmap-current.md`](../../docs/roadmap-current.md) |

---

## Document control

| Field | Value |
| --- | --- |
| First written | FASE 2 (this runbook) |
| Source of truth for each vertical | External vendor dashboards (Vercel, Supabase, LS, Upstash, Mailtrap) — this runbook is the **procedural mirror** |
| Cross-checked against | `docs/production.md` (deploy + rollback), `docs/ops/supabase-auth-setup.md` (Auth wiring), `OAUTH-SETUP.md` (Google three-layer), `src/lib/env.ts` (typed env schema), `src/lib/redis.ts` (Redis provider selection), `src/lib/services/email.ts` (SMTP fallback), `scripts/ops/staging-backfill.sh` (post-bootstrap orchestration) |
| Maintainer | ops-lead (TBD) |
| Review cadence | quarterly audit (per §8.1); immediate update on any vertical's vendor-side change |
