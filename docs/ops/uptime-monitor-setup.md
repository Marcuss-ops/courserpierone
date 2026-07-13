# Uptime Monitor Setup (External Health-Check Probe)

> **Scope.** One-shot operator procedure to wire a third-party uptime
> monitor (BetterStack / UptimeRobot / cron-job.org) against the
> production `/api/health` endpoint, with a 30s polling interval and
> the **3 fails in 5min** SLA alert policy. Alerts fire to
> `ALERT_WEBHOOK_URL` (Slack/Discord) AND/OR PagerDuty Events API v2.
>
> **Audience.** Operator flipping the platform from "manual post-deploy
> health check" (per [`../production.md` §1.3](../production.md)) to
> "continuous external probe" — typically a 1-hour task. Run BEFORE
> the soft launch defined in [`./soft-launch-runbook.md`](./soft-launch-runbook.md).
>
> **Companion docs (link, do not duplicate):**
> - [`../production.md`](../production.md) — §1.3 post-deploy verification
>   uses `/api/health`; §3.2 detection sources lists `/api/health → 503`
>   as a P0 trigger; §6.5 documents the `ALERT_WEBHOOK_URL` SPOF as open
>   work; §6.2 alert routing matrix.
> - [`./soft-launch-runbook.md`](./soft-launch-runbook.md) — pre-launch gate
>   that includes a §16 cross-check assuming the monitor is wired.
> - [`../audit-log.md`](../audit-log.md) — MCR Phase 2 baseline (the
>   AccessGrant resolver is one of the dependencies `/api/health`
>   exercises transitively).
>
> **Source-of-truth code paths (read in order when investigating a fail):**
> 1. `src/app/api/health/route.ts` — the endpoint being polled.
>    HTTP 200 = healthy/degraded, 503 = unhealthy (DB down), 500 = unexpected.
> 2. `src/lib/logging/server-error-sink.ts` — the canonical Slack/Discord
>    payload format posted to `ALERT_WEBHOOK_URL` (`{ text, blocks[] }`).
> 3. `src/lib/env.ts` `ALERT_WEBHOOK_URL` — env var definition
>    (`optional: true`, per `src/lib/env.ts` L175-179).

---

## §0 — TL;DR

| Field | Value |
| --- | --- |
| Endpoint | `GET https://<prod-domain>/api/health` |
| Polling interval | **30s** (canonical uptime-monitor convention) |
| Expected response | HTTP 200 (healthy/degraded) or 503 (unhealthy — DB down) |
| SLA trigger | **3 fails in 5min** → alert fires |
| Alert path | `ALERT_WEBHOOK_URL` (Slack/Discord) **OR** PagerDuty Events API v2 |
| Recommended vendor | **BetterStack** (30s native, status page included) |
| Cost | $0 (cron-job.org) → ~$20/mo (BetterStack) → ~$60/mo (UptimeRobot Business) |
| Probe volume | **2,880 probes/day (~86,400/month)** at 30s (Vercel `nodejs` runtime) — ~11.5× headroom on Vercel Pro's 1M invocations/mo budget |

---

## §1 — Pre-flight (T-0)

ops-1 runs, ops-2 verifies. All boxes required.

- [ ] **ops-1**: Production domain is reachable. `curl -sS https://<prod-domain>/api/health | jq '.ok'` returns `true` (or the full `status: "healthy"` body per §3).
- [ ] **ops-1**: `ALERT_WEBHOOK_URL` is set in Vercel Production env (per `src/lib/env.ts` L175-179, `optional: true`). Verify: `vercel env ls production | grep ALERT_WEBHOOK_URL` shows the env name (mask the value).
- [ ] **ops-1**: A Slack/Discord channel receives `ALERT_WEBHOOK_URL` posts. Verify: `curl -X POST "$ALERT_WEBHOOK_URL" -H "Content-Type: application/json" -d '{"text":"uptime-monitor-setup ping"}'` returns 2xx AND the channel shows the message within 5s.
- [ ] **ops-1**: A PagerDuty integration key is available (if using PagerDuty). Get it from PagerDuty → Service Directory → [service] → Integrations → "Events API v2" → copy the integration key.
- [ ] **ops-2**: Vercel function-invocation budget can absorb 86,400 probes/day. Verify: Vercel Dashboard → Usage → Functions. The current monthly count + 86,400 × 30 = 2.6M must fit in the plan.
- [ ] **ops-1 + ops-2**: The vendor is chosen. Default: BetterStack. Fallback: cron-job.org (free, 1-min interval — see §4 SLA implications).

> **PAUSE POINT — REQUIRES VERIFICATION**: all 6 boxes checked before
> §2. If any check fails, stop and resolve (env unset, channel silent,
> invocation budget exceeded).

---

## §2 — Vendor comparison

| Vendor | 30s polling available? | Free tier | Status page | Alert path | Setup time | Cost |
| --- | --- | --- | --- | --- | --- | --- |
| **BetterStack** (recommended) | ✓ (paid) / 3-min (Hobby free) | Yes (Hobby: 1 monitor, 3-min interval) | ✓ included (paid) | Custom webhook + email + SMS + PagerDuty native | 10 min | $0 (Hobby) / ~$20/mo (Team) |
| **UptimeRobot** | Only on Business plan | Yes (5-min interval) | ✓ on Pro+ | Webhook + email + SMS + PagerDuty native | 15 min | $0 (free) / $60/mo (Business) |
| **cron-job.org** | ❌ (1-min minimum) | Yes | No (external only) | Custom POST (any URL, any body) | 5 min | $0 |

> **The 30s constraint is the deciding factor.** Both BetterStack and
> UptimeRobot Business support it; cron-job.org does NOT (1-min
> minimum). If 30s is required, use BetterStack. If 1-min is
> acceptable (degraded SLA — 3-min detection instead of 90s), use
> cron-job.org for $0. UptimeRobot free tier at 5-min is NOT
> acceptable for V1.0 (3 fails = 15-min detection — violates the
> 5-min SLA).

### §2.1 — BetterStack (recommended, 30s native, ~$20/mo)

1. **Sign up**: https://betterstack.com/ → create account. **Hobby free plan: 1 monitor, 3-min interval — NOT acceptable for V1.0's 30s requirement.** Use the paid Team plan (~$20/mo) for the 30s + status page + PagerDuty native integration.
2. **Create monitor**: Monitors → "+ Add monitor" → "HTTP(s)".
3. **Configure**:
   - **URL**: `https://<prod-domain>/api/health`
   - **Check interval**: `30 seconds` (default is 60s; lower to 30s in the "Advanced" section).
   - **Request timeout**: `5s` (the endpoint is <100ms in practice).
   - **Expected status codes**: `200` (treat 503 as failure — see §3 for the canonical "anything not 2xx = down" pattern).
   - **Request method**: `GET`.
4. **Alert escalation**: Monitors → [the monitor] → "Alerting" → "+ Add escalation policy".
   - **Trigger condition**: "After 3 consecutive failures" (= 90s at 30s interval, well within the 5-min SLA — see §4).
   - **Time-based threshold** (alternative): "After 3 failures within 5 minutes" (native in BetterStack).
5. **Webhook integration**: Integrations → "Custom webhook" → URL = `$ALERT_WEBHOOK_URL`, Method = `POST`, Body = the §6 JSON (with vendor-template variables like `{{monitor.name}}` filled in at test time).
6. **PagerDuty native integration** (if using): Integrations → "PagerDuty" → paste the integration key from §1. BetterStack sends the canonical PagerDuty event format.
7. **Status page** (optional but recommended): Status pages → "+ Create status page" → link the monitor. Public URL: `https://status.courssy.com`.
8. **Test alert**: Monitors → [the monitor] → "Test alert" → confirm the §6 JSON arrives in Slack/Discord within 5s.

### §2.2 — UptimeRobot ($60/mo Business for 30s; $0 free with 5-min interval)

1. **Sign up**: https://uptimerobot.com/ → create account.
2. **Choose plan**:
   - **Business** ($60/mo) — 30s interval, status page, SMS, PagerDuty native.
   - **Free** — 5-min interval ONLY. See §4: 3 fails = 15-min detection (NOT acceptable for V1.0).
