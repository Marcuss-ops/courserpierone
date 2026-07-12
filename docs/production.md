# Operations Playbook

> **Playbook Version:** `f8e58c5` (HEAD of `main` at write-time, includes the deploy-gate CI workflow).
> **Code this doc documents:** same commit — playbook is **versioned with the deployment** because they share the same Git history.
>
> **Update policy:** every change to the deploy pipeline, alert paths, RBAC model, or secret inventory MUST update this playbook in the same PR. A "Documented for commit `X`" stamp at the top of each section anchors reader expectations.

---

## TL;DR — One-page Decision Matrix

| If you see… | Do this NOW | Then |
|---|---|---|
| `deploy-gate` RED on a push to `main` | Read the failing job logs. Most common: typecheck or Playwright upstream. | Fix and re-push. Never force-merge. |
| `prisma migrate deploy` fails | DO NOT rerun. Identify the migration. Either forward-fix OR `prisma migrate resolve --rolled-back <name>` + manual SQL cleanup, then PITR-restore in worst case. | Postmortem the migration. |
| Vercel deploy fails after a green gate | Vercel-side issue. `vercel rollback` to previous deploy. | Inspect Vercel build logs. |
| Stripe / LS webhook 5xx spike | Likely our app is down or webhook secret rotated. Check `ALERT_WEBHOOK_URL`. | If secret mismatch → rotate per §5; if app down → rollback. |
| `/api/health` returns 503 | Database connection issue. Check Supabase dashboard. | If down >5 min: P0 incident (see §3). |
| Redis down | Rate limiter falls back to in-memory (logged elsewhere). Errors persist for 7-day TTL window. | Self-heals when Redis returns. |
| Slack/Discord alert stops arriving | Verify webhook URL still valid in Vercel env. | Recreate webhook in vendor, update Vercel, redeploy. |
| Student payment succeeded but no access | `prisma.order.findUnique({ where: { stripeSessionId } })` first. | If status=`pending` → webhook missed → `stripe events resend <event_id>`. |

---

## §1 — Deploy Runbook

### 1.1 Pipeline overview

```
PR merged to main
   ↓
[1] .github/workflows/ci.yml
   └─ 4 parallel: typecheck + lint + vitest + e2e-journey
   └─ Aggregator: deploy-gate (status check name for branch protection)
   └─ On red → POST to ALERT_WEBHOOK_URL (Slack/Discord)
   ↓
[2] .github/workflows/prisma-migrate.yml (only if prisma/** changed)
   └─ prisma migrate deploy against Supabase via IPv6 GH runner
   └─ Detects no-op (Already up to date) → skips Vercel deploy hook
   └─ New migrations → triggers VERCEL_DEPLOY_HOOK_URL
   ↓
[3] Vercel builds production (auto after step [2] OR promoted by hand)
   ↓
[4] Post-deploy verification (1.3 below)
```

### 1.2 Manual deploy (skip CI gate)

Reserved for hotfixes when CI infra itself is broken. Bypasses deploy-gate by definition — manual review of CI logs is mandatory.

```bash
# Deploy latest main HEAD
vercel --prod --yes

# Verify
curl -sS https://www.courssy.com/api/health | jq
```

### 1.3 Post-deploy verification (5 minutes, run after every green gate merge)

```bash
# 1) Health endpoint
curl -sS https://www.courssy.com/api/health | jq '.ok'    # expect: true

# 2) Sanity check the auth-required diagnostic (gated, needs CRON_SECRET)
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  https://www.courssy.com/api/diagnose-oauth | jq

# 3) Tail the alert channel for any new server-error-sink firings
# (manual eyeball — no CLI for Slack archaeology; use the vendor web UI)

# 4) One end-to-end checkout in Stripe TEST mode (optional, only on Friday deploys)
# Use the same Stripe test cards documented in OAUTH-SETUP.md §5.
```

If any check fails: roll back per §2. Don't debug in prod.

### 1.4 Deploy-gate cheat-sheet

The aggregator job `deploy-gate` in `.github/workflows/ci.yml` is the **single required status check** for branch protection. To mark it once:

GitHub → Settings → Branches → main → "Require status checks to pass before merging" → check `deploy-gate` → Save.

