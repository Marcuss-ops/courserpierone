/**
 * src/lib/learning/history-types.ts
 *
 * Phase 2 — History (My Courses) types + port.
 *
 * History is the canonical read-model of every product a user can
 * access, with AccessGrant.status='active' as the single source of
 * truth. Unlike continue-watching (in-progress only) and watchlist
 * (saved-for-later), history surfaces ALL active grants: free
 * enrollments, paid orders, admin grants and bundles.
 *
 * Architecture (per ADR-0016 §1 dep direction):
 *   - NO Prisma import here. Domain layer MUST NOT depend on Adapter.
 *   - The port interface (`HistoryRepository`) declares the adapter
 *     contract; the use case and tests build stubs against it.
 */

import type { AccessGrantSourceType } from "./watchlist-types";

export const DEFAULT_HISTORY_LIMIT = 50;
export const MAX_HISTORY_LIMIT = 100;

/**
 * One history entry = one active AccessGrant for a product.
 */
export interface HistoryItem {
  productId: string;
  slug: string;
  title: string;
  coverUrl: string | null;
  /** Source of the grant (free_enrollment, order, admin, bundle, watchlist). */
  sourceType: AccessGrantSourceType;
  /** When the grant was created or last reactivated. */
  grantedAt: string;
}

export interface BuildHistoryInput {
  /** User.id (Postgres cuid). Falsy → empty result. */
  userId: string;
  /** Optional locale for ProductTranslation lookup. */
  locale?: string;
  /** Max items returned. Default = 50, max = 100. */
  limit?: number;
}

export interface BuildHistoryResult {
  items: HistoryItem[];
  count: number;
}

// ─── Port contract ────────────────────────────────────────────────────

export interface HistoryRepository {
  listActiveGrants(input: BuildHistoryInput): Promise<HistoryItem[]>;
}