3. **Add monitor**: "+ Add New Monitor" → "HTTP(s)".
4. **Configure**:
   - **Type**: `HTTP(s)`
   - **URL**: `https://<prod-domain>/api/health`
   - **Monitoring interval**: `30 seconds` (Business) or `5 minutes` (free — NOT recommended for V1.0).
   - **Monitor timeout**: `30 seconds` (the endpoint is <100ms in practice).
5. **Alert contacts**: "+ Add Alert Contact" → "Webhook" → URL = `$ALERT_WEBHOOK_URL`, POST Body = §6 JSON, Content-Type: `application/json`.
6. **SLA threshold**: In the monitor's "Advanced" settings, set "Alert after `3` consecutive failures". UptimeRobot doesn't have a native "3 in 5min" expression, so consecutive is the closest approximation.
7. **PagerDuty native integration** (if using): Alert contacts → "+ Add Alert Contact" → "PagerDuty" — paste the integration key.
8. **Test alert**: Monitors → [the monitor] → row menu → "Test alert" → confirm the §6 JSON arrives.

### §2.3 — cron-job.org (free fallback, 1-min minimum — degraded SLA)

> **⚠️ 1-min minimum interval.** The user requested 30s. If 30s is a
> hard requirement, do NOT use cron-job.org. If 1-min is acceptable
> (3 fails in 3-min detection, within the 5-min SLA), use this.

1. **Sign up**: https://cron-job.org/ → create account.
2. **Create cronjob**: Cronjobs → "+ Create cronjob".
3. **Configure**:
   - **URL**: `https://<prod-domain>/api/health`
   - **Request method**: `GET`
   - **Schedule**: `* * * * *` (every minute — the smallest interval)
   - **Request timeout**: `10 seconds`
4. **Notifications**: "Notifications" tab → "+ Add notification" → "Webhook".
   - **URL**: `$ALERT_WEBHOOK_URL`
   - **Method**: `POST`
   - **Request body**: paste the §6 JSON (verbatim, with vendor-template variables for `{{first_failure_at}}` etc. if available — otherwise substitute placeholders).
   - **Trigger condition**: "When failed" (i.e., status not 200).
5. **SLA threshold**: cron-job.org doesn't have a native "3 fails in 5min". Combine with a SECOND cronjob that POSTs a "still failing" reminder every 5 min, OR accept 3 consecutive fails at 1-min = 3-min detection (within the 5-min SLA).
6. **Test**: Cronjobs → [the cronjob] → "Run now" → confirm the §6 JSON arrives.

---

## §3 — Health endpoint contract

Verified against `src/app/api/health/route.ts` (line 48-150). The
monitor must treat the response as follows:

| HTTP status | `status` field | Monitor treats as |
| --- | --- | --- |
| **200** | `"healthy"` or `"degraded"` | **UP** (degraded = Redis down, app still serves traffic) |
| **503** | `"unhealthy"` | **DOWN** — PostgreSQL unreachable, P0 trigger |
| **500** | (any) | **DOWN** — unexpected error, treat as 503 |
| Any other 4xx | (any) | **DOWN** — auth/redirect misconfiguration |
| Connection refused / timeout | (no body) | **DOWN** — Vercel cold start or DNS issue |

> **Canonical monitor config**: "Alert on any non-2xx response" (some
> vendors have a "5xx only" default; this misses 4xx edge cases).

### 200 response shape

```json
{
  "status": "healthy",
  "timestamp": "2026-07-13T14:23:45.123Z",
  "uptime": 86400.123,
  "services": {
    "database": { "status": "up", "latencyMs": 12 },
    "redis": { "status": "up", "latencyMs": 3 }
  },
  "system": {
    "nodeVersion": "v20.x.x",
    "memory": { "rss": "128MB", "heapUsed": "64MB", "heapTotal": "96MB" },
    "platform": "linux"
  }
}
```

### 503 response shape (the alert trigger)

```json
{
  "status": "unhealthy",
  "timestamp": "2026-07-13T14:23:45.123Z",
  "uptime": 86400.123,
  "services": {
    "database": { "status": "down", "latencyMs": 0 },
    "redis": { "status": "up", "latencyMs": 3 }
  },
  "system": {
    "nodeVersion": "v20.x.x",
    "memory": { "rss": "128MB", "heapUsed": "64MB", "heapTotal": "96MB" },
    "platform": "linux"
  }
}
```

