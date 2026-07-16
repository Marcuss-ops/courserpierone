/**
 * src/domains/creator-ops/read-models/content.ts
 *
 * Phase 3 Step 3 — `content` read-model use case (pure).
 *
 * Pure function: takes a creator + injected repository, returns
 * ContentView. Zero `@prisma/client` imports — Domain layer stays
 * testable without a DB.
 *
 * Aggregation: 4 port-driven queries (products + drafts + scheduled + recent)
 * + AppJS Map dedupe => ContentView.
 *
 * ADR-0018 §b: `prismaContentRepository` is NOT re-exported here
 * (mirrors audience.ts + inbox.ts pattern). Consumers wire the adapter
 * via direct import from "./prisma-content-repository".
 */

import type {
  BuildContentInput,
  ContentItem,
  ContentRepository,
  ContentView,
  RawContentItem,
} from "./content-types";

export {
  type BuildContentInput,
  type ContentItem,
  type ContentRepository,
  type ContentView,
  type MinimalProduct,
  type RawContentItem,
} from "./content-types";

export const DEFAULT_SCHEDULED_WINDOW_DAYS = 14;
export const DEFAULT_RECENT_LIMIT = 10;
export const DEFAULT_DRAFTS_LIMIT = 20;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const EMPTY_CONTENT: ContentView = Object.freeze({
  totals: { drafts: 0, scheduled: 0, recent: 0 },
  drafts: [],
  scheduled: [],
  recent: [],
});

export interface BuildContentDeps {
  repo: ContentRepository;
}

function normalizeDays(days: number | undefined, fallback: number): number {
  if (typeof days !== "number" || !Number.isFinite(days) || days <= 0) return fallback;
  return Math.floor(days);
}

function normalizeLimit(limit: number | undefined, fallback: number): number {
  if (typeof limit !== "number" || !Number.isFinite(limit) || limit <= 0) return fallback;
  return Math.floor(limit);
}

function toContentItem(raw: RawContentItem): ContentItem {
  return {
    id: raw.id,
    kind: raw.kind,
    status: raw.status,
    title: raw.title,
    productId: raw.productId,
    productSlug: raw.productSlug,
    createdAt: raw.createdAt,
    scheduledAt: raw.scheduledAt,
    publishedAt: raw.publishedAt,
  };
}

export async function buildContent(
  input: BuildContentInput,
  deps: BuildContentDeps,
): Promise<ContentView> {
  if (!input.creatorId) return EMPTY_CONTENT;

  const now = input.now ?? new Date();
  const windowDays = normalizeDays(input.scheduledWindowDays, DEFAULT_SCHEDULED_WINDOW_DAYS);
  const recentLimit = normalizeLimit(input.recentLimit, DEFAULT_RECENT_LIMIT);
  const draftsLimit = DEFAULT_DRAFTS_LIMIT;

  const products = await deps.repo.fetchOwnedProducts(input.creatorId);
  if (products.length === 0) return EMPTY_CONTENT;

  const productIds = products.map((p) => p.id);

  const windowStart = new Date(now.getTime() - windowDays * MS_PER_DAY);

  const [draftsRaw, scheduledRaw, recentRaw] = await Promise.all([
    deps.repo.fetchDrafts(productIds, draftsLimit),
    deps.repo.fetchScheduled(productIds, windowStart, draftsLimit),
    deps.repo.fetchRecent(productIds, recentLimit),
  ]);

  const draftsMap = new Map<string, ContentItem>();
  for (const r of draftsRaw) if (!draftsMap.has(r.id)) draftsMap.set(r.id, toContentItem(r));

  const scheduledMap = new Map<string, ContentItem>();
  for (const r of scheduledRaw) if (!scheduledMap.has(r.id)) scheduledMap.set(r.id, toContentItem(r));

  const recentItems: ContentItem[] = [];
  for (const r of recentRaw) {
    if (recentItems.some((i) => i.id === r.id)) continue;
    recentItems.push(toContentItem(r));
  }

  return {
    totals: {
      drafts: draftsMap.size,
      scheduled: scheduledMap.size,
      recent: recentItems.length,
    },
    drafts: Array.from(draftsMap.values()),
    scheduled: Array.from(scheduledMap.values()).sort(
      (a, b) => (a.scheduledAt?.getTime() ?? 0) - (b.scheduledAt?.getTime() ?? 0),
    ),
    recent: recentItems,
  };
}
