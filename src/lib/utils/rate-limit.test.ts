/**
 * rate-limit.test.ts — fail-closed in production when Redis backend missing.
 *
 * Lock-in dei due invariants del commit `fix(rate-limit): fail-closed in
 * production when Redis missing`:
 *
 *   1. NODE_ENV=production && getRedis() === null
 *      → rateLimitAsync throws `AppError` with code `RATE_LIMIT_NO_BACKEND`.
 *      Rationale: degrading to per-instance `hits` Map is BYPASSABLE on
 *      Vercel multi-instance (each cold start sees a fresh Map → token-
 *      consuming clients rotate through instances).
 *
 *   2. NODE_ENV=development (or unset) && getRedis() === null
 *      → rateLimitAsync falls through to in-memory `rateLimit()` (single-
 *      machine dev iteration is OK without Redis).
 *
 * `withRateLimit` wrapper is NOT tested here — its job is to extract the
 * rate-limit result and set X-RateLimit-* headers. Suite elsewhere covers
 * Redis-backed happy path. This test focuses on the fail-closed contract.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AppError } from "@/lib/errors";

// ─── vi.hoisted: shared mock reference safe under TS-hoisting ────────
//
// `const mockGetRedis = vi.fn()` placed at module scope would run AFTER
// the auto-hoisted `vi.mock("@/lib/redis", () => ({ getRedis: mockGetRedis }))`
// factory (vitest hoists vi.mock to top of file) — TDZ error at boot.
// `vi.hoisted()` runs BEFORE vi.mock factories and gives us a hoisted
// registry the mock factory and the test use without TDZ.
//
const { mockGetRedis } = vi.hoisted(() => ({
  mockGetRedis: vi.fn(),
}));

vi.mock("@/lib/redis", () => ({
  getRedis: mockGetRedis,
}));

// ─── Imports under test (post-mock) ──────────────────────────

import { rateLimitAsync } from "./rate-limit";

// ─── Setup ──────────────────────────────────────────────────

beforeEach(() => {
  // CRITICAL: re-apply default mock after each test's reset cycle.
  mockGetRedis.mockReset();
  mockGetRedis.mockReturnValue(null); // always null — Redis backend missing
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// Use unique keys per test to avoid module-level `hits` Map cross-test
// contamination. (`hits` is module-private in rate-limit.ts and can't be
// reset from outside, so isolation via unique keys is the only path.)

// ─── Tests ───────────────────────────────────────────────────

describe("rateLimitAsync — fail-closed in production", () => {
  // ── (1) Production + no Redis → throw AppError(RATE_LIMIT_NO_BACKEND) ──
  it("(1) throws AppError(RATE_LIMIT_NO_BACKEND) when NODE_ENV=production and getRedis returns null", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const err = await rateLimitAsync("test:prod:1", 10, 60_000).catch(
      (e: unknown) => e
    );
    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({
      code: "RATE_LIMIT_NO_BACKEND",
      statusCode: 503,
    });
  });

  // ── (2) Dev + no Redis → degrades to in-memory rateLimit ──
  it("(2) degrades to in-memory rateLimit (allowed=true) when NODE_ENV=development and getRedis returns null", async () => {
    vi.stubEnv("NODE_ENV", "development");

    const result = await rateLimitAsync("test:dev:1", 5, 60_000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4); // 5 max - 1 used
    expect(result.resetIn).toBe(60_000);
  });
});