---

## §4 — SLA policy: 3 fails in 5min

The user-specified policy is **"3 fails in 5min"**. Per-vendor expressions:

| Vendor | Setting | Detection time | Within 5-min SLA? |
| --- | --- | --- | --- |
| **BetterStack** | "After 3 failures within 5 minutes" (native) | Up to 5 min | ✓ |
| **BetterStack** (alt) | "After 3 consecutive failures" at 30s | 90s | ✓ |
| **UptimeRobot Business** | "After 3 consecutive failures" at 30s | 90s | ✓ |
| **UptimeRobot free** | "After 3 consecutive failures" at 5-min interval | **15 min** | ✗ NOT acceptable |
| **cron-job.org** | "After 3 consecutive failures" at 1-min interval | 3 min | ✓ (degraded) |

> **Free UptimeRobot at 5-min interval is NOT acceptable for V1.0.**
> Detection time of 15 min for a production-down event violates the
> §0 5-min SLA. If budget-constrained, use cron-job.org (1-min, 3-min
> detection) instead.

---

## §5 — Alert paths

### §5.1 — `ALERT_WEBHOOK_URL` (Slack/Discord, primary)

The existing infra (`src/lib/logging/server-error-sink.ts` L97-114)
posts to `ALERT_WEBHOOK_URL` with this Slack-compatible shape:

```json
{
  "text": "🚨 *Server error on <path>*",
  "blocks": [
    { "type": "section", "text": { "type": "mrkdwn", "text": "..." } }
  ]
}
```

**The uptime monitor MUST use the SAME shape** when POSTing to
`ALERT_WEBHOOK_URL` — the receiver (Slack or Discord webhook
integration) doesn't discriminate between error-sink alerts and
uptime alerts. The §6 JSON below is the exact shape.

### §5.2 — PagerDuty Events API v2 (escalation, FALLBACK only)

> **Preferred path: native vendor PagerDuty integration** — BetterStack
> and UptimeRobot Business both ship native PagerDuty integrations
> (see §2.1 and §2.2). Use those; the curl below is the FALLBACK for
> vendors without native support (e.g. cron-job.org).

