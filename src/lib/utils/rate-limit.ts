/**
 * Rate limiter a finestra scorrevole (sliding window) in-memory.
 *
 * Design:
 *   - In-memory Map (pronto per essere sostituito da Redis/Upstash)
 *   - Finestra scorrevole: il contatore resetta dopo windowMs dall'ultimo reset
 *   - Cleanup automatico ogni 60 secondi
 *
 * Tiers predefiniti:
 *   - PUBLIC:   100 req/min  (API pubbliche: prodotti, config, analytics)
 *   - AUTH:      30 req/min  (endpoint di autenticazione/sensibili)
 *   - MESSAGES:  10 req/min  (invio DM)
 */

import { NextRequest, NextResponse } from "next/server";

// ─── Tiers ──────────────────────────────────────────────────
const MINUTE = 60_000;

export const RATE_TIERS = {
  /** API pubbliche: prodotti, config, analytics, profili */
  PUBLIC: { max: 100, windowMs: MINUTE },
  /** Endpoint sensibili: checkout, profilo, auth */
  AUTH: { max: 30, windowMs: MINUTE },
  /** Invio messaggi DM */
  MESSAGES: { max: 10, windowMs: MINUTE },
} as const;

export type RateTier = keyof typeof RATE_TIERS;

// ─── Store in-memory ───────────────────────────────────────
const hits = new Map<string, { count: number; resetAt: number }>();

// Cleanup periodico per evitare memory leak
let lastCleanup = Date.now();
function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < 60_000) return; // max 1 cleanup al minuto
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

// ─── Wrapper per Next.js Route Handlers ────────────────────
type RouteHandler = (req: NextRequest, ...args: unknown[]) => Promise<Response>;

export function withRateLimit(
  handler: RouteHandler,
  tier: RateTier = "PUBLIC",
  keyFn?: (req: NextRequest) => string
): RouteHandler {
  const { max, windowMs } = RATE_TIERS[tier];

  return async (req: NextRequest, ...args: unknown[]) => {
    // Determina la chiave: IP + eventuale userId
    const identifier = keyFn
      ? keyFn(req)
      : `${tier}:${req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown"}`;

    const result = rateLimit(identifier, max, windowMs);

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