|Failing job|Likely cause|Recovery|
|---|---|---|
|`typecheck`|New `.ts`/`.tsx` with a TS error|Run `npm run typecheck` locally, fix|
|`lint`|New ESLint violation|Run `npm run lint:eslint --fix`|
|`vitest`|New unit-test assertion fails|Run `npm run test`, fix the test or production code|
|`e2e-journey`|Playwright/Vercel/Supabase env drift|Verify secrets in GH Settings still valid; check ephemeral Postgres logs|

---

## §2 — Rollback Procedure

### 2.1 Decision tree

```
Prod is broken
   │
   ├─ UI/route-only bug? (no DB schema change)
   │  └─ ✅ Vercel Rollback (instant, ~30s)
   │
   ├─ DB schema was changed in last deploy?
   │  └─ ⚠️ Forward-fix preferred (rollback DB migration is destructive)
   │
   └─ DB corruption / data loss?
      └─ 🆘 Supabase PITR-restore (slow, ~30 min, destructive)
```

### 2.2 Vercel Rollback (App code only — NO DB changes)

```bash
# Method A: CLI
vercel rollback --yes

# Method B: Dashboard
# Vercel → Project → Deployments → click the previous healthy deploy
# → "Promote to Production" → Confirm

# Verify
curl -sS https://www.courssy.com/api/health | jq
```

Vercel keeps N=20 previous deploys by default. If you need older, contact Vercel support.

### 2.3 Database migration rollback

**NEVER rerun** a failed `prisma migrate deploy`. It can leave the migration in PARTIAL state.

Three scenarios:

**a) Migration FAILED before COMMIT** (Prisma's transaction rolled back automatically):
- Status: Postgres is clean, `_prisma_migrations` has a `failed` row for the migration.
- Action: `npx prisma migrate resolve --rolled-back <migration_name>` then a `git revert` of the migration file. Re-run `prisma migrate deploy`.

**b) Migration SUCCEEDED but app breaks at runtime** (schema is OK, app code isn't):
- Action: do NOT rollback the DB. Vercel-rollback the app (2.2).

**c) Migration ran but dropped/transformed columns needed by older app code**:
- Action: Vercel-rollback the app FIRST (2.2), THEN plan a forward-fix migration that restores the data (cite the original commit SHA). DO NOT PITR.

**d) Catastrophic data loss** (deleted rows, corrupt cascade):
- Supabase Dashboard → Database → Backups → PITR → pick a restore point → Restore.
- After restore: redeploy the app at the matching commit SHA. Audit any orders created between the bad commit and the PITR point.
- **Self-hosted / sidecar alternative:** if the deploy relies on the local Docker backup container instead of Supabase PITR, see [Appendix C — Backup and Restore Run Log](#appendix-c-backup-and-restore-run-log) for the verified extraction + restore procedure.

**e) Code-and-schema interlock** — code deployed in the same commit requires a column added by that commit's migration (typical pattern: `prisma.X.update({ data: { newCol } })` on the new app code):
- **DO NOT Vercel-rollback alone:** the rolled-back code may crash on the now-present column (e.g., Prisma client expects non-null field with no default). Reverse-symmetric break.
- Options in order of preference:
  1. **Forward-fix PR:** ship a new commit that adds backward compat on the new column (nullable + graceful default) AND keeps the app working. No downtime.
  2. **Combined PITR + Vercel rollback:** Supabase PITR-restore to the pre-deploy snapshot, then Vercel-rollback to matching pre-deploy SHA. **Both must move together.** Downtime: ~10–30 min.
  3. **Avoid:** rerunning the failed migration. NEVER `prisma migrate deploy` again on a failed migration — see §2.3(a).

### 2.4 Rollback hygiene

- Every rollback MUST be followed by a postmortem commit (or follow-up PR) so the failure mode doesn't recur.
- Update this playbook if the rollback took longer than 30 min or required unavailable context.

---

## §3 — Incident Response

### 3.1 Severity matrix