If the operator wants PagerDuty escalation (per [`../production.md` §3.1`](../production.md):
P0 = primary on-call, business hours), the monitor can fire a
PagerDuty event instead of (or in addition to) the webhook:

```bash
curl -X POST https://events.pagerduty.com/v2/enqueue \
  -H "Content-Type: application/json" \
  -d '{
    "routing_key": "<PAGERDUTY_INTEGRATION_KEY>",
    "event_action": "trigger",
    "dedup_key": "prod-health-503",
    "payload": {
      "summary": "Production /api/health returning 503 (3+ fails in 5min)",
      "severity": "critical",
      "source": "uptime-monitor",
      "custom_details": {
        "url": "https://<prod-domain>/api/health",
        "sla": "3 fails in 5min",
        "fails_in_window": 3,
        "window_minutes": 5
      }
    }
  }'
```

> **BetterStack and UptimeRobot Business have NATIVE PagerDuty
> integrations** — use those instead of the curl above. The curl is
> the escape hatch for vendors without native support.

### §5.3 — Dual alert (Slack/Discord + PagerDuty)

Recommended for V1.0: fire BOTH paths simultaneously.

- **Slack/Discord** (`ALERT_WEBHOOK_URL`) — visible to anyone watching
  the channel. Low noise (3 fails in 5min = low false-positive rate).
- **PagerDuty** — escalates to on-call per [`../production.md` §3.4](../production.md)
  rotation. For P0 incidents (per §3.1).

**Prefer the vendor's NATIVE PagerDuty integration** (BetterStack and
UptimeRobot Business both have it — see §2.1 and §2.2). The §5.2
curl is the FALLBACK for vendors without native PagerDuty support.

Configure the monitor's escalation policy: "Webhook + PagerDuty" in
parallel. Both fire on the same trigger condition.

---

## §6 — JSON payload for `ALERT_WEBHOOK_URL` (the 503 alert)

> **This is the JSON the operator pastes into the vendor's
> "Custom Webhook" / "POST body" field.** The shape matches the
> existing `server-error-sink.ts` Slack-compatible contract so the
> receiver (Slack/Discord webhook) handles both error-sink alerts
> and uptime alerts uniformly.

```json
{
  "text": "🚨 *Health endpoint 503 — production degraded*\n• Path: `/api/health`\n• Status: `503 unhealthy`\n• Failed since: `<ISO 8601 timestamp of first fail in the window>`\n• Fails in last 5min: `3`\n• Digest: `uptime-monitor-<monitor-id>`\n• Latency: `database=<db-latencyMs>ms, redis=<redis-latencyMs>ms`",
  "blocks": [
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "🚨 *Health endpoint 503 — production degraded* \n• Path: `/api/health` \n• Status: `503 unhealthy` \n• Failed since: `<ISO 8601 timestamp of first fail in the window>` \n• Fails in last 5min: `3` \n• Digest: `uptime-monitor-<monitor-id>` \n• Latency: `database=<db-latencyMs>ms, redis=<redis-latencyMs>ms`"
      }
    }
  ]
}
```

> **Operator fields to fill at the vendor:**
> - `<ISO 8601 timestamp of first fail>`: vendor variable
>   (BetterStack: `{{first_failure_at}}`, UptimeRobot: not natively
>   templated — substitute `"unknown"` or the monitor's `{{alert_at}}`).
> - `3`: literal value for the trigger threshold.
> - `uptime-monitor-<monitor-id>`: vendor-provided monitor ID
>   (lets the operator correlate with the vendor's dashboard;
>   BetterStack: `{{monitor.id}}`, UptimeRobot: `{{monitor_id}}`,
>   cron-job.org: substitute the cronjob name).

> **Why this shape**: the `text` field is the fallback for clients
> that don't render `blocks`. The `blocks` field is the rich-rendering
> path (Slack + Discord). Both are present in `server-error-sink.ts`
> (line 102-114) — match it exactly.

> **Latency placeholders**: `<db-latencyMs>` and `<redis-latencyMs>`
> are extracted from the 503 response body's `services.database.latencyMs`
> and `services.redis.latencyMs` fields respectively (per the §3
> 503 contract + `src/app/api/health/route.ts` L88-105 where these
> fields are populated). The monitor's webhook body can interpolate
> these from the response body. Per the §3 503 response example, a
> 503 typically has `database.latencyMs: 0` (DB is down, the query
> didn't return) and `redis.latencyMs: <small-positive>` (Redis is
> still reachable). A monitor that doesn't extract the response body
> can leave the placeholders literal (the on-call engineer will see
> the template strings and grep the monitor's logged response body
> to fill in the values manually). The latency is ACTIONABLE for
> triage: a high DB latency pre-failure is a slow-queries warning;
> a high Redis latency is a cache-layer degradation; both ≈ 0 is a
> hard connection failure.

### PagerDuty variant

If the monitor is configured to fire PagerDuty directly (no
ALERT_WEBHOOK_URL), the PagerDuty payload is the §5.2 curl above.
The §6 JSON is for the `ALERT_WEBHOOK_URL` path only.

---

## §7 — Verification (end-to-end)

### 7.1 — Vendor-side ping

In the monitor's dashboard, force a "test alert" (every vendor has
this). Confirm:

- The §6 JSON arrives at `$ALERT_WEBHOOK_URL` (HTTP 2xx response from
  the Slack/Discord receiver).
- The Slack/Discord channel shows the formatted alert within 5s.
- If PagerDuty is configured: an incident is created in PagerDuty
  with `severity: "critical"` and the `dedup_key: "prod-health-503"`.

### 7.2 — Real-failure simulation

> **Run this in a maintenance window or against a staging URL.**
> Don't simulate failure on production without a pre-announced window.

```bash
# 1. Confirm /api/health is currently 200:
curl -sS https://<prod-domain>/api/health | jq '.status'
# expect: "healthy"

