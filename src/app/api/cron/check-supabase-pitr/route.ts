/**
 * GET /api/cron/check-supabase-pitr
 *
 * Vercel Cron — weekly synthetic ping that mirrors the §6.5 synthetic-ping
 * pattern: validates that the Supabase Dashboard restore prompt is "reachable"
 * by probing the public proxies that the prompt's documentation lives on.
 *
 * Why a probe (and not a real authed Dashboard fetch):
 *   The Dashboard restore prompt is behind Supabase auth (login wall), so an
 *   unattended cron cannot fetch it directly. Instead we probe 3 public
 *   targets whose joint health is a strong indirect signal:
 *
 *     1. Docs page:  https://supabase.com/docs/guides/platform/backups
 *        Assertion: HTTP 200 + body contains "Point-in-time recovery" or "PITR"
 *        AND contains "Dashboard". If the docs page is reachable AND still
 *        documents the Dashboard restore prompt, the prompt is logically part
 *        of the platform.
 *
 *     2. Statuspage: https://status.supabase.com/api/v2/status.json
 *        Assertion: HTTP 200 + status.indicator !== "critical". Corroborates
 *        "no dashboard-wide outage is happening" via Atlassian Statuspage JSON.
 *
 *     3. Dashboard DNS: app.supabase.com
 *        Assertion: ≥1 A record returned via dns.promises.resolve4. Confirms
 *        the Dashboard platform's DNS has not been pulled.
 *
 * Honest boundary: a green ping proves only "all reachable proxies suggest
 * no Supabase-wide outage is affecting the relevant surfaces." It does NOT
 * prove the Dashboard restore prompt is reachable from an authenticated admin
 * session. See Appendix E.0 caveat #2 in docs/production.md.
 *
 * Wiring:
 *   - Schedule:    vercel.json `crons` — "0 9 * * 1" (Sundays at 09:00 UTC).
 *   - Auth:        Bearer ${CRON_SECRET} (matches src/app/api/cron/abandoned-checkouts
 *                  pattern); 401 if missing/wrong, 503 if CRON_SECRET unset.
 *   - Alert path:  on unhealthy → logServerError() → Redis (7d TTL) + fires
 *                  optional ALERT_WEBHOOK_URL (Slack/Discord) via the existing
 *                  src/lib/logging/server-error-sink.ts alert path.
 *   - Idempotent:  dedup window (60s) in logServerError collapses repeat
 *                  failures; Vercel Cron only fires weekly so dedup is rarely
 *                  needed but preserves invariant if a future tighter cadence
 *                  increases frequency.
 *
 * Response:
 *   200 OK   — all 3 probes healthy. Body: { status, timestamp, durationMs, probes }.
 *   503      — at least 1 probe unhealthy; logServerError already fired.
 *   401      — missing/wrong auth header.
 *   503      — CRON_SECRET not configured (server misconfiguration).
 */

import { NextResponse } from "next/server";
import { logServerError } from "@/lib/logging/server-error-sink";
import { apiErrorResponse } from "@/lib/errors";

// Force-dynamic: probes hit external URLs whose freshness matters per cron tick.
export const dynamic = "force-dynamic";
// Node runtime: node:dns + native fetch + node:fs are Node-only.
export const runtime = "nodejs";

interface ProbeResult {
  healthy: boolean;
  message: string;
  latencyMs: number;
}

const HARD_TIMEOUT_MS = 8000;

export async function GET(request: Request) {
  try {
    // ── auth ──────────────────────────────────────────
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      console.error(
        "[cron/check-supabase-pitr] CRON_SECRET not configured — rejecting"
      );
      return NextResponse.json(
        { error: "Server misconfigured" },
        { status: 503 }
      );
    }
    if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── run probes ────────────────────────────────────
    // Docs + statuspage in parallel (network-bound, low coupling). DNS
    // last because exposing an unrelated DNS record should not block the
    // main two probes. AbortController caps the whole attempt at 8s.
    const startedAt = Date.now();
    const abortCtrl = new AbortController();
    const timeoutId = setTimeout(() => abortCtrl.abort(), HARD_TIMEOUT_MS);

    const probes: Record<string, ProbeResult> = {};

    try {
      const [docs, statuspage] = await Promise.all([
        probeDocsPage(abortCtrl.signal),
        probeStatuspage(abortCtrl.signal),
      ]);
      probes.docs = docs;
      probes.statuspage = statuspage;
      const dns = await probeDashboardDns();
      probes.dashboardDns = dns;
    } finally {
      clearTimeout(timeoutId);
    }

    const durationMs = Date.now() - startedAt;
    const overallHealthy = Object.values(probes).every((p) => p.healthy);

    const responseHeaders = {
      "Cache-Control":
        "no-store, no-cache, must-revalidate, proxy-revalidate",
    };

    if (!overallHealthy) {
      const failedProbes = Object.entries(probes)
        .filter(([, r]) => !r.healthy)
        .map(([name, r]) => `${name}=${r.message}`)
        .join("; ");

      const digest = makeDigest(failedProbes);

      // Fire-and-forget. logServerError is itself non-throwing and uses Redis
      // dedup so an unhealthy cron firing every week doesn't spam alerts.
      // `void` prefix explicit-acknowledges the floating-promise lint rule
      // (@typescript-eslint/no-floating-promises) per its non-throwing contract.
      void logServerError({
        digest,
        path: "/api/cron/check-supabase-pitr",
        message: `Supabase PITR prompt probe unhealthy: ${failedProbes}`,
        source: "server",
        routePath: "/api/cron/check-supabase-pitr",
        routeType: "cron",
        method: "GET",
        timestamp: new Date().toISOString(),
      });

      return NextResponse.json(
        {
          status: "unhealthy",
          timestamp: new Date().toISOString(),
          durationMs,
          probes,
        },
        { status: 503, headers: responseHeaders }
      );
    }

    return NextResponse.json(
      {
        status: "healthy",
        timestamp: new Date().toISOString(),
        durationMs,
        probes,
      },
      { status: 200, headers: responseHeaders }
    );
  } catch (error) {
    return apiErrorResponse(error, "Cron check failed");
  }
}

