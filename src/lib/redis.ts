/**
 * redis.ts — Client Redis dual-mode: Upstash REST (produzione) + ioredis (locale).
 *
 * Priorità connessione:
 *   1. UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN → Upstash REST API
 *   2. REDIS_URL (es. redis://localhost:6379) → ioredis (TCP diretto)
 *   3. Nessuna config → graceful fallback (no-op, app funziona senza cache)
 *
 * Per sviluppo locale con docker-compose:
 *   docker compose up -d redis
 *   REDIS_URL=redis://localhost:6379
 *
 * Esporta `getRedis()` per uso condiviso tra i moduli:
 *   - Caching (cacheGet, cacheSet, cacheDel, cacheWrap)
 *   - Rate limiting distribuito (rate-limit.ts)
 *   - Live presence (presence.ts)
 *   - Health check (/api/health)
 */

import { Redis as UpstashRedis } from "@upstash/redis";
import IORedis from "ioredis";

// ─── Adapter ioredis → Upstash API ──────────────────────────
// Wrapper sottile che espone la stessa API di @upstash/redis
// per i metodi che usiamo: get, set, del, incr, expire, ttl, mget, ping.

interface RedisAdapter {
  get<T = string>(key: string): Promise<T | null>;
  set(key: string, value: string | number, opts?: { ex?: number }): Promise<"OK" | null>;
  del(key: string): Promise<number>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  ttl(key: string): Promise<number>;
  mget(...keys: string[]): Promise<(string | null)[]>;
  ping(): Promise<string>;
  pipeline(): {
    get(key: string): void;
    exec(): Promise<(string | null)[]>;
  };
}

function createIORedisAdapter(redisUrl: string): RedisAdapter | null {
  try {
    const io = new IORedis(redisUrl, {
      maxRetriesPerRequest: 1,
      lazyConnect: false,
      connectTimeout: 3000,
    });

    // Verifica connessione immediata
    io.on("error", (err) => {
      console.error("[redis] ioredis error:", err.message);
    });

    return {
      async get<T = string>(key: string): Promise<T | null> {
        const val = await io.get(key);
        return val as T | null;
      },
      async set(key: string, value: string | number, opts?: { ex?: number }): Promise<"OK" | null> {
        if (typeof value === "number") value = String(value);
        if (opts?.ex) {
          return io.set(key, value, "EX", opts.ex);
        }
        return io.set(key, value);
      },
      async del(key: string): Promise<number> {
        return io.del(key);
      },
      async incr(key: string): Promise<number> {
        return io.incr(key);
      },
      async expire(key: string, seconds: number): Promise<number> {
        return io.expire(key, seconds);
      },
      async ttl(key: string): Promise<number> {
        return io.ttl(key);
      },
      async mget(...keys: string[]): Promise<(string | null)[]> {
        const vals = await io.mget(...keys);
        return vals as (string | null)[];
      },
      async ping(): Promise<string> {
        return io.ping();
      },
      pipeline() {
        const pipe = io.pipeline();
        return {
          get(key: string) {
            pipe.get(key);
          },
          async exec(): Promise<(string | null)[]> {
            const results = await pipe.exec();
            if (!results) return [];
            return results.map(([err, val]) => (err ? null : (val as string | null)));
          },
        };
      },
    };
  } catch (err) {
    console.error("[redis] Failed to create ioredis adapter:", err);
    return null;
  }
}

export type RedisClient = UpstashRedis | RedisAdapter;

let _redis: RedisClient | null | undefined = undefined;

/**
 * Restituisce l'istanza Redis condivisa (lazy singleton).
 * Priorità: Upstash REST (via UPSTASH_* o KV_REST_API_*) → ioredis locale → null (fallback).
 * Tutti i moduli devono usare questa funzione — non crearne di proprie.
 */
export function getRedis(): RedisClient | null {
  if (_redis !== undefined) return _redis;

  // 1. Upstash REST (produzione).
  // Supportiamo DUE naming convention perché il progetto può essere
  // provisionato in due modi:
  //   - Vercel Marketplace (storage tab → Add Upstash) → KV_REST_API_*
  //     [predefinito per i nuovi deploy]
  //   - Upstash diretto (console.upstash.com) → UPSTASH_REDIS_REST_*
  //     [legacy / per chi preferisce non passare per Vercel]
  // I valori sono interscambiabili: stesse REST API, stessi endpoint, stessi token.
  // KV_* ha priorità perché è la convenzione moderna di Vercel.
  const upstashUrl =
    process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

  if (upstashUrl && upstashToken) {
    _redis = new UpstashRedis({ url: upstashUrl, token: upstashToken });
    console.log("[redis] Connected to Upstash");
    return _redis;
  }

  // 2. ioredis locale (sviluppo con docker-compose)
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    if (process.env.NODE_ENV === "production") {
      console.warn(
        "[redis] REDIS_URL detected → ioredis fallback. " +
        "This is unreliable on serverless (Vercel/Lambda) — use " +
        "Upstash REST API (KV_REST_API_URL + KV_REST_API_TOKEN) instead."
      );
    }
    const adapter = createIORedisAdapter(redisUrl);
    if (adapter) {
      _redis = adapter;
      console.log(`[redis] Connected to local Redis (${redisUrl.replace(/\/\/.*@/, "//***@")})`);
      return _redis;
    }
  }

  // 3. Nessuna configurazione — graceful fallback
  _redis = null;
  console.log("[redis] Redis not configured — cache, presence, and distributed rate limiting disabled");
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
