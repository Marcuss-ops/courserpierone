/**
 * src/domains/creator-ops/read-models/content-types.ts
 *
 * Phase 3 Creator Studio — Step 3 of 4 read-models (Content area).
 *
 * ONE canonical read-model for "what is in the creator's content
 * pipeline?". Domain layer (ADR-0018 §b/c): types + Port only. The
 * Prisma adapter lives in the sibling file `prisma-content-repository.ts`
 * and the pure use case lives in `./content.ts`.
 *
 * Domain definitions (per master-plan §3 Content spec):
 *   - drafts      = status='draft' (lessons + posts + resources)
 *   - scheduled   = status IN ('scheduled','pending') AND scheduledAt within window
 *   - recent      = status='published' ORDER BY publishedAt DESC
 *
 * 0 N+1: 4 bounded queries (drafts, scheduled, recent, products). No
 * AppJS per-row. Stubbed in tests via mkStubContentRepo() in content.test.ts.
 */

import type { ContentKind } from "@/domains/catalog/content-type-registry";

// ─── Output shape ─────────────────────────────────────────────

export interface ContentTotals {
  drafts: number;
  scheduled: number;
  recent: number;
}

export interface ContentItem {
  id: string;
  kind: ContentKind;
  status: string;
  title: string;
  productId: string;
  productSlug: string;
  createdAt: Date;
  scheduledAt: Date | null;
  publishedAt: Date | null;
}

export interface ContentView {
  totals: ContentTotals;
  drafts: ContentItem[];
  scheduled: ContentItem[];
  recent: ContentItem[];
}

// ─── Input shape ──────────────────────────────────────────────

export interface BuildContentInput {
  /** Creator's User.id (REQUIRED — defensive empty returns empty view). */
  creatorId: string;
  /** Scheduled bucket window in days. Default 14. */
  scheduledWindowDays?: number;
  /** Recent feed take limit. Default 10. */
  recentLimit?: number;
  /** Injectable "now" for test reproducibility. Default = new Date(). */
  now?: Date;
}

// ─── Port contract (adapter boundary) ─────────────────────────

export interface MinimalProduct {
  id: string;
  slug: string;
}

export interface RawContentItem {
  id: string;
  kind: ContentKind;
  status: string;
  title: string;
  productId: string;
  productSlug: string;
  createdAt: Date;
  scheduledAt: Date | null;
  publishedAt: Date | null;
}

/**
 * Adapter port (4 bounded queries per content view). Stubbed in tests.
 * Mirrors audience.ts and inbox.ts pattern: port seam = test seam.
 */
export interface ContentRepository {
  fetchOwnedProducts(creatorId: string): Promise<MinimalProduct[]>;
  fetchDrafts(
    productIds: readonly string[],
    take: number,
  ): Promise<RawContentItem[]>;
  fetchScheduled(
    productIds: readonly string[],
    windowStart: Date,
    take: number,
  ): Promise<RawContentItem[]>;
  fetchRecent(
    productIds: readonly string[],
    take: number,
  ): Promise<RawContentItem[]>;
}