| Sev | Definition | Examples | Detect via | Ack SLA | Resolve SLA | Comms required? | Postmortem |
|---|---|---|---|---|---|---|---|
| **P0** | Revenue-blocking. Core flows down | Stripe webhook down, login impossible, Supabase DB unreachable | Uptime monitor + user reports | **15 min** | **4 h** | ✅ Public status + Twitter/IG | Mandatory within 48h |
| **P1** | Feature degraded | DMs queue lag, slow checkout, broken admin tools | `server-error-sink` Slack alert + Vercel runtime logs | **1 h** | **24 h** | ✅ Status page only | Mandatory within 7 days |
| **P2** | Cosmetic / non-critical | Wrong timezone stamp, missing CSS, console warning | Manual report or CI gate | **24 h** | **next sprint** | ❌ Internal Slack | High-level summary |
| **P3** | Informational | Third-party retry succeeded, deprecation warning | Slack | — | — | ❌ | None |

### 3.2 Detection sources

| Signal | File | What you get |
|---|---|---|
| `/api/health` → 503 | `src/app/api/health/route.ts` | DB connectivity failure (single signal) |
| `server-error-sink` alert | `src/lib/logging/server-error-sink.ts` | Per-digest dedup'd errors with path + stack (rate-limited 1/min global cap) — fires to `ALERT_WEBHOOK_URL` |
| `deploy-gate` RED | `.github/workflows/ci.yml` | CI failure (no prod impact, but blocks deploy) |
| Stripe/LS webhook 4xx spike | Dashboard | Signature mismatch or downstream error |
| Vercel runtime logs | Vercel Dashboard | Cold-start spikes, build errors after deploy |

### 3.3 Comms templates

**P0 — public status**
```
We are investigating an issue preventing [logins | checkouts | course access].
We have identified the cause and are deploying a fix. ETA: [time].
Updates: <status-page-url>     ← open ticket: status.courssy.com infra (currently no status page in vercel.json — just `"crons": []`)
```

**P1 — status page only**
```
Some users are experiencing [slow load times | DM send failures] starting at [time].
We are investigating. Customers needing immediate access: support@courssy.com.
```

### 3.4 On-call rotation

> **V1.0 status: no formal on-call rotation is configured.** Alert ack SLAs (§3.1) are met on a best-effort basis by whoever sees the Slack notification during business hours (Mon–Fri 09:00–18:00 Europe/Rome). Outside business hours, recovery work begins on the next workday.
>
> When ops-lead signs off, replace this paragraph with a populated Mon–Sun × Primary + Backup table. Until then, P0/P1 SLA misses overnight are an accepted risk and must be reported in the next-day incident review.

**Specifically, for incident P0/P1 acks during business hours:**
- Whoever owns the deploy that triggered the incident ACKs within SLA. If no owner in 5 minutes, escalate to the next person in the deploy's PR reviewers list.
- Out-of-hours P0: PagerDuty-equivalent rotation **TBD**. Today: best-effort, accept the SLA miss.

---

## §4 — Admin RBAC

### 4.1 Capability matrix

