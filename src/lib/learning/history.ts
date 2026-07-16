/**
 * src/lib/learning/history.ts
 *
 * Phase 2 — History (My Courses) use case.
 *
 * Returns every product the user has active access to, with
 * AccessGrant.status='active' as the single source of truth.
 *
 * Architecture (per ADR-0016 §1 dep direction):
 *   - This file imports NOTHING from adapters. Only types + port.
 *   - The Prisma adapter lives in `prisma-history-repository.ts`.
 *   - Tests stub the port directly.
 */

import {
  DEFAULT_HISTORY_LIMIT,
  MAX_HISTORY_LIMIT,
  type BuildHistoryInput,
  type BuildHistoryResult,
  type HistoryRepository,
} from "./history-types";

export {
  DEFAULT_HISTORY_LIMIT,
  MAX_HISTORY_LIMIT,
  type BuildHistoryInput,
  type BuildHistoryResult,
  type HistoryItem,
  type HistoryRepository,
} from "./history-types";

export interface BuildHistoryDeps {
  repo: HistoryRepository;
}

/**
 * Normalize a caller-supplied limit into [1, MAX_HISTORY_LIMIT].
 */
export function normalizeHistoryLimit(limit: number | undefined): number {
  if (typeof limit !== "number" || !Number.isFinite(limit) || limit <= 0) {
    return DEFAULT_HISTORY_LIMIT;
  }
  return Math.min(MAX_HISTORY_LIMIT, Math.floor(limit));
}

/**
 * Build the user's history (all active grants).
 *
 * Behavior:
 *   - Falsy userId → empty result.
 *   - Limit clamped to [1, MAX_HISTORY_LIMIT].
 *   - Items ordered by grantedAt DESC (most recent grant first).
 *   - AccessGrant is the SSOT: only rows with status='active'.
 */
export async function buildHistory(
  input: BuildHistoryInput,
  deps: BuildHistoryDeps,
): Promise<BuildHistoryResult> {
  if (!input.userId) {
    return { items: [], count: 0 };
  }

  const limit = normalizeHistoryLimit(input.limit);
  const items = await deps.repo.listActiveGrants({
    userId: input.userId,
    locale: input.locale,
    limit,
  });

  return { items, count: items.length };
}