# 2. From a separate host (NOT the Vercel edge), block egress to Supabase:
#    <supabase-host> is the HOST portion of DIRECT_URL — e.g. for Supabase it's
#    `db.<project-ref>.supabase.co` (NOT the full connection URL with port/user/pass).
#    Extract via `psql "$DIRECT_URL" -c "\conninfo"` or copy from Supabase Dashboard
#    → Project → Settings → Database → "Direct connection" → host field.
sudo iptables -A OUTPUT -p tcp --dport 5432 -d <supabase-host> -j DROP
# OR: use a network-policy tool to block the egress. The goal is to
#     make prisma.$queryRaw`SELECT 1` fail without breaking other egress.

# 3. Wait 30s + SLA window (5min worst case). The /api/health endpoint
#    should flip to 503 on the next probe. The monitor should fire the
#    §6 alert.

# 4. Confirm the alert arrived in Slack/Discord AND PagerDuty.

# 5. Undo the iptables rule:
sudo iptables -D OUTPUT -p tcp --dport 5432 -d <supabase-host> -j DROP

# 6. Wait 30s. The /api/health should return 200. The monitor should
#    fire a "recovered" alert (vendor-specific; configure per the
#    vendor's "Recovery alerts" setting).
```

### 7.3 — First-week false-positive audit

After 7 days in production, audit:

- Total probes: ~604,800 (86,400/day × 7).
- Failed probes: 0-5 expected (transient Supabase hiccups, Vercel
  cold starts).
- Fails-in-5min bursts: 0-1 expected. More than 2 = the SLA is too
  tight, relax to 5 fails in 5min. Zero is also a signal — the
  monitor is silent (potential SPOF, see §8).

---

## §8 — Failure modes

| Symptom | Likely cause | Recovery |
| --- | --- | --- |
| Monitor fires but Slack/Discord doesn't show the alert | `ALERT_WEBHOOK_URL` env unset, or the channel is muted, or the URL changed | Verify env: `vercel env ls production \| grep ALERT_WEBHOOK_URL`. Re-test with curl: `curl -X POST $ALERT_WEBHOOK_URL -H "Content-Type: application/json" -d @<paste §6 JSON>` and check the channel. |
| 503 fires but monitor shows "up" | Vendor treats 503 as "degraded" not "down" | Configure the monitor to treat BOTH 5xx and 4xx as failure (canonical: anything not 2xx = down). |
| Monitor polls at 30s but only 1 fail in 5min triggers alert | Vendor's SLA is "3 consecutive" not "3 in 5min" | Per §4, set "3 fails in 5min" (BetterStack native) OR "3 consecutive" as the closest approximation. |
| Monitor's own dashboard is down | Vendor outage (BetterStack/UptimeRobot itself is down) | Per [`../production.md` §6.5`](../production.md): this is the documented SPOF. **Open work**: a secondary synthetic-ping (cron-job.org as a 2nd-tier monitor, or a custom Vercel cron that pings `ALERT_WEBHOOK_URL` and alerts via email on silence >5min). For now, Slack/Discord channel silence >5min = manual eyeball by ops. |
| Function invocation budget tight at faster intervals (sub-5s) | At 30s polling, ~86,400 probes/month fits in Vercel Pro's 1M invocations/mo budget with ~11.5× headroom. NOT a current blocker. | If interval is dropped to 5s (17,280/day = ~518,400/month), still fits. Below 5s, check Vercel Dashboard → Usage → Functions before going to prod. |
| False positives during Supabase maintenance | Supabase Pro plan maintenance windows (typically 5-15 min) flip the DB temporarily | Pre-schedule a "monitor pause" window in the vendor's dashboard. BetterStack: "Maintenance windows". UptimeRobot: "Maintenance". |
| PagerDuty not firing despite 503s | PagerDuty integration key rotated but not updated in the monitor | Re-paste the integration key per §1. Re-test with the vendor's "Test PagerDuty" button. |
| Health endpoint returns 200 but Supabase IS down (false negative) | The endpoint's `prisma.$queryRaw\`SELECT 1\`` succeeded against the pooler, but a specific query path is broken | Open work: add a domain-specific probe (e.g., `prisma.product.count()` against a known product) — see `FUTURE.md` for the placeholder. Not in scope for V1.0. |
| Monitor fires on cert error but server is fine (false positive) | Vendor treats expired/invalid TLS certs as "down" even when HTTP response is 200. Common during cert rotations. | Configure the monitor to fire on HTTP status + body, NOT on TLS handshake. Most vendors: "Validate certificate" toggle → OFF. Verify by temporarily revoking the cert in a staging env. |
| Health endpoint returns 503 after migrating to `edge` runtime | Supabase free-tier DB is IPv6-only (per `staging-run-log-2026-07-12.md`). Vercel edge runtime may not have IPv6 outbound to Supabase. | **Pre-condition for the §9 edge-runtime migration**: verify Vercel edge runtime has IPv6 outbound to the Supabase DB host. Keep `nodejs` runtime until verified, otherwise the migration breaks the health probe silently. |