| Capability | Admin | Creator | Student |
|---|---|---|---|
| Browse published courses | ✅ | ✅ | ✅ |
| Access purchased course content | ✅ | ✅ | ✅ |
| Send/receive DMs (with creator of purchased product) | ✅ (any DM) | ✅ (own product's students) | ✅ (to creator of own purchase) |
| Create / edit / publish **own** product | ✅ (any) | ⚠️ (gap) | ❌ |
| Delete **any** product | ✅ | ❌ | ❌ |
| View all orders / global analytics | ✅ | ❌ | ❌ |
| Refund an order | ✅ (admin) | ❌ | ❌ |
| Change product pricing | ✅ | ❌ | ❌ |
| Access `/api/admin/*` routes | ✅ | ❌ | ❌ |
| Manage users / change roles | ✅ | ❌ | ❌ |
| Read server-error Redis keyspace | ✅ | ❌ | ❌ |

> ⚠️ **Known gap**: `creator` row in matrix is mostly theoretical today — there is no DB-level guard that limits a creator to "their own" products. Treat creators as admins-of-their-own-content only **after** the `Product.creatorId` (Prisma relation) is enforced in service-layer queries. See SECURITY.md "Gap Noti — Ridurre superficie creator".

### 4.2 How to grant/revoke admin (currently MANUAL)

```typescript
// Grant
import { prisma } from "@/lib/db/prisma";
await prisma.user.update({
  where: { email: "ops@courssy.com" },
  data: { role: "admin" },
});

// Revoke
await prisma.user.update({
  where: { email: "ops@courssy.com" },
  data: { role: "student" },
});
```

**No CLI script exists yet.** Promote manually via the snippet above — one-off via `npx tsx -e '...'` inline or through Prisma Studio UI. When time allows, extract the snippet into `scripts/admin-promote.ts <email> <role>`.

**Audit trail:** there is no `AuditEvent` table yet (open ticket — see `SECURITY.md` § Gap Noti, "Logging strutturato"). Every role change is invisible to security after-the-fact. **Immediate action item:** add a manual Slack log convention — every time you run the snippet above, manually post in `#security`: `"Admin granted to <email> by <you> at <ISO-timestamp>"`.

> Long-term: add an `AuditEvent` table (open ticket — see SECURITY.md "Gap Noti" — Strutturare logging).

### 4.3 Guard rails

- Every `/api/admin/*`, `/api/products/[id]/*`, `/api/products/[id]/duplicate` route calls `requireAdmin()`. Server-side. **Never trusts** user metadata, only the DB `User.role`.
- `requireAdmin()` is the **only** way to gate admin endpoints. Bypassing it = security incident (log immediately).
- Role check is **after** auth check. Fail closed on either.

---

## §5 — Secret Rotation

### 5.1 Inventory (per `src/lib/env.ts`)

| Tier | Secrets | Detection window | Cadence | Recovery time | Backup |
|---|---|---|---|---|---|
| **Critical** | `DATABASE_URL`, `DIRECT_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Immediate via gitleaks PR block | **180 d** or on compromise | **15 min** (rotate + redeploy) | Vercel env history + 1Password vault |
| **Required (payments)** | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `LEMONSQUEEZY_API_KEY`, `LEMONSQUEEZY_WEBHOOK_SECRET` | Immediate via gitleaks PR block | **365 d** or on compromise | **30 min** (roll key in vendor + Vercel + redeploy) | Vendor dashboards + 1Password |
| **Required (auth)** | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `EMAIL_SERVER_PASSWORD`, `LOG_ERROR_SECRET`, `CRON_SECRET` | Immediate via gitleaks PR block | **365 d** or on compromise | **30 min** (vendor + Vercel + redeploy) | Vendor dashboards + 1Password |
| **Optional** | `OPENAI_API_KEY`, `ALERT_WEBHOOK_URL`, `NEXT_PUBLIC_APP_URL` | < 24 h (alert slack = noise) | **annually** | **15 min** (Vercel replacement) | Vendor + 1Password |

> "Detection window" assumes gitleaks CI is green on main AND `npm audit` is run weekly. Both already on the deploy-gate.

### 5.2 Rotation procedure (Critical tier — `SUPABASE_SERVICE_ROLE_KEY`)

> ⚠️ **Vercel has no native "rotate in place" field** — each env var has exactly one `name=value` binding. The dual-key path below requires BOTH a code change (so the app reads the new env name with fallback to the old) AND a Vercel config update (add the new key alongside the old).

```bash
# 1) Generate new key in Supabase Dashboard → Settings → API → "Generate new Service Role Key"
# 2) Add the new key to Vercel under a DIFFERENT env name (e.g. SUPABASE_SERVICE_ROLE_KEY_V2)

# 3) Code change (shipped in the same release or in a fast-forward PR):
#    in src/lib/db/supabase.ts, read both keys, prefer V2, fall back to V1. Then redeploy.

# 4) Verify prod on V2 (smoke-test: signup, login, prisma write).

# 5) Revoke the OLD key in Supabase Dashboard. V1 env can stay (unused, safe to prune later).

# 6) (Follow-up commit) Rename SUPABASE_SERVICE_ROLE_KEY_V2 → SUPABASE_SERVICE_ROLE_KEY; delete V1 fallback code path.
```

For other tiers, the same dual-key-then-revoke approach is recommended. **Never** rotate a single key in-place during peak traffic — forced roll-back from a half-broken state is worse than the brief overlap window.

### 5.3 What to do on a confirmed leak

1. **Treat as P0 incident** (see §3.1).
2. **Revoke the leaked secret** in the vendor dashboard immediately.
3. **Issue replacement key**, dual-key approach (§5.2) where supported, single-replacement where not.
4. **Audit usage logs** in vendor dashboard for any usage of the leaked credential between t=leak and t=detect. Look for unauthorized orders or admin actions.
5. **Postmortem within 7 days**: how did it leak (gitleaks bypassed? env var accidentally in a screenshot?), how to prevent recurrence.
6. **Update this playbook** if the recovery procedure needs adjustment.

---

## §6 — Alert Escalation

### 6.1 Source map (what fires `ALERT_WEBHOOK_URL` today)

| Source | Severity default | File | Payload shape |
|---|---|---|---|
| Server error (digest dedup'd, rate-capped 1/min globally) | **P1** | `src/lib/logging/server-error-sink.ts` | `{ text, blocks[] }` — Slack-safe |
| `deploy-gate` RED | **P2** | `.github/workflows/ci.yml` → `jq -n --arg` payload | `{ text, blocks[] }` — Slack + Discord safe |

> Both fire to **the same** `ALERT_WEBHOOK_URL` today. See §6.4 for the migration path to per-severity channels.

### 6.2 Routing matrix

| Severity | Where it lands (CURRENT) | Where it should land (FUTURE) | First responder |
|---|---|---|---|
| P0 (catastrophic, prod-down) | ALERT_WEBHOOK_URL (anyone-watching) | `#eng-incidents` Slack channel + PagerDuty | Primary on-call |
| P1 (degraded, recoverable soon) | ALERT_WEBHOOK_URL | `#eng-active` Slack channel (no PagerDuty) | Primary on-call |
| P2 (deployment blocked / cosmetic) | ALERT_WEBHOOK_URL | `#eng-ci` Slack channel | PR author (CI gate) |
| P3 (informational) | not alerted | log only | Triage weekly |

### 6.3 Manual intervention

If an alert is a single event (transaction processing edge case) and not a regression:
- **Acknowledge in Slack thread** so others know it's seen.
- **No action needed** if the digest drops below 1/min.
- **Escalate to P1** if the same digest repeats 5+ times within 24h.

### 6.4 Migration to per-severity channels

Currently one URL. To split:

1. **Vercel env**: rename to `ALERT_WEBHOOK_P0`, `ALERT_WEBHOOK_P1`, `ALERT_WEBHOOK_P2` (additive, non-breaking).
2. **`src/lib/logging/server-error-sink.ts`**: classify per-digest by severity heuristic (e.g., if `path.startsWith('/api/webhooks')` → P0; else P1). Add a classification pass.
3. **`.github/workflows/ci.yml`**: alert step reads `secrets.ALERT_WEBHOOK_P2`.
4. **Backwards-compat**: if a per-severity env var is unset, fall back to old `ALERT_WEBHOOK_URL` (warning only).

This is the cleanest path that avoids breaking the deploy that ships it. Migration is open work — no ETA.

### 6.5 `ALERT_WEBHOOK_URL` is a single point of failure (V1.0 caveat)

If Slack/Discord itself experiences an outage, OR the webhook URL is rate-limited at the vendor, BOTH the server-error-sink alert path (§3.2 detection sources) AND the deploy-gate alert path (§2.4 cheat-sheet) go silent.

**Open work:** add a daily synthetic-ping cron that POSTs to `ALERT_WEBHOOK_URL` and asserts a 2xx response. Alert via a SECONDARY channel (e.g. transactional email to `ops@courssy.com`) if the ping fails. Until that ships, treat any alert-channel outage >24 h as a **P3** incident (silent degradation of the alerting system itself, not of the platform) and rotate the webhook URL through §5.

---

## Appendix A — Quick-reference CLI

```bash
# ─── Diagnostics ────────────────────────────────────────────────────
# OAuth layers (THREE must agree)
npx tsx scripts/diagnose-oauth.ts

# Health
curl -sS https://www.courssy.com/api/health | jq

# Vercel
npx vercel ls                                 # list deploys
npx vercel env ls                             # list env vars
npx vercel rollback --yes                     # rollback to previous
npx vercel --prod --yes                       # manual deploy

# GitHub
gh workflow run prisma-migrate.yml           # re-run migrations
gh workflow run ci.yml                        # re-run deploy-gate
gh run list --limit 5                         # last 5 runs

# Database
npx prisma studio                            # web DB explorer
npx prisma migrate status                     # pending migrations
npx prisma migrate resolve --rolled-back X    # mark failed migration rolled back

# ─── Redis / error sink ─────────────────────────────────────────────
# Tail the latest 20 server errors (requires REDIS_URL)
redis-cli -u "$REDIS_URL" --no-auth-warning \
  --scan --pattern 'errlog:*' | head -20

# ─── Secrets rotation ───────────────────────────────────────────────
openssl rand -base64 32                       # generate CRON_SECRET / LOG_ERROR_SECRET
npx vercel env add CRON_SECRET production     # add to Vercel
```

---

## Appendix B — Cross-references

This playbook is one of four docs. Do not duplicate — link instead.

| Topic | See |
|---|---|
| **Threat model / known security gaps** | [`../SECURITY.md`](../SECURITY.md) |
| **OAuth / Google sign-in setup & diagnosis** | [`OAUTH-SETUP.md`](./OAUTH-SETUP.md) |
| **System architecture & data flow** | [`../ARCHITECTURE.md`](../ARCHITECTURE.md) |
| **Mission, principles, success metrics** | [`../MISSION.md`](../MISSION.md) |
| **Phase plan / what ships when** | [`../ROADMAP.md`](../ROADMAP.md) |
| **Backlogs & future features** | [`../FUTURE.md`](../FUTURE.md) |
| **CI/CD workflow files this playbook references** | `.github/workflows/ci.yml` (deploy-gate), `prisma-migrate.yml`, `secrets-scan.yml` |

---

## Appendix C — Backup and Restore Run Log

> **Live evidence-verified.** This appendix documents the **actual** backup + restore run executed in a sandbox on this repo and is reproducible on a real dev host. Refer back from §2.3(d) when PITR is unavailable or when validating the sidecar before deploy day.

### C.0 Sandbox caveats (transparency)

1. **Host ports.** The sandbox already had port 5432 occupied, so source postgres is bound to `55432`, throwaway restore postgres to `55433`.
2. **Cadence evidence window.** One bash session (~5 min). Cannot observe weekly/monthly promotion across days; documented by image behavior + retention env vars.
3. **Simulated aging caveat.** `touch -d` from host failed because backup files are root-owned (volume-mounted from container). Workaround: invoke the cleanup pass via `docker exec src-pgbackups /backup.sh` (root context).
4. **Reproducibility.** Sandbox used an isolated bridge network `test-net`. Production setup uses the same image wired in `docker-compose.yml`, all retention env vars identical.

### C.1 Stack

| Component | Image | Purpose |
|---|---|---|
| Source DB | `postgres:16-alpine` (name `src-db`) | Source of truth, schema applied via `prisma db push`, seeded with 6 reference rows |
| Backup service | `prodrigestivill/postgres-backup-local:16-alpine` (name `src-pgbackups`) | Daily cron + retention-sweep, manual trigger via `/backup.sh` |
| Throwaway restore DB | `postgres:16-alpine` (name `restore-db`) | Fresh `courser_restored` DB, isolated from source |

### C.2 Cadence verification

| Check | Evidence | How observed |
|---|---|---|
| **Daily cron** (`@daily`) | `./backups/daily/courser-<TIMESTAMP>.sql.gz` file written after `/backup.sh` | Sandbox run (§C.5) |
| **Weekly retention** | `BACKUP_KEEP_WEEKS=4` env var present in container; rename-sweep per upstream image (verified-by-design, see C.6) | `docker exec src-pgbackups env \| grep BACKUP_KEEP` |
| **Monthly retention** | `BACKUP_KEEP_MONTHS=3` env var present in container; rename-sweep per upstream image (verified-by-design, see C.6) | `docker exec src-pgbackups env \| grep BACKUP_KEEP` |
| **Manual trigger** | `docker exec src-pgbackups /backup.sh` — **not** `/etc/periodic/daily/backup.sh` (image uses `go-cron` calling `/backup.sh`) | `ps aux` inside container shows `go-cron -s @daily -p 8080 -- /backup.sh` as PID 1 |
| **Upstream rename logic** | Daily → Weekly → Monthly path runs on every `/backup.sh` invocation, gated by file mtime age | [Upstream README](https://github.com/prodrigestivill/docker-postgres-backup-local) |

### C.3 Backup file inventory

After one `/backup.sh` invocation, the on-host `./backups/` is organized:

```
./backups/
├── daily/      # most recent BACKUP_KEEP_DAYS=7 daily-tagged backups
├── weekly/     # promoted-after-7d, kept for BACKUP_KEEP_WEEKS=4
├── monthly/    # promoted-after-30d, kept for BACKUP_KEEP_MONTHS=3
└── last/       # mirror of the most-recent backup (canonical restore source)
```

Filename format: `courser-<YYYY-MM-DDTHH-MM-SS>.sql.gz` — a gzipped SQL text dump (NOT a custom-format `pg_dump`). Pipeable via `zcat | psql`.

> C.3 gotcha worth flagging: a naive `ls -t ./backups/ | head -1` returns a directory name (e.g. `weekly`) and your `zcat` will fail. Use **either** `find ./backups/ -type f -name '*.sql.gz' | head -1` (works) or pin to `./backups/last/` (canonical; image-managed).

### C.4 Reproducible restore runbook

```bash
# 1. Locate the latest backup file (NOT directly under ./backups/)
LATEST=$(find ./backups/last/ -type f -name '*.sql.gz' | head -1)
# fallback if ./backups/last/ is incompletely populated on a fresh deploy:
[ -z "$LATEST" ] && LATEST=$(find ./backups/daily/ -type f -name '*.sql.gz' | head -1)
echo "Restoring from: $LATEST"

# 2. Spin up a fresh throwaway postgres on a non-conflicting host port
docker run -d --name restore-db \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=courser_restored \
  -p 55433:5432 postgres:16-alpine
sleep 5
docker exec restore-db pg_isready -U postgres

# 3. Restore (zcat | psql into the throwaway)
zcat "$LATEST" | docker exec -i restore-db psql -U postgres -d courser_restored

# 4. Verify (run these on the throwaway, not the source)
docker exec restore-db psql -U postgres -d courser_restored -c "
  SELECT 'Product' as tbl, count(*) FROM \"Product\"
  UNION ALL SELECT 'Lesson', count(*) FROM \"Lesson\"
  UNION ALL SELECT 'LessonTranslation', count(*) FROM \"LessonTranslation\"
  UNION ALL SELECT 'Order', count(*) FROM \"Order\"
  UNION ALL SELECT 'LessonProgress', count(*) FROM \"LessonProgress\"
  UNION ALL SELECT 'User', count(*) FROM \"User\";
"
```

### C.5 Data integrity verification (live results)

Source vs restored row counts are identical across the relational tree:

| Table | Source | Restored | Δ |
|---|---|---|---|
| `Product` | 1 | 1 | 0 |
| `Lesson` | 2 | 2 | 0 |
| `LessonTranslation` | 2 | 2 | 0 |
| `Order` | 1 | 1 | 0 |
| `LessonProgress` | 1 | 1 | 0 |
| `User` | 1 | 1 | 0 |

Spot-checks (exact IDs preserved end-to-end):

- `Product( hk-prod-1 )` — slug=`backup-restore-test`, status=`published`, currency=`EUR` ✓
- `LessonTranslation( hk-tr-1 )` — title=`Lezione 1 introduzione`, videoUrl = `https://youtu.be/backup-restore-test-1` ✓
- `LessonTranslation( hk-tr-2 )` — title=`Lesson 2 deep dive`, videoUrl = `https://youtu.be/backup-restore-test-2` ✓
- `Order( hk-ord-1 )` — status=`completed`, amount=4900, currency=EUR, locale=it ✓
- `LessonProgress( hk-pr-1 )` — completed=`t` ✓
- `User( hk-user-1 )` — email=`buyer-housekeeping@example.com`, role=`student` ✓

### C.6 Conclusion

Backup → restore round trip **preserves the orders, products, lessons, and progress** relations end-to-end. The pgbackups sidecar is operationally ready for V1.0; production wiring is the same image + same env vars as `docker-compose.yml`, only the host-port and network setup differ. Cadence (daily cron) is observed; weekly + monthly retention is governed by `BACKUP_KEEP_WEEKS=4` / `BACKUP_KEEP_MONTHS=3` and the upstream image retention logic — document this as **verified-by-design**, not by multi-day sandbox observation.

---

## Document control

| Field | Value |
|---|---|
| First written | f8e58c5 era (this rewrite) |
| Last deploy-gate reviewed | f8e58c5 (deploy-gate shipped in same commit family) |
| Maintainer | ops-lead (TBD) |
| Review cadence | monthly, or any time a CI/alert path changes |
