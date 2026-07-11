/**
 * logging/constants.ts — Shared constants for the error logging system.
 *
 * Used by BOTH:
 *   - src/lib/logging/server-error-sink.ts (direct Redis writes from
 *     Next.js instrumentation hook)
 *   - src/app/api/log-error/route.ts (POST endpoint for client errors
 *     coming from useLogError)
 *
 * If you tune any limit here, BOTH paths pick it up automatically.
 * Before shipping a change, re-test the rate-limit and dedup paths:
 *   1. Lower GLOBAL_CAP_PER_MINUTE to 5
 *   2. Trigger 10 unique errors from the same page
 *   3. Confirm only 5 land in Redis (the rest get 204 from /api/log-error
 *      with no key written; check via `redis-cli KEYS 'errlog:*'`)
 *   4. Restore to 50
 */

/**
 * Maximum number of UNIQUE error digests to write to Redis per minute.
 * Counter lives at `errlog:counter:global` with a 60s sliding-window TTL.
 * Protects Upstash quota from wide error storms.
 */
export const GLOBAL_CAP_PER_MINUTE = 50;

/**
 * Per-digest dedup window in seconds.
 * A digest that fired within this window is dropped on subsequent attempts
 * (lock key: `errlog:lock:<digest>`). Prevents a single hot error from
 * burning the global cap.
 */
export const DEDUP_WINDOW_SECONDS = 60;

/**
 * How long a successfully-written error log persists in Redis.
 * 7 days matches Vercel's runtime log retention for the hobby tier.
 */
export const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60;
