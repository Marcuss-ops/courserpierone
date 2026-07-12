/**
 * server-error-sink.ts — Direct Redis writer for server-side errors.
 *
 * Why this exists (instead of POSTing to /api/log-error from instrumentation):
 *   1. NO circular error loops — a failing /api/log-error could itself trigger
 *      onRequestError recursively.
 *   2. NO unnecessary network hop — instrumentation runs in the same Node
 *      process as the route handler that crashed; talking to Redis directly
 *      is the same latency profile with less moving parts.
 *   3. NO Vercel function invocation burn — every fetch to your own route
 *      counts as an invocation, which has cost + cold-start implications.
 *
 * Storage layout in Redis (7-day TTL):
 *   errlog:<digest>:<iso-timestamp>   →  JSON payload
 *   errlog:lock:<digest>              →  counter (1, expires after 60s) — dedup
 *   errlog:counter:global             →  sliding-window counter (expires after 60s) — global rate cap
 *
 * Failure mode: every Redis call is wrapped in try/catch and degrades to
 * console.error. A failing sink MUST NEVER propagate, or it would crash the
 * error page (which is the very thing we're trying to instrument).
 */

import { getRedis } from "@/lib/redis";
import {
  DEDUP_WINDOW_SECONDS,
  GLOBAL_CAP_PER_MINUTE,
  SEVEN_DAYS_SECONDS,
} from "@/lib/logging/constants";

export interface ServerErrorPayload {
  digest: string;
  path: string;
  message: string;
  stack?: string;
  source: "server";
  routePath?: string;
  routeType?: string;
  renderSource?: string;
  method?: string;
  userAgent?: string;
  timestamp: string; // ISO 8601
}

/**
 * Write a server-side error to Redis. Fire-and-forget from the caller's
 * perspective: never throws, always degrades to console.error.
 */
export async function logServerError(payload: ServerErrorPayload): Promise<void> {
  try {
    const r = getRedis();
    if (!r) {
      console.error("[error-sink] Redis not configured, dropping server error:", {
        digest: payload.digest,
        path: payload.path,
        message: payload.message,
      });
      return;
    }

    // ── 1. Per-digest dedup lock (60s) ──
    // Same error fingerprint firing N times in a row → write only once.
    // IMPORTANT: done BEFORE the global cap so a single digest in a hot
    // loop doesn't fill the global counter and block unrelated new errors.
    if (payload.digest) {
      const lockCount = await r.incr(`errlog:lock:${payload.digest}`);
      if (lockCount === 1) {
        await r.expire(`errlog:lock:${payload.digest}`, DEDUP_WINDOW_SECONDS);
      }
      if (lockCount > 1) {
        // Already logged this digest within the dedup window.
        return;
      }
    }

    // ── 2. Global sliding-window cap (only on actual new writes) ──
    // If we've already logged >50 unique errors in the last 60s, drop
    // further logs to protect Upstash quota from a wide error storm.
    const globalCount = await r.incr("errlog:counter:global");
    if (globalCount === 1) {
      // First increment in this window — set the TTL.
      await r.expire("errlog:counter:global", DEDUP_WINDOW_SECONDS);
    }
    if (globalCount > GLOBAL_CAP_PER_MINUTE) {
      // Already at the cap. We still bumped the counter, which is fine —
      // subsequent calls will also see >50 and skip.
      return;
    }

    // ── 3. Write the structured payload ──
    const key = `errlog:${payload.digest || "no-digest"}:${payload.timestamp}`;
    await r.set(key, JSON.stringify(payload), { ex: SEVEN_DAYS_SECONDS });

    // ── 4. Optional real-time alert (Slack/Discord webhook) ──
    // Fire-and-forget: logging must never block the request or propagate.
    const alertUrl = process.env.ALERT_WEBHOOK_URL;
    if (alertUrl) {
      fetch(alertUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `🚨 *Server error on ${payload.path || "unknown"}*`,
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `🚨 *Server error* \n• Path: \`${payload.path || "unknown"}\` \n• Digest: \`${payload.digest || "no-digest"}\` \n• Message: \`${payload.message.slice(0, 200)}\``,
              },
            },
          ],
        }),
      }).catch(() => {
        // Alert delivery failure is non-critical; already persisted in Redis.
      });
    }
  } catch (err) {
    // Sink failure is NEVER allowed to propagate. We log to console (which
    // Vercel captures in runtime logs) and move on.
    console.error("[error-sink] Redis write failed, falling back to console:", err);
    console.error("[error-sink] Dropped server error:", {
      digest: payload.digest,
      path: payload.path,
      message: payload.message,
    });
  }
}
