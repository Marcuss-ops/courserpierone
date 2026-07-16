/**
 * src/domains/discovery/feed/feed-source-registry.ts
 *
 * Feed Source Registry — single source of truth for which feed
 * sources the platform emits (Courssy).
 *
 * Categories (per `src/domains/discovery/feed/feed-types.ts` FeedItem
 * discriminated union):
 *   - continue_learning  : in-progress lessons for owned products
 *   - lesson            : recent lessons from followed creators
 *   - community_post    : posts from followed creators (V2 reserved)
 *   - free_course       : newly-published free courses (V2 reserved)
 *   - premium_course    : upsell suggestions (V2 reserved)
 *   - creator_update    : creator-curated updates from followed creators (V2 reserved)
 *
 * Pattern: module-private mutable Map + public ReadonlyMap view +
 * `registerFeedSource()` mutation surface. Mirrors the conventions of
 * `src/domains/automation/agent-registry.ts` and
 * `src/domains/discovery/policies/policy-registry.ts`:
 *   - Read via `FEED_SOURCE_REGISTRY.get(id) / .has() / .values()`
 *   - Mutate via `registerFeedSource()` only
 *   - Hot-add supported (rare — most sources registered at startup)
 *
 * Wiring (downstream): the buildFeed UseCase receives a FeedRepository
 * port implementation; sources registered here are resolved at feed
 * compose-time. Each source&rsquo;s `fetch(ctx, repo)` runs sequentially
 * inside a paginated cursor pipeline (per ADR-0016 §Discovery cap of 4-6
 * aggregate queries per request).
 *
 * V2 reserved note (feed-types.ts vs registry kinds):
 *   CONTENT_KINDS (`src/domains/catalog/content-type-registry.ts`,
 *   feed item kind taxonomy at the string-identity level) is a
 *   separate axis from this registry&rsquo;s FeedSourceKind axis. They are
 *   intentionally distinct: CONTENT_KINDS = string labels that
 *   appear in URLs + UI; FeedSourceKind = the runtime fetch kind for
 *   policy + ranking application. Mapping done in feed-types.ts.
 */

import type { FeedItem } from "./feed-types";
import type { FeedRepository } from "./feed-repository";

// ─── Branded FeedSourceId ─────────────────────────────────────────

export type FeedSourceId = string & { readonly __brand: "FeedSourceId" };

/** Mint a FeedSourceId from a plain string. */
export function asFeedSourceId(value: string): FeedSourceId {
  return value as FeedSourceId;
}

// ─── FeedSourceKind enum ──────────────────────────────────────────

export type FeedSourceKind =
  | "continue_learning"
  | "lesson"
  | "community_post"
  | "free_course"
  | "premium_course"
  | "creator_update";

export const FEED_SOURCE_KINDS: readonly FeedSourceKind[] = [
  "continue_learning",
  "lesson",
  "community_post",
  "free_course",
  "premium_course",
  "creator_update",
];

// ─── Source descriptor ────────────────────────────────────────────

/**
 * Per-source descriptor that the feed builder resolves at compose-time.
 * Each descriptor wires a FeedSourceKind to its fetch function and
 * declaratively carries an enabled flag for kill-switching at runtime
 * without removing the registration (rare ops-driven).
 */
export interface FeedSourceDescriptor {
  /** Stable identifier (slug, e.g., "continue-learning-v1"). */
  id: FeedSourceId;
  /** The FeedItem kind this source emits. */
  kind: FeedSourceKind;
  /** Human-readable label for analytics + UI diagnostics. */
  displayLabel: string;
  /**
   * Fetch the source&rsquo;s items for the given context. Receives the
   * FeedSourceContext (built per request from FeedContext) and the
   * FeedRepository port (passed at compose-time so the source stays
   * independent of which adapter is wired).
   */
  fetch: (ctx: SourceContext, repo: FeedRepository) => Promise<FeedItem[]>;
  /** Whether this source is currently active. */
  enabled: boolean;
}

/**
 * Source-level context (subset of FeedContext that&rsquo;s source-stable).
 * Different sources may consume different fields (e.g., follow-list
 * for community_post; ownedProductIds for continue_learning).
 */
export interface SourceContext {
  userId: string;
  ownedProductIds: string[];
  followedCreatorIds: string[];
  lang: string;
  country: string | null;
  /** Opaque cursor for pagination. */
  cursor: string | null;
  /** Per-source max items (caller-controlled budget). */
  limit: number;
}

// ─── Registry singleton ───────────────────────────────────────────

const _registry = new Map<FeedSourceId, FeedSourceDescriptor>();

export const FEED_SOURCE_REGISTRY: ReadonlyMap<FeedSourceId, FeedSourceDescriptor> =
  _registry;

/**
 * Register a feed source. Throws on duplicate id (the registry MUST
 * be deterministic; idempotent register-twice would silently mask
 * any config drift).
 */
export function registerFeedSource(descriptor: FeedSourceDescriptor): void {
  if (_registry.has(descriptor.id)) {
    throw new Error(
      `Feed source "${descriptor.id}" is already registered. ` +
        `Use _resetFeedSourceRegistryForTests() in test setup if you intend to re-register.`,
    );
  }
  _registry.set(descriptor.id, descriptor);
}

export function getFeedSource(id: FeedSourceId): FeedSourceDescriptor | undefined {
  return _registry.get(id);
}

export function isFeedSourceRegistered(id: FeedSourceId): boolean {
  return _registry.has(id);
}

export function listFeedSourceIds(): readonly FeedSourceId[] {
  return Array.from(_registry.keys());
}

export function listFeedSources(): readonly FeedSourceDescriptor[] {
  return Array.from(_registry.values());
}

/**
 * Test-only escape hatch: clears the registry between test runs.
 * NOT exported via an index barrel \u2014 test files import it directly.
 */
export function _resetFeedSourceRegistryForTests(): void {
  _registry.clear();
}
