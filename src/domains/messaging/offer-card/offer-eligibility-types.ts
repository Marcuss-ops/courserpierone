/**
 * src/domains/messaging/offer-card/offer-eligibility-types.ts
 *
 * Shared types for the Offer Card eligibility policy.
 *
 * Extracted from offer-eligibility-policy.ts to break the circular
 * dependency between the policy composer and the per-rule guards.
 *
 * Policy composer (offer-eligibility-policy.ts) and rule guards
 * (offer-eligibility-rules.ts) both import from this file; neither
 * imports types from the other.
 */

import type {
  ProductId,
  CreatorId,
  RecipientId,
  OfferCardDraft,
  ConversationAnchor,
} from "./offer-card-types";

/**
 * 7 typed denial reasons, one per mandatory rule.
 */
export type EligibilityDenialReason =
  | "ELIGIBILITY_NO_CONVERSATION"
  | "ELIGIBILITY_NO_ENGAGEMENT"
  | "ELIGIBILITY_OFFER_NOT_FROM_CREATOR"
  | "ELIGIBILITY_PRODUCT_NOT_PUBLISHED"
  | "ELIGIBILITY_USER_ALREADY_OWNS"
  | "ELIGIBILITY_FREQUENCY_EXCEEDED"
  | "ELIGIBILITY_OPT_OUT";

export type EligibilityResult =
  | { eligible: true; conversationAnchor: ConversationAnchor }
  | { eligible: false; reason: EligibilityDenialReason };

/**
 * Read-only port the eligibility policy consumes. Prisma adapter
 * implements against DB; tests implement via plain-object fixtures.
 *
 * Adapter obligations (documented per method):
 *   - findActiveGrant MUST filter server-side on status='active'.
 *   - findSentOfferCardsInWindow MUST filter server-side by date.
 */
export interface EligibilityPolicyDeps {
  findConversation(input: {
    userIdA: string;
    userIdB: string;
    productId: ProductId;
  }): Promise<{ id: string; userOneId: string; userTwoId: string; productId: string } | null>;

  findActiveGrant(input: {
    userId: string;
    productId: ProductId;
  }): Promise<{ id: string; sourceType: string } | null>;

  findProduct(productId: ProductId): Promise<{
    id: string;
    creatorId: CreatorId;
    status: string;
  } | null>;

  findPreference(userId: string): Promise<{
    inappChatReply: boolean;
    emailNewLesson: boolean;
  } | null>;

  findSentOfferCardsInWindow(input: {
    recipientId: RecipientId;
    windowDays: number;
    now: Date;
  }): Promise<readonly Date[]>;
}

export interface EvaluateOfferEligibilityInput {
  draft: OfferCardDraft;
  /** Injectable for deterministic tests. Defaults to `new Date()`. */
  now?: Date;
}