---

## §9 — Open work (deferred to V1.1)

| Item | Why deferred | Track in |
| --- | --- | --- |
| Secondary synthetic-ping for `ALERT_WEBHOOK_URL` itself | Per [`../production.md` §6.5`](../production.md): if Slack/Discord is down, BOTH the server-error-sink AND uptime-monitor alert paths go silent. Need a 2nd channel (email to `ops@courssy.com` on >5min silence). | `FUTURE.md` |
| Switch `/api/health` to `edge` runtime | Current 30s polling = ~86,400 probes/month (fits Vercel Pro's 1M budget with ~11.5× headroom). Edge runtime is a **latency/cold-start optimization** (avoids Vercel's `nodejs` cold-start tax on each 30s probe), not a budget fix. **GOTCHA**: Supabase free-tier is IPv6-only (per `staging-run-log-2026-07-12.md`); verify edge runtime has IPv6 outbound BEFORE migrating. | `FUTURE.md` |
| Domain-specific probe (e.g., `prisma.product.count()`) | The current `SELECT 1` is a connection-level liveness check. A V1.1 probe would assert a known product is queryable (deeper health). | `FUTURE.md` |
| Per-severity alert routing | Per [`../production.md` §6.4`](../production.md): currently one `ALERT_WEBHOOK_URL`. V1.1 splits into `ALERT_WEBHOOK_P0/P1/P2` for per-severity Slack channels. | `production.md` §6.4 |

---

## §10 — Cross-references

| Topic | See |
| --- | --- |
| Post-deploy manual `/api/health` curl (pre-monitor workflow) | [`../production.md` §1.3](../production.md) |
| Detection sources for incidents | [`../production.md` §3.2](../production.md) |
| Alert routing matrix (P0/P1/P2/P3) | [`../production.md` §6.2](../production.md) |
| `ALERT_WEBHOOK_URL` SPOF open work | [`../production.md` §6.5`](../production.md) |
| Per-severity alert routing migration | [`../production.md` §6.4`](../production.md) |
| Synthetic-ping cron for Supabase PITR (analogous pattern) | [`../production.md` Appendix E](../production.md#appendix-e--synthetic-ping-run-log) |
| Soft-launch gate that assumes monitor is wired | [`./soft-launch-runbook.md` §1 pre-flight](../ops/soft-launch-runbook.md) |
| `ALERT_WEBHOOK_URL` env definition | `src/lib/env.ts` (optional, line 175-179) |
| Health endpoint source | `src/app/api/health/route.ts` |
| Alert payload format (Slack/Discord canonical) | `src/lib/logging/server-error-sink.ts` — `logServerError()` (the `fetch(alertUrl, ...)` block; L-citations drift, function-name ref is durable) |
| Soft-launch env provisioning (env vars) | `scripts/ops/staging-env.sh` |
| Vercel Production env batch setup | `scripts/ops/vercel-prod-env.sh` |

---

## Document control

| Field | Value |
| --- | --- |
| First written | FASE 3.2 (this runbook) |
| Companion | `scripts/ops/{staging-env.sh, staging-seed.sh, vercel-prod-env.sh, soft-launch-runbook.md}` |
| Review cadence | monthly, or any time the `/api/health` response shape changes |
| Tight coupling | `src/app/api/health/route.ts` is the contract — any change to the response shape (e.g., adding a new service) requires updating §3 |
