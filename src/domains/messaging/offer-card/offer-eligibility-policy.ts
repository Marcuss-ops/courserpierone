/**
 * src/domains/messaging/offer-card/offer-eligibility-policy.ts
 *
 * Phase 4 (Courssy \u2014 DM with Offer Card).
 *
 * Strict Offer Eligibility Policy composer. 7 mandatory rules in
 * short-circuit AND composition. Pure-function design per ADR-0016
 * \u00a7Domain rule.
 *
 * File split (ADR-0016 size budget compliance \u2014 250 LOC applicativo):
 *   \u2022 `offer-eligibility-policy.ts` (this file) \u2014 port + composer + types
 *   \u2022 `offer-eligibility-rules.ts` \u2014 7 per-rule guard functions
 *
 * The 7 rules (per Phase 4 spec):
 *   1. ELIGIBILITY_NO_CONVERSATION       (chat anchor exists)
 *   2. ELIGIBILITY_NO_ENGAGEMENT          (grant on chat-anchor productId)
 *   3. ELIGIBILITY_OFFER_NOT_FROM_CREATOR (offered.creatorId === draft.creatorId)
 *   4. ELIGIBILITY_PRODUCT_NOT_PUBLISHED  (offered.status === 'published')
 *   5. ELIGIBILITY_USER_ALREADY_OWNS      (no grant on offered productId)
 *   6. ELIGIBILITY_FREQUENCY_EXCEEDED     (offers/window < MAX_OFFERS_PER_WINDOW)
 *   7. ELIGIBILITY_OPT_OUT                (inappChatReply === true)
 *
 * Two-product semantic (chat-anchor vs offered) keeps Rules 2 and 5
 * independent \u2014 canonical upsell flow (free chat \u2192 premium offer) viable.
 *
 * Composition: rules run in order; FIRST DENIAL wins (short-circuit
 * AND). Each rule returns `{ok:true}` or `{ok:false, reason}`.
 *
 * Determinism: pure of (input, deps). `now()` injection for tests.
 */

import type {
  OfferCardDraft,
  ConversationAnchor,
  ProductId,
  CreatorId,
  RecipientId,
} from "./offer-card-types";
import {
  checkConversation,
  checkEngagement,
  checkCreatorOwnership,
  checkProductPublished,
  checkNoOwnership,
  checkFrequency,
  checkOptIn,
} from "./offer-eligibility-rules";

// \u2500\u2500\u2500\u2500 Public constants (Limits) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

export const DEFAULT_FREQUENCY_WINDOW_DAYS = 7;
export const MAX_OFFERS_PER_WINDOW = 1;

// \u2500\u2500\u2500\u2500 Public types \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

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

// \u2500\u2500\u2500\u2500 Port interface (Prisma adapter implements against DB) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

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

// \u2500\u2500\u2500\u2500 Public API: evaluateOfferEligibility (composer) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

export interface EvaluateOfferEligibilityInput {
  draft: OfferCardDraft;
  /** Injectable for deterministic tests. Defaults to `new Date()`. */
  now?: Date;
}

/**
 * Run the 7-rule eligibility check. FIRST DENIAL WINS (short-circuit
 * AND). Deterministic given (input, deps, now).
 */
export async function evaluateOfferEligibility(
  input: EvaluateOfferEligibilityInput,
  deps: EligibilityPolicyDeps,
): Promise<EligibilityResult> {
  const now = input.now ?? new Date();
  const draft = input.draft;

  const c1 = await checkConversation(draft, deps);
  if (!c1.ok) return { eligible: false, reason: c1.reason };
  const anchor = c1.anchor;

  const c2 = await checkEngagement(draft, deps);
  if (!c2.ok) return { eligible: false, reason: c2.reason };

  // Rules 3 + 4: bundle the OFFERED Product fetch (single DB round-trip).
  const c3 = await checkCreatorOwnership(draft, deps);
  if (!c3.ok) return { eligible: false, reason: c3.reason };
  const c4 = await checkProductPublished(c3.product);
  if (!c4.ok) return { eligible: false, reason: c4.reason };

  const c5 = await checkNoOwnership(draft, deps);
  if (!c5.ok) return { eligible: false, reason: c5.reason };

  const c6 = await checkFrequency(
    draft,
    deps,
    now,
    DEFAULT_FREQUENCY_WINDOW_DAYS,
    MAX_OFFERS_PER_WINDOW,
  );
  if (!c6.ok) return { eligible: false, reason: c6.reason };

  const c7 = await checkOptIn(draft, deps);
  if (!c7.ok) return { eligible: false, reason: c7.reason };

  return { eligible: true, conversationAnchor: anchor };
}
