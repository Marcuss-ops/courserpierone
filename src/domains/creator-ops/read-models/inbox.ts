/**
 * src/domains/creator-ops/read-models/inbox.ts
 *
 * Phase 3 Step 2 — inbox read-model use case (pure).
 *
 * MIGRATION of `src/domains/insights/customer-profile/get-creator-inbox.ts`
 * to its canonical creator-ops location per ADR-0016 §3.
 *
 * Pure function: takes a viewer + injected repository, returns
 * `CreatorInboxResult`. ZERO `@prisma/client` imports — the Domain
 * layer stays testable without a DB.
 *
 * Observable behavior is identical to the legacy service (same 3
 * round-trips, same output shape). Commit 2 of Step 2 will EXTEND
 * this service to add lastLessonTitle + lifetimeValueCents without
 * touching the page consumer beyond a type update.
 *
 * Architecture (per ADR-0016 §1):
 *   - Domain port (`InboxRepository`) is the seam.
 *   - Prisma adapter is the sibling `prisma-inbox-repository.ts`.
 *   - `prismaInboxRepository` is NOT re-exported here on purpose
 *     (mirrors audience.ts + continue-watching.ts pattern) so that
 *     importing just `getCreatorInbox` does NOT transitively load
 *     `@prisma/client`. Consumers wire the adapter via direct import.
 */

import type {
  CreatorInboxResult,
  CreatorInboxUser,
  GetCreatorInboxInput,
  InboxRepository,
  RawInboxConversation,
} from "./inbox-types";
import { INBOX_PREVIEW_MAX } from "./inbox-types";

export {
  INBOX_PREVIEW_MAX,
  type CreatorConversationPreview,
  type CreatorInboxProductOption,
  type CreatorInboxResult,
  type CreatorInboxUser,
  type GetCreatorInboxInput,
  type InboxRepository,
  type RawInboxConversation,
  type RawInboxProduct,
  type RawInboxUnreadCount,
} from "./inbox-types";

const EMPTY_INBOX: CreatorInboxResult = Object.freeze({
  previews: [],
  productOptions: [],
  totalUnread: 0,
});

export interface GetCreatorInboxDeps {
  repo: InboxRepository;
}

/**
 * Truncate a message body to the inbox preview length (80 chars + "…").
 * Pure helper, exported for unit-test access.
 */
export function truncatePreview(content: string): string {
  if (content.length <= INBOX_PREVIEW_MAX) return content;
  return content.slice(0, INBOX_PREVIEW_MAX) + "…";
}

/**
 * Resolve which user is the "other" party (the partner) in a
 * conversation, given the viewer's id. Conversation is symmetric
 * (userOneId/userTwoId is a canonical (min,max) ordering) so we just
 * compare against either side.
 */
export function resolveOtherUserId(
  conversation: { userOneId: string; userTwoId: string },
  viewerId: string,
): string {
  return conversation.userOneId === viewerId
    ? conversation.userTwoId
    : conversation.userOneId;
}

/**
 * Fetch the creator inbox data for the given user.
 *
 * - role='creator': scope to products owned by the user.
 * - role='admin':   scope to all published products (admin bypass).
 * - other roles:    empty inbox (defensive; page redirects first).
 *
 * 3 round-trips via the port (no N+1):
 *   1. Owned products  (creator scope OR admin scope)
 *   2. Conversations w/ last message inline (1 query for entire inbox)
 *   3. Batched unread groupBy (1 query for the entire inbox)
 *
 * Determinism: input is required, role-gated, with no clock dependency
 * (lastMessage.createdAt comes from the DB, not from a live clock).
 */
export async function getCreatorInbox(
  input: GetCreatorInboxInput,
  deps: GetCreatorInboxDeps,
): Promise<CreatorInboxResult> {
  if (!input.userId) return EMPTY_INBOX;
  if (input.role !== "creator" && input.role !== "admin") {
    return EMPTY_INBOX;
  }

  // ── 1. Scope products ────────────────────────────────────
  const ownedProducts = await deps.repo.fetchOwnedProducts({
    userId: input.userId,
    role: input.role,
  });

  const productIds = ownedProducts.map((p) => p.id);

  // ── 2. Conversations (the inbox) ─────────────────────────
  const conversations = await deps.repo.fetchConversationsWithLastMessage({
    userId: input.userId,
    productIds,
  });

  // ── 3. Batched unread counts via groupBy ─────────────────
  const conversationIds = conversations.map((c) => c.id);
  const unreadRows =
    conversationIds.length > 0
      ? await deps.repo.fetchUnreadCounts({
          userId: input.userId,
          conversationIds,
        })
      : [];

  const unreadMap = new Map<string, number>();
  for (const row of unreadRows) {
    unreadMap.set(row.conversationId, row.unreadCount);
  }

  // ── Compose the final shape ──────────────────────────────
  const previews = conversations.map((c) =>
    toPreview(c, unreadMap.get(c.id) ?? 0),
  );

  const productOptions = ownedProducts.map((p) => ({
    id: p.id,
    slug: p.slug,
    coverUrl: p.coverUrl,
  }));

  const totalUnread = previews.reduce((sum, p) => sum + p.unreadCount, 0);

  return { previews, productOptions, totalUnread };
}

function toPreview(c: RawInboxConversation, unreadCount: number) {
  return {
    id: c.id,
    productId: c.productId,
    productLabel: c.productSlug,
    productCoverUrl: c.productCoverUrl,
    otherUser: c.otherUser,
    lastMessage: c.lastMessage
      ? {
          id: c.lastMessage.id,
          content: truncatePreview(c.lastMessage.content),
          createdAt: c.lastMessage.createdAt.toISOString(),
          senderId: c.lastMessage.senderId,
          read: c.lastMessage.read,
        }
      : null,
    unreadCount,
  };
}

// NOTE: `prismaInboxRepository` is NOT re-exported here on purpose.
// Re-exporting it would force any consumer importing just
// `getCreatorInbox` to transitively load `@prisma/client` (ADR-0016
// §1 dep direction violation). Consumers wire the adapter via direct
// import from "./prisma-inbox-repository".