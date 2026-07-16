/**
 * Rate limiter a finestra fissa (fixed window) — dual-mode Redis + in-memory.
 *
 * Design:
 *   - Redis mode:    Atomic fixed window via INCR + EXPIRE (scalabile su multi-istanza Vercel)
 *   - In-memory mode: Fallback automatico quando Redis non è configurato
 *   - Finestra fissa: il contatore resetta dopo windowMs dal primo incremento
 *
 * Tiers predefiniti:
 *   - PUBLIC:    100 req/min  (API pubbliche: prodotti, config, analytics)
 *   - AUTH:       30 req/min  (endpoint di autenticazione/sensibili)
 *   - MESSAGES:   10 req/min  (invio DM)
 *   - WEBHOOK:   200 req/min  (Lemon Squeezy — firma verificata)
 */

import { NextRequest, NextResponse } from "next/server";
import { AppError, apiErrorResponse } from "@/lib/errors";
import { getRedis } from "@/lib/redis";

// ─── Tiers ──────────────────────────────────────────────────
const MINUTE = 60_000;

export const RATE_TIERS = {
  /** API pubbliche: prodotti, config, analytics, profili */
  PUBLIC: { max: 100, windowMs: MINUTE },
  /** Endpoint sensibili: checkout, profilo, auth */
  AUTH: { max: 30, windowMs: MINUTE },
  /** Invio messaggi DM */
  MESSAGES: { max: 10, windowMs: MINUTE },
  /** Webhook Lemon Squeezy — raffiche consentite, firma verificata */
  WEBHOOK: { max: 200, windowMs: MINUTE },
} as const;

export type RateTier = keyof typeof RATE_TIERS;

// ─── Store in-memory (fallback) ────────────────────────────
const hits = new Map<string, { count: number; resetAt: number }>();

let lastCleanup = Date.now();
function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < 60_000) return;
  lastCleanup = now;
  for (const [key, val] of hits) {
    if (val.resetAt < now) hits.delete(key);
  }
}

// ─── Core ──────────────────────────────────────────────────
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetIn: number; // millisecondi al reset
}

/**
 * Rate limiter sincrono (in-memory fallback).
 * Per il percorso Redis (async), usa `rateLimitAsync`.
 */
export function rateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): RateLimitResult {
  cleanup();

  const now = Date.now();
  const entry = hits.get(key);

  if (!entry || entry.resetAt < now) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, resetIn: windowMs };
  }

  entry.count++;

  if (entry.count > maxRequests) {
    return { allowed: false, remaining: 0, resetIn: entry.resetAt - now };
  }

  return { allowed: true, remaining: maxRequests - entry.count, resetIn: entry.resetAt - now };
}

/**
 * Rate limiter asincrono — Redis-backed con fallback in-memory.
 *
 * Algoritmo sliding window basato su Redis INCR + EXPIRE:
 *   1. INCR key — atomico, incrementa contatore
 *   2. Se è il primo incremento (count === 1), imposta EXPIRE
 *   3. Se count > maxRequests → rate limited
 *
 * Se Redis non è disponibile, usa il fallback in-memory sincrono.
 */
export async function rateLimitAsync(
  key: string,
  maxRequests: number,
  windowMs: number
): Promise<RateLimitResult> {
  const r = getRedis();
  if (!r) {
    // Fail-closed in production: degrade to per-instance `hits` Map would
    // be BYPASSABLE on Vercel multi-instance (each cold start sees a fresh
    // in-memory Map → token-consuming clients rotate through instances).
    // Refuse the rate-limit check entirely (503) so the request 500’s via
    // the wrapper's catch path — better than silent degradation. In dev
    // we keep the warn + degrade so single-machine dev iteration is smooth.
    if (process.env.NODE_ENV === "production") {
      throw new AppError(
        "Rate-limit Redis backend not configured; refusing to degrade to per-instance in-memory (would be bypassable on Vercel multi-instance)",
        { statusCode: 503, code: "RATE_LIMIT_NO_BACKEND" }
      );
    }
    return rateLimit(key, maxRequests, windowMs);
  }

  const redisKey = `ratelimit:${key}`;
  const windowSeconds = Math.ceil(windowMs / 1000);

  try {
    const count = await r.incr(redisKey);

    // Imposta EXPIRE solo al primo incremento. Se lo chiamassimo ad ogni
    // richiesta il timer verrebbe resettato continuamente e un utente/bot
    // che mantiene traffico costante rimarrebbe bloccato per sempre.
    if (count === 1) {
      await r.expire(redisKey, windowSeconds);
    }

    // Recupera il TTL per calcolare resetIn
    const ttl = await r.ttl(redisKey);
    const resetIn = ttl > 0 ? ttl * 1000 : windowMs;

    if (count > maxRequests) {
      return { allowed: false, remaining: 0, resetIn };
    }

    return { allowed: true, remaining: maxRequests - count, resetIn };
  } catch {
    // Redis error → fallback in-memory
    return rateLimit(key, maxRequests, windowMs);
  }
}

// ─── Wrapper per Next.js Route Handlers ────────────────────
type RouteHandler<TArgs extends unknown[] = unknown[]> = (
  req: NextRequest,
  ...args: TArgs
) => Promise<Response>;

export function withRateLimit<TArgs extends unknown[]>(
  handler: RouteHandler<TArgs>,
  tier: RateTier = "PUBLIC",
  keyFn?: (req: NextRequest) => string
): RouteHandler<TArgs> {
  const { max, windowMs } = RATE_TIERS[tier];

  return async (req: NextRequest, ...args: TArgs) => {
    // Determina la chiave: IP + eventuale userId
    const identifier = keyFn
      ? keyFn(req)
      : `${tier}:${req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown"}`;

    // Usa Redis-backed async rate limiting quando disponibile.
    // CRITICAL: catch AppError (es. RATE_LIMIT_NO_BACKEND in produzione) e
    // mappalo a NextResponse con lo statusCode dell'AppError (503). Senza
    // questo catch, AppError propagherebbe al Next.js error boundary
    // restituendo 500 generico — il client vedrebbe 500 invece del 503
    // semanticamente corretto per "Service Unavailable: rate-limit backend
    // missing".
    let result: RateLimitResult;
    try {
      result = await rateLimitAsync(identifier, max, windowMs);
    } catch (error) {
      // AppError path propagates inner message + AppError.statusCode (e.g.
      // 503 per RATE_LIMIT_NO_BACKEND) per `apiErrorResponse` in
      // `@/lib/errors.ts`; fallbackMessage arg ignored for AppError, so no
      // need to pass it.
      return apiErrorResponse(error);
    }

    if (!result.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Try again later." },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil(result.resetIn / 1000)),
            "X-RateLimit-Limit": String(max),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(Math.ceil((Date.now() + result.resetIn) / 1000)),
          },
        }
      );
    }

    const response = await handler(req, ...args);

    // Aggiungi header di rate limiting alla risposta
    const headers = new Headers(response.headers);
    headers.set("X-RateLimit-Limit", String(max));
    headers.set("X-RateLimit-Remaining", String(result.remaining));
    headers.set("X-RateLimit-Reset", String(Math.ceil((Date.now() + result.resetIn) / 1000)));

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}

/**
 * Re-export per retrocompatibilità — rateLimit sincrono
 * (usato internamente come fallback in-memory).
 */

// ─── Compatibilità legacy ──────────────────────────────────
export function rateLimitResponse(resetIn: number) {
  return new Response(
    JSON.stringify({ error: "Too many requests. Try again later." }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(Math.ceil(resetIn / 1000)),
      },
    }
  );
}
