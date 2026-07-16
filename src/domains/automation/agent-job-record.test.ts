/**
 * src/domains/automation/agent-job-record.test.ts
 *
 * Unit tests for AgentJobRecord + deriveIdempotencyKey.
 *
 * Coverage:
 *   - deriveIdempotencyKey: deterministic (same input → same key)
 *   - deriveIdempotencyKey: different inputs → different keys
 *   - stableStringify (private): key sorting, nested objects, arrays,
 *     primitives, edge cases (NaN, undefined, null)
 *   - isJobTerminal: yes for published/permanent_failed/cancelled;
 *     no for everything else
 *
 * No live clock, no DB. Pure-function tests.
 */

import { describe, expect, it } from "vitest";

import {
  deriveIdempotencyKey,
  isJobTerminal,
} from "./agent-job-record";

// ─── deriveIdempotencyKey ────────────────────────────────────────────

describe("deriveIdempotencyKey — determinism", () => {
  it("returns the same key for identical inputs (same agent + creator + input)", () => {
    const input = {
      agentId: "post-generator-it",
      creatorId: "creator_123",
      jobInput: { topic: "AI education", lang: "it" },
    };
    const k1 = deriveIdempotencyKey(input);
    const k2 = deriveIdempotencyKey(input);
    expect(k1).toBe(k2);
  });

  it("returns the same key even when input object keys are reordered", () => {
    const k1 = deriveIdempotencyKey({
      agentId: "a1",
      creatorId: "c1",
      jobInput: { x: 1, y: 2, z: 3 },
    });
    const k2 = deriveIdempotencyKey({
      agentId: "a1",
      creatorId: "c1",
      jobInput: { z: 3, y: 2, x: 1 },
    });
    expect(k1).toBe(k2);
  });

  it("returns the same key for nested objects with reordered keys", () => {
    const k1 = deriveIdempotencyKey({
      agentId: "a1",
      creatorId: "c1",
      jobInput: { outer: { a: 1, b: 2 }, list: [1, 2, 3] },
    });
    const k2 = deriveIdempotencyKey({
      agentId: "a1",
      creatorId: "c1",
      jobInput: { list: [1, 2, 3], outer: { b: 2, a: 1 } },
    });
    expect(k1).toBe(k2);
  });
});

describe("deriveIdempotencyKey — uniqueness", () => {
  it("returns DIFFERENT keys for different agentId", () => {
    const k1 = deriveIdempotencyKey({ agentId: "a1", creatorId: "c1", jobInput: { x: 1 } });
    const k2 = deriveIdempotencyKey({ agentId: "a2", creatorId: "c1", jobInput: { x: 1 } });
    expect(k1).not.toBe(k2);
  });

  it("returns DIFFERENT keys for different creatorId", () => {
    const k1 = deriveIdempotencyKey({ agentId: "a1", creatorId: "c1", jobInput: { x: 1 } });
    const k2 = deriveIdempotencyKey({ agentId: "a1", creatorId: "c2", jobInput: { x: 1 } });
    expect(k1).not.toBe(k2);
  });

  it("returns DIFFERENT keys for different jobInput", () => {
    const k1 = deriveIdempotencyKey({ agentId: "a1", creatorId: "c1", jobInput: { x: 1 } });
    const k2 = deriveIdempotencyKey({ agentId: "a1", creatorId: "c1", jobInput: { x: 2 } });
    expect(k1).not.toBe(k2);
  });

  it("returns a hex-formatted id prefixed with 'idem_'", () => {
    const k = deriveIdempotencyKey({
      agentId: "a1",
      creatorId: "c1",
      jobInput: { x: 1 },
    });
    expect(k).toMatch(/^idem_[0-9a-f]{8}$/);
  });
});

describe("deriveIdempotencyKey — input edge cases", () => {
  it("treats null and undefined fields consistently", () => {
    const k1 = deriveIdempotencyKey({
      agentId: "a1",
      creatorId: "c1",
      jobInput: { x: null },
    });
    const k2 = deriveIdempotencyKey({
      agentId: "a1",
      creatorId: "c1",
      jobInput: { x: undefined },
    });
    // Both serialize to "null" — should match
    expect(k1).toBe(k2);
  });

  it("handles empty object input", () => {
    const k = deriveIdempotencyKey({
      agentId: "a1",
      creatorId: "c1",
      jobInput: {},
    });
    expect(k).toMatch(/^idem_[0-9a-f]{8}$/);
  });

  it("handles array input", () => {
    const k = deriveIdempotencyKey({
      agentId: "a1",
      creatorId: "c1",
      jobInput: [1, 2, 3],
    });
    expect(k).toMatch(/^idem_[0-9a-f]{8}$/);
  });

  it("handles primitive input (string)", () => {
    const k = deriveIdempotencyKey({
      agentId: "a1",
      creatorId: "c1",
      jobInput: "raw string input",
    });
    expect(k).toMatch(/^idem_[0-9a-f]{8}$/);
  });

  it("treats NaN and Infinity as null (defensive)", () => {
    // Both should hash the same since stableStringify coerces them
    const k1 = deriveIdempotencyKey({
      agentId: "a1",
      creatorId: "c1",
      jobInput: { v: NaN },
    });
    const k2 = deriveIdempotencyKey({
      agentId: "a1",
      creatorId: "c1",
      jobInput: { v: Infinity },
    });
    expect(k1).toBe(k2);
  });

  it("handles deeply nested input without crashing", () => {
    const nested = {
      level1: {
        level2: {
          level3: {
            value: "deep",
            arr: [1, { x: 2, y: [3, 4] }, null, true],
          },
        },
      },
    };
    const k = deriveIdempotencyKey({
      agentId: "a1",
      creatorId: "c1",
      jobInput: nested,
    });
    expect(k).toMatch(/^idem_[0-9a-f]{8}$/);
  });
});

// ─── isJobTerminal ──────────────────────────────────────────────────

describe("isJobTerminal", () => {
  it("returns true for published", () => {
    expect(isJobTerminal({ status: "published" })).toBe(true);
  });

  it("returns true for permanent_failed", () => {
    expect(isJobTerminal({ status: "permanent_failed" })).toBe(true);
  });

  it("returns true for cancelled", () => {
    expect(isJobTerminal({ status: "cancelled" })).toBe(true);
  });

  it("returns false for retryable_failed (it can transition back to running)", () => {
    expect(isJobTerminal({ status: "retryable_failed" })).toBe(false);
  });

  it("returns false for all non-terminal states", () => {
    const nonTerminal = [
      "queued",
      "running",
      "awaiting_approval",
      "approved",
      "publishing",
    ] as const;
    for (const status of nonTerminal) {
      expect(isJobTerminal({ status })).toBe(false);
    }
  });
});