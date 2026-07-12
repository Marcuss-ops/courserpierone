# Production Readiness

This document describes how the platform is prepared for production.

## Environment Separation

We follow the standard Next.js / Vercel pattern:

- `.env.example` — safe template, committed to git, no secrets.
- `.env.local` — local development secrets, never committed.
- Vercel Dashboard — production and preview environment variables.
- GitHub Actions — CI-safe dummy values in `.github/workflows/ci.yml`.

### Rules

1. Never commit `.env`, `.env.local`, or any file containing real secrets.
2. Use `src/lib/env.ts` to validate required variables at startup.
3. Keep `NEXT_PUBLIC_*` variables public by design; never prefix secrets with `NEXT_PUBLIC_`.

## Secrets Exposure Prevention

- **gitleaks** runs on every push and PR via `.github/workflows/secrets-scan.yml`.
- `.gitignore` ignores `.env*`, `*.pem`, and other sensitive files.
- Run locally before committing:
  ```bash
  npx gitleaks detect --source . --verbose
  ```

## Database Backups

### Local Development (docker-compose)

The `pgbackups` service in `docker-compose.yml` creates a daily logical dump of the Postgres database:

```bash
docker compose up -d pgbackups
# Dumps are written to ./backups/
```

Retention: 7 daily, 4 weekly, 3 monthly backups.

### Production (Supabase)

For Supabase production projects:

1. Enable **Point-in-Time Recovery (PITR)** in the Supabase Dashboard (Pro plan).
2. Schedule automated daily backups.
3. Optionally configure a GitHub Actions cron to run `pg_dump` to a secure storage bucket.

## Centralized Logging & Error Alerts

### Server Errors

- `src/instrumentation.ts` captures server-side errors.
- `src/lib/logging/server-error-sink.ts` writes errors to Redis with a 7-day TTL.
- If `ALERT_WEBHOOK_URL` is set, a Slack/Discord notification is sent for each unique error.

### Client Errors

- `src/lib/logging/use-log-error.ts` reports client errors to `/api/log-error`.
- `src/app/api/log-error/route.ts` persists them to Redis with rate limiting.

### Setup

1. Create a Slack Incoming Webhook or Discord webhook.
2. Set `ALERT_WEBHOOK_URL` in production environment variables.
3. Ensure `LOG_ERROR_SECRET` and `NEXT_PUBLIC_LOG_ERROR_SECRET` match.

## Uptime Monitoring

The health endpoint is ready for external monitors:

```
GET https://<your-domain>/api/health
```

Response:

- `200` — healthy
- `503` — unhealthy (database down)

### Recommended Services

- **Better Stack (Better Uptime)** — monitor `/api/health`, alert via email/SMS/Slack.
- **UptimeRobot** — free tier, ping the health endpoint every 5 minutes.
- **Vercel Analytics / Cron** — use a Vercel cron to hit `/api/health` periodically.

### Vercel Cron (optional)

Add to `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/health",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

## Rate Limiting

Rate limiting is implemented in `src/lib/utils/rate-limit.ts`:

- `PUBLIC` — 100 req/min for public APIs.
- `AUTH` — 30 req/min for auth/sensitive endpoints.
- `MESSAGES` — 10 req/min for DM sending.
- `WEBHOOK` — 200 req/min for Stripe/Lemon Squeezy webhooks.

Redis-backed when `KV_REST_API_URL` / `UPSTASH_REDIS_REST_URL` is configured; in-memory fallback otherwise.

Critical API routes should wrap handlers with `withRateLimit(handler, tier)`.

## Deployment Gate — E2E Journey Suite

The Definition of Done requires: *"un utente deve poter cliccare un link sotto un video YouTube, arrivare nella lingua corretta, vedere landing + prezzo + contenuti localizzati, registrarsi, pagare realmente, ricevere accesso ed email di conferma, entrare nella dashboard, vedere le lezioni, mantenere progressi dopo logout / nuovo login."*

`tests/e2e/journey.spec.ts` parametrizes this exact flow for the 3 V1 locales (`it-it`, `en-us`, `es-es`). The `.github/workflows/journey-e2e.yml` workflow runs:

- `pull_request` toward `main`
- `push` on `main`
- `workflow_dispatch` (manual trigger)

…and exports the GH status check **`e2e-journey (chrome)`**. Branch protection on `main` **MUST** require this check (alongside `CI / ci` and `Prisma Migrate Deploy / migrate`) so any red journey run blocks merge.

### Two-mode behaviour

| Mode | State |
|------|-------|
| Without Stripe + Supabase test secrets | Journey spec calls `test.skip()` → Playwright reports "skipped" → job = PASSED. Gate OK (still surfaces suite coverage as not yet exercised). |
| With secrets configured (Stripe test-mode + Supabase test-project) | Journey executes the full flow sign-up → paywall → webhook → portal → lesson → progress → sign-out → re-login → progress persists. Gate is real. |

### Required GitHub Secrets (for the gate to be real)

Settings → Secrets and variables → Actions → New repository secret:

| Secret | Purpose |
|--------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase test-project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role (for `signUpTestUser` admin API) |
| `STRIPE_SECRET_KEY` | Stripe test-mode `sk_test_...` |
| `STRIPE_WEBHOOK_SECRET` | Stripe test webhook signing secret `whsec_...` |
| `TEST_STRIPE_PRICE_ID` | Stripe test-mode price ID (`price_...`) |
| `LEMONSQUEEZY_API_KEY` *(optional)* | Lemon Squeezy test API for the future matrices |
| `LEMONSQUEEZY_WEBHOOK_SECRET` *(optional)* | Lemon Squeezy test webhook secret |
| `LEMONSQUEEZY_STORE_ID` *(optional)* | Lemon Squeezy test store |
| `TEST_LEMON_VARIANT_ID` *(optional)* | Lemon Squeezy test variant |

Without secrets the gate still passes — Playwright counts skipped tests as non-failures. To exercise the **real** reliability matrix, configure these secrets in GH Settings before merging the journey gate to production.

### Local reproduction of the gate

```bash
# Standalone Postgres + Redis for the journey
docker compose up -d db redis

# Set test-mode secrets in .env.local
echo "STRIPE_SECRET_KEY=sk_test_..." >> .env.local
echo "STRIPE_WEBHOOK_SECRET=whsec_..." >> .env.local
echo "TEST_STRIPE_PRICE_ID=price_..." >> .env.local
echo "NEXT_PUBLIC_SUPABASE_URL=https://<test>.supabase.co" >> .env.local
echo "SUPABASE_SERVICE_ROLE_KEY=eyJ..." >> .env.local

npm run dev          # in another terminal
npm run test:e2e     # exercises the journey suite
```

## Security Checklist Before Going Live

- [ ] All production env vars are set in Vercel Dashboard.
- [ ] `LOG_ERROR_SECRET` and `NEXT_PUBLIC_LOG_ERROR_SECRET` match and are strong.
- [ ] `CRON_SECRET` is set and strong.
- [ ] `NODE_ENV=production` in Vercel.
- [ ] Supabase PITR / automated backups enabled.
- [ ] Uptime monitor configured for `/api/health`.
- [ ] Slack/Discord alert webhook tested.
- [ ] gitleaks CI passing on `main`.
