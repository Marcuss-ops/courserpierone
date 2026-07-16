/**
 * src/domains/creator-ops/read-models/inbox-types.ts
 *
 * Phase 3 Step 2 — inbox read-model types + Port (Domain layer).
 *
 * MIGRATION: this file replaces the previous
 * `src/domains/insights/customer-profile/get-creator-inbox.ts`
 * (which was a flat direct-prisma service). The move is required by
 * ADR-0016 §3 (registry-and-resolver centrali) — the creator-side
 * read-models live under `src/domains/creator-ops/read-models/`.
 *
 * Architecture (per ADR-0016 §1 dep direction):
 *   - ZERO prisma imports. Domain types + Port contract only.
 *   - Use case (./inbox.ts) imports ONLY this file.
 *   - Adapter (./prisma-inbox-repository.ts) imports ONLY this file +
 *     `@/lib/db/prisma`.
 *   - Tests stub the port (no Prisma mocks, no clock).
 *
 * Phase 3 Step 2 SCOPE (per ADR-0016 §3):
 *   - Commit 1 (this commit): MOVE + refactor. Same observable shape
 *     as the legacy service (3 round-trips: products, conversations
 *     with last message, message groupBy for unread). No new fields.
 *   - Commit 2 (future): EXTEND. Adds lastLessonTitle +
 *     lifetimeValueCents (Phase 5 plan items) per ADR-0016 §3 inbox
 *     spec ("ultima lezione + valore cliente"). Adds 2 more queries.
 *
 * Backward compatibility:
 *   - `CreatorConversationPreview`, `CreatorInboxResult`,
 *     `CreatorInboxProductOption`, `CreatorInboxUser` exported with
 *     identical shapes to the legacy module so the page consumer
 *     (`src/app/dashboard/creator/messages/page.tsx`) needs only an
 *     import-path change.
 */

// ─── Output shape (unchanged from legacy) ────────────────────────────

/** Max chars per last-message preview (truncated to fit the inbox row). */
export const INBOX_PREVIEW_MAX = 80;

export interface CreatorConversationPreview {
  id: string;
  productId: string;
  productLabel: string;
  productCoverUrl: string | null;
  otherUser: {
    id: string;
    name: string | null;
    image: string | null;
    role: string;
  };
  lastMessage: {
    id: string;
    content: string;
    createdAt: string;
    senderId: string;
    read: boolean;
  } | null;
  unreadCount: number;
}

export interface CreatorInboxProductOption {
  id: string;
  slug: string;
  coverUrl: string | null;
}

export interface CreatorInboxResult {
  previews: CreatorConversationPreview[];
  productOptions: CreatorInboxProductOption[];
  totalUnread: number;
}

export interface CreatorInboxUser {
  id: string;
  role: string;
}

// ─── Input shape ────────────────────────────────────────────────────

export interface GetCreatorInboxInput {
  /** User.id (Postgres cuid). REQUIRED — defensive empty returns empty inbox. */
  userId: string;
  /**
   * "creator" | "admin" | anything else. Admin bypass scopes to all
   * published products; non-creator/non-admin returns empty inbox
   * (the page redirects to /dashboard/messages before calling, but
   * the use case is defense-in-depth).
   */
  role: string;
}

// ─── Port contract (adapter boundary) ───────────────────────────────

/**
 * Adapter raw row DTO. Internal contract between the adapter and
 * the use case. Adapter maps Prisma → this shape; use case does NOT
 * touch prisma types. Keeps Domain layer DB-agnostic.
 */
export interface RawInboxConversation {
  id: string;
  userOneId: string;
  userTwoId: string;
  productId: string;
  productSlug: string;
  productCoverUrl: string | null;
  updatedAt: Date;
  otherUser: {
    id: string;
    name: string | null;
    image: string | null;
    role: string;
  };
  lastMessage: {
    id: string;
    content: string;
    createdAt: Date;
    senderId: string;
    read: boolean;
  } | null;
}

export interface RawInboxProduct {
  id: string;
  slug: string;
  coverUrl: string | null;
}

export interface RawInboxUnreadCount {
  conversationId: string;
  unreadCount: number;
}

/**
 * Adapter port (3 bounded queries per inbox view). Stubbed in tests
 * via the in-file `mkStubInboxRepo()` helper.
 *
 * Query budget (per Phase 3 spec — Commit 1 = MOVE only):
 *   1. fetchOwnedProducts         → creator's products (or all published for admin)
 *   2. fetchConversationsWithLastMessage → inbox rows w/ last message inline
 *   3. fetchUnreadCounts          → batched groupBy for unread badges
 *
 * Commit 2 will EXTEND this port with 2 more methods for lastLesson
 * + LTV. Total budget stays within the "max 3-4 aggregate" spec
 * (the 2 new methods are bounded groupBy / findMany over the inbox's
 * conversation scope, not extra per-row queries).
 */
export interface InboxRepository {
  fetchOwnedProducts(input: {
    userId: string;
    role: string;
  }): Promise<RawInboxProduct[]>;
  fetchConversationsWithLastMessage(input: {
    userId: string;
    productIds: readonly string[];
  }): Promise<RawInboxConversation[]>;
  fetchUnreadCounts(input: {
    userId: string;
    conversationIds: readonly string[];
  }): Promise<RawInboxUnreadCount[]>;
}