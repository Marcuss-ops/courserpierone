/**
 * redis.ts — Client Redis serverless (Upstash) con graceful fallback.
 *
 * Usa le variabili d'ambiente automaticamente:
 *   UPSTASH_REDIS_REST_URL  — URL REST dell'istanza Upstash
 *   UPSTASH_REDIS_REST_TOKEN — Token di autenticazione
 *
 * Se le variabili non sono configurate (es. in dev locale), tutte le
 * operazioni Redis sono no-op — l'app funziona normalmente senza cache.
 *
 * Esporta `getRedis()` per uso condiviso tra i moduli:
 *   - Caching (cacheGet, cacheSet, cacheDel, cacheWrap)
 *   - Rate limiting distribuito (rate-limit.ts)
 *   - Live presence (presence.ts)
 *   - Health check (/api/health)
 */

import { Redis } from "@upstash/redis";

let _redis: Redis | null | undefined = undefined;

/**
 * Restituisce l'istanza Redis condivisa (lazy singleton).
 * Tutti i moduli devono usare questa funzione — non crearne di proprie.
 */
export function getRedis(): Redis | null {
  if (_redis !== undefined) return _redis;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (url && token) {
    _redis = new Redis({ url, token });
    console.log("[redis] Connected to Upstash");
  } else {
    _redis = null;
    console.log("[redis] Upstash not configured — cache disabled");
  }

  return _redis;
}

const FIVE_MINUTES = 5 * 60; // secondi

/**
 * Legge un valore dalla cache Redis.
 * Restituisce null se Redis non è configurato o la chiave non esiste.
 */
export async function cacheGet<T = unknown>(key: string): Promise<T | null> {
  const r = getRedis();
  if (!r) return null;
  try {
    const raw = await r.get<string>(key);
    if (raw === null || raw === undefined) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Scrive un valore nella cache Redis con TTL (default 5 minuti).
 * Se Redis non è configurato, l'operazione è no-op.
 */
export async function cacheSet(key: string, value: unknown, ttlSeconds: number = FIVE_MINUTES): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    await r.set(key, JSON.stringify(value), { ex: ttlSeconds });
  } catch {
    // Silently fail — the app works without cache
  }
}

/**
 * Elimina una chiave dalla cache Redis.
 */
export async function cacheDel(key: string): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    await r.del(key);
  } catch {
    // Silently fail
  }
}

/**
 * Helper: avvolge una funzione asincrona con cache Redis read-through.
 *
 * - Se la cache ha un valore per `key`, lo restituisce subito.
 * - Altrimenti chiama `fn()`, salva il risultato in cache per `ttlSeconds`,
 *   e lo restituisce.
 * - Se Redis non è configurato, chiama `fn()` direttamente (no-op cache).
 */
export async function cacheWrap<T>(
  key: string,
  fn: () => Promise<T>,
  ttlSeconds: number = FIVE_MINUTES
): Promise<T> {
  const cached = await cacheGet<T>(key);
  if (cached !== null) return cached;

  const result = await fn();
  await cacheSet(key, result, ttlSeconds);
  return result;
}
