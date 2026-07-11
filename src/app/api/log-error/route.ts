/**
 * /api/log-error — Client-side error ingestion endpoint.
 *
 * Two ingestion paths feed the same Redis layout:
 *   1. Server errors → instrumentation.ts → server-error-sink.ts → Redis (direct)
 *   2. Client errors → error.tsx → useLogError() → THIS endpoint → Redis
 *
 * This endpoint exists ONLY for the client path, because:
 *   - It needs to be reachable from the browser (instrumentation can't be)
 *   - It needs to be protected from random external scripts (secret header)
 *   - It needs rate limiting to prevent spam (a hot Client Component error
 *     loop could otherwise flood Redis)
 *
 * Auth model:
 *   - Header `X-Log-Secret: <LOG_ERROR_SECRET>` is required
 *   - Same secret is exposed to the client as NEXT_PUBLIC_LOG_ERROR_SECRET
 *     (so the browser can authenticate)
 *   - The secret is a "soft" gate: anyone who views page source can see it.
 *     Its purpose is to keep random external scripts from spamming the
 *     endpoint, NOT to hide it. The rate limits are the real defense.
 *
 * Rate limits:
 *   - 30 requests/minute per IP (AUTH tier from rate-limit.ts)
 *   - Per-digest 60s dedup window (matching the server sink)
 *   - If Redis is down, errors are dropped to console and 204 is returned
 *     (we never want logging to break the caller's UX).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRedis } from "@/lib/redis";
import { rateLimitAsync, RATE_TIERS } from "@/lib/utils/rate-limit";
import {
  DEDUP_WINDOW_SECONDS,
  GLOBAL_CAP_PER_MINUTE,
  SEVEN_DAYS_SECONDS,
} from "@/lib/logging/constants";

const errorPayloadSchema = z.object({
  digest: z.string().max(200).optional(),
  message: z.string().max(10_000),
  stack: z.string().max(50_000).optional(),
  path: z.string().max(2_000),
  source: z.enum(["client", "server"]),
  timestamp: z.string().max(64).optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── 1. Secret check (fail closed) ──────────────────────────
  const providedSecret = req.headers.get("x-log-secret");
  const expectedSecret = process.env.LOG_ERROR_SECRET;
  if (!expectedSecret || !providedSecret || providedSecret !== expectedSecret) {
    // 401 with no body — we don't leak whether the secret was wrong vs missing.
    return new NextResponse(null, { status: 401 });
  }

  // ── 2. Parse + validate payload ───────────────────────────
  let body: z.infer<typeof errorPayloadSchema>;
  try {
    const raw = await req.json();
    body = errorPayloadSchema.parse(raw);
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  // ── 3. Per-IP rate limit (AUTH tier = 30/min) ──────────────
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  const rl = await rateLimitAsync(
    `log-error:${ip}`,
    RATE_TIERS.AUTH.max,
    RATE_TIERS.AUTH.windowMs
  );
  if (!rl.allowed) {
    return new NextResponse(null, {
      status: 429,
      headers: {
        "Retry-After": String(Math.ceil(rl.resetIn / 1000)),
      },
    });
  }

  // ── 4. Persist (Redis) with per-digest dedup + global cap ──────────────
  try {
    const r = getRedis();
    if (!r) {
      console.error("[log-error] Redis not configured. Dropping client error:", {
        digest: body.digest,
        path: body.path,
        message: body.message.slice(0, 200),
      });
      return new NextResponse(null, { status: 204 });
    }

    // Per-digest dedup — matches the server sink so client + server hits
    // for the same digest collapse to one log entry.
    if (body.digest) {
      const lockCount = await r.incr(`errlog:lock:${body.digest}`);
      if (lockCount === 1) {
        await r.expire(`errlog:lock:${body.digest}`, DEDUP_WINDOW_SECONDS);
      }
      if (lockCount > 1) {
        return new NextResponse(null, { status: 204 });
      }
    }

    // Global sliding-window cap (only on actual new writes). Mirrors the
    // server-error-sink semantics so server + client paths share one quota
    // and a single hot digest can't block unrelated new errors.
    const globalCount = await r.incr("errlog:counter:global");
    if (globalCount === 1) {
      await r.expire("errlog:counter:global", DEDUP_WINDOW_SECONDS);
    }
    if (globalCount > GLOBAL_CAP_PER_MINUTE) {
      return new NextResponse(null, { status: 204 });
    }

    const timestamp = body.timestamp ?? new Date().toISOString();
    const userAgent = req.headers.get("user-agent") ?? undefined;
    const key = `errlog:${body.digest ?? "no-digest"}:${timestamp}`;
    const fullPayload = {
      ...body,
      timestamp,
      userAgent,
    };
    await r.set(key, JSON.stringify(fullPayload), { ex: SEVEN_DAYS_SECONDS });
  } catch (err) {
    console.error("[log-error] Redis write failed:", err);
    // Return 204 anyway — caller is a fire-and-forget reporter; surfacing
    // a 500 here would just spam the network tab without helping anyone.
  }

  return new NextResponse(null, { status: 204 });
}