// ─── Probe helpers ─────────────────────────────────────

async function probeDocsPage(signal: AbortSignal): Promise<ProbeResult> {
  const start = Date.now();
  try {
    const res = await fetch("https://supabase.com/docs/guides/platform/backups", {
      method: "GET",
      signal,
      headers: {
        "User-Agent":
          "courssy-cron/1.0 (Supabase PITR reachability ping; +https://www.courssy.com)",
      },
    });
    const latencyMs = Date.now() - start;
    if (!res.ok) {
      return { healthy: false, message: `HTTP ${res.status}`, latencyMs };
    }
    const body = await res.text();
    const hasPitr =
      body.includes("Point-in-time recovery") || body.includes("PITR");
    const hasDashboard = body.includes("Dashboard");
    if (!hasPitr || !hasDashboard) {
      const missing: string[] = [];
      if (!hasPitr) missing.push("PITR");
      if (!hasDashboard) missing.push("Dashboard");
      return {
        healthy: false,
        message: `docs reachable but missing keywords: ${missing.join(", ")}`,
        latencyMs,
      };
    }
    return {
      healthy: true,
      message: "200 OK with expected PITR + Dashboard keywords",
      latencyMs,
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    return {
      healthy: false,
      message: msg || "fetch failed",
      latencyMs,
    };
  }
}

async function probeStatuspage(signal: AbortSignal): Promise<ProbeResult> {
  const start = Date.now();
  try {
    const res = await fetch(
      "https://status.supabase.com/api/v2/status.json",
      {
        method: "GET",
        signal,
        headers: { "User-Agent": "courssy-cron/1.0" },
      }
    );
    const latencyMs = Date.now() - start;
    if (!res.ok) {
      return { healthy: false, message: `HTTP ${res.status}`, latencyMs };
    }
    const json = (await res.json()) as { status?: { indicator?: string } };
    const indicator = json?.status?.indicator ?? "unknown";
    if (indicator === "critical") {
      return {
        healthy: false,
        message: `status indicator = critical (active Supabase incident)`,
        latencyMs,
      };
    }
    return {
      healthy: true,
      message: `status.indicator = ${indicator}`,
      latencyMs,
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    return {
      healthy: false,
      message: msg || "fetch failed",
      latencyMs,
    };
  }
}

async function probeDashboardDns(): Promise<ProbeResult> {
  const start = Date.now();
  try {
    // Dynamic import: node:dns is Node-runtime only. Avoids bundler issues
    // if a stale build runs against a runtime edge mistakenly.
    const dns = await import("node:dns");
    const addresses = await dns.promises.resolve4("app.supabase.com");
    const latencyMs = Date.now() - start;
    if (!addresses || addresses.length === 0) {
      return {
        healthy: false,
        message: "no A records returned",
        latencyMs,
      };
    }
    return {
      healthy: true,
      message: `A records: ${addresses.slice(0, 3).join(", ")}`,
      latencyMs,
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    return {
      healthy: false,
      message: msg || "dns resolution failed",
      latencyMs,
    };
  }
}

// ─── Helpers ────────────────────────────────────────────

/**
 * Stable digest so the per-digest dedup lock (60s window) in
 * server-error-sink collapses repeat firings of the same root cause.
 * Format: "supabase-pitr-unhealthy-<kebab-cased-failed-probes>".
 */
function makeDigest(failedProbes: string): string {
  const norm = failedProbes
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `supabase-pitr-unhealthy-${norm || "unknown"}`;
}
