/**
 * src/domains/messaging/offer-card/offer-eligibility-rules.ts
 *
 * Phase 4 (Courssy \u2014 DM with Offer Card).
 *
 * Per-rule guards extracted from offer-eligibility-policy.ts to satisfy
 * the ADR-0016 size budget (250 LOC applicativo). Each rule is a pure
 * function of (input, deps, [now]). Files split rationale:
 *   \u2022 `policy.ts` (composer) \u2014 port + evaluateOfferEligibility + types
 *   \u2022 `rules.ts` (this file) \u2014 7 isolated guard functions
 *
 * The composer imports the 7 guards via a thin re-export in policy.ts
 * (single SUT entry point for tests). Each rule can also be tested
 * directly per the unit-test plan if/when needed.
 *
 * Rule order matches the 7-rules short-circuit AND composition in
 * evaluateOfferEligibility:
 *   1. checkConversation           \u2014 chat anchor existence
 *   2. checkEngagement             \u2014 grant on chat-anchor productId
 *   3. checkCreatorOwnership       \u2014 offered product creator match
 *   4. checkProductPublished       \u2014 offered product status
 *   5. checkNoOwnership            \u2014 grant absence on offered productId
 *   6. checkFrequency              \u2014 rolling-window cap
 *   7. checkOptIn                  \u2014 NotificationPreference proxy
 *
 * Two-product semantic (chat-anchor vs offered) is enforced by separate
 * productId parameters in each rule's grant lookup.
 */

import type {
  OfferCardDraft,
  ConversationAnchor,
  ProductId,
  CreatorId,
  RecipientId,
} from "./offer-card-types";
import type {
  EligibilityDenialReason,
  EligibilityPolicyDeps,
} from "./offer-eligibility-policy";

// Per-rule guard return shape (inlined here to avoid circular type import
// from policy.ts; rules.ts is leaf, policy.ts imports them).
type RuleResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? unknown : T))
  | { ok: false; reason: EligibilityDenialReason };

// \u2500\u2500\u2500\u2500 Rule 1 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

export async function checkConversation(
  input: OfferCardDraft,
  deps: EligibilityPolicyDeps,
): Promise<RuleResult<{ anchor: ConversationAnchor }>> {
  // Symmetric conversation lookup on conversationProductId (chat
  // anchor product). Adapter handles creator-as-userOne OR
  // creator-as-userTwo permutations.
  const conv = await deps.findConversation({
    userIdA: input.creatorId,
    userIdB: input.recipientId,
    productId: input.conversationProductId,
  });
  if (!conv) return { ok: false, reason: "ELIGIBILITY_NO_CONVERSATION" };
  return {
    ok: true,
    anchor: {
      creatorId: input.creatorId,
      recipientId: input.recipientId,
      conversationProductId: input.conversationProductId,
    },
  };
}

// \u2500\u2500\u2500\u2500 Rule 2 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

export async function checkEngagement(
  input: OfferCardDraft,
  deps: EligibilityPolicyDeps,
): Promise<RuleResult> {
  // Free-enrolled OR customer for the CHAT product (engagement basis).
  const grant = await deps.findActiveGrant({
    userId: input.recipientId,
    productId: input.conversationProductId,
  });
  if (!grant) return { ok: false, reason: "ELIGIBILITY_NO_ENGAGEMENT" };
  return { ok: true };
}

// \u2500\u2500\u2500\u2500 Rules 3 + 4 (bundled \u2014 single Product fetch) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

export async function checkCreatorOwnership(
  input: OfferCardDraft,
  deps: EligibilityPolicyDeps,
): Promise<
  | { ok: true; product: { id: string; creatorId: CreatorId; status: string } }
  | { ok: false; reason: EligibilityDenialReason }
> {
  const product = await deps.findProduct(input.productId);
  if (!product) {
    // PROGRAMMER ERROR: caller must pre-validate draft.productId.
    // Throw fail-fast \u2014 not a domain denial.
    throw new Error(
      `OfferCardDraft.productId=${input.productId} does not resolve to a Product`,
    );
  }
  if (product.creatorId !== input.creatorId) {
    return { ok: false, reason: "ELIGIBILITY_OFFER_NOT_FROM_CREATOR" };
  }
  return { ok: true, product };
}

export async function checkProductPublished(
  product: { status: string },
): Promise<RuleResult> {
  if (product.status !== "published") {
    return { ok: false, reason: "ELIGIBILITY_PRODUCT_NOT_PUBLISHED" };
  }
  return { ok: true };
}

// \u2500\u2500\u2500\u2500 Rule 5 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

export async function checkNoOwnership(
  input: OfferCardDraft,
  deps: EligibilityPolicyDeps,
): Promise<RuleResult> {
  // Anti-redundancy: don't upsell to a recipient who already owns the
  // OFFERED product.
  const grant = await deps.findActiveGrant({
    userId: input.recipientId,
    productId: input.productId,
  });
  if (grant) return { ok: false, reason: "ELIGIBILITY_USER_ALREADY_OWNS" };
  return { ok: true };
}

// \u2500\u2500\u2500\u2500 Rule 6 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

export async function checkFrequency(
  input: OfferCardDraft,
  deps: EligibilityPolicyDeps,
  now: Date,
  windowDays: number,
  maxInWindow: number,
): Promise<RuleResult> {
  // Adapter contract: findSentOfferCardsInWindow must FILTER dates
  // server-side. We trust the array length is the right count.
  const sentDates = await deps.findSentOfferCardsInWindow({
    recipientId: input.recipientId,
    windowDays,
    now,
  });
  if (sentDates.length >= maxInWindow) {
    return { ok: false, reason: "ELIGIBILITY_FREQUENCY_EXCEEDED" };
  }
  return { ok: true };
}

// \u2500\u2500\u2500\u2500 Rule 7 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

export async function checkOptIn(
  input: OfferCardDraft,
  deps: EligibilityPolicyDeps,
): Promise<RuleResult> {
  // MVP proxy: NotificationPreference.inappChatReply is the broadest
  // 'allow DM engagement' toggle until V2 schema migration introduces
  // a granular `inappOfferCard` column.
  const pref = await deps.findPreference(input.recipientId);
  if (!pref || !pref.inappChatReply) {
    return { ok: false, reason: "ELIGIBILITY_OPT_OUT" };
  }
  return { ok: true };
}
