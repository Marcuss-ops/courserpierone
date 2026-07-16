/**
 * src/domains/messaging/offer-card/offer-eligibility-policy.test.ts
 *
 * Phase 4 (Courssy \u2014 DM with Offer Card) \u2014 REWRITE.
 *
 * Vitest suite for the 7-rule eligibility policy. Two-product
 * semantic: chat-context productId (engagement check) is DISTINCT
 * from offered productId (anti-redundancy check). Mock fixtures use
 * `mockImplementation` on findActiveGrant to differentiate by input
 * productId (canonical upsell flow: free course chat \u2192 premium
 * course offer).
 *
 * Coverage map:
 *   \u2022 Rule 1 NO_CONVERSATION            (deny absent/allow present \u00d72 orderings)
 *   \u2022 Rule 2 NO_ENGAGEMENT               (deny absent chat-grant/allow free/allow order)
 *   \u2022 Rule 3 OFFER_NOT_FROM_CREATOR       (deny creator mismatch/allow match/throw on null)
 *   \u2022 Rule 4 PRODUCT_NOT_PUBLISHED       (deny draft/deny archived/allow published)
 *   \u2022 Rule 5 USER_ALREADY_OWNS           (deny owned offered/allow no offered grant)
 *   \u2022 Rule 6 FREQUENCY_EXCEEDED          (deny at cap/allow outside window/allow none)
 *   \u2022 Rule 7 OPT_OUT                     (deny pref=false/deny pref=null/allow pref=true)
 *   \u2022 Composition                        (first denial/happy path/determinism/short-circuit)
 *
 * Fixture pattern (`DepsFixture`): the factory returns both `deps`
 * (strict-interface) and `mocks` (MockedFunction handles) \u2014 canonical
 * vitest idiom for interface-coupled SUTs.
 *
 * Determinism: fixed date literals (`T_NOW`, `T_5_DAYS_AGO`)
 * throughout \u2014 no `new Date()` in test setup.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MockedFunction } from "vitest";

// SUT + types
import {
  evaluateOfferEligibility,
  DEFAULT_FREQUENCY_WINDOW_DAYS,
  MAX_OFFERS_PER_WINDOW,
  type EligibilityPolicyDeps,
} from "./offer-eligibility-policy";
import {
  type CreatorId,
  type OfferCardDraft,
  type ProductId,
  type RecipientId,
} from "./offer-card-types";

// \u2500\u2500\u2500\u2500 Test fixtures \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

const T_NOW = new Date("2026-07-16T12:00:00Z");
const T_5_DAYS_AGO = new Date("2026-07-11T12:00:00Z");

// Test fixtures use TYPE-ONLY casts (not runtime validators) because
// the literal strings ("creator_1" etc.) don't match the CUID pattern
// enforced by asCreatorId/asRecipientId/asProductId. Tests have
// KNOWN-VALID fixtures; runtime validation is for trust boundaries
// (API input, DB reads). The brand still provides compile-time safety
// against accidental cross-use at field assignments.
const CREATOR_ID = "creator_1" as CreatorId;
const RECIPIENT_ID = "user_recipient" as RecipientId;
const CHAT_PRODUCT_ID = "prod_chat_free" as ProductId;      // chat is on a free course
const OFFERED_PRODUCT_ID = "prod_offered_premium" as ProductId;  // offer is the premium upgrade
const CONVERSATION_ID = "conv_1";

/**
 * Canonical upsell scenario: free course chat context + premium course
 * offer by the same creator. Rule 2 checks the CHAT product for a grant
 * (engagement basis); Rule 5 checks the OFFERED product (anti-redundancy).
 * The two productIds are DIFFERENT \u2014 conflating them was the original
 * architectural bug.
 */
const BASE_DRAFT: OfferCardDraft = {
  creatorId: CREATOR_ID,
  recipientId: RECIPIENT_ID,
  conversationProductId: CHAT_PRODUCT_ID,
  productId: OFFERED_PRODUCT_ID,
  localizedPrice: { currency: "eur", amountCents: 4900, symbol: "\u20ac" },
  reason: "free_course_completion",
};

// \u2500\u2500\u2500\u2500 DepsFixture: deps + mocks (canonical vitest idiom) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

interface DepsFixture {
  /** Strict-interface object passed to the SUT \u2014 satisfies EligibilityPolicyDeps. */
  deps: EligibilityPolicyDeps;
  /** Same vi.fn() instances, exposed for back-channel overrides. */
  mocks: {
    findConversation: MockedFunction<EligibilityPolicyDeps["findConversation"]>;
    findActiveGrant: MockedFunction<EligibilityPolicyDeps["findActiveGrant"]>;
    findProduct: MockedFunction<EligibilityPolicyDeps["findProduct"]>;
    findPreference: MockedFunction<EligibilityPolicyDeps["findPreference"]>;
    findSentOfferCardsInWindow: MockedFunction<EligibilityPolicyDeps["findSentOfferCardsInWindow"]>;
  };
}

/**
 * Default deps fixture: ALL rules allow. The findActiveGrant mock uses
 * mockImplementation that returns a grant for the chat productId and
 * null for the offered productId (canonical upsell scenario \u2014 recipient
 * is free-enrolled in chat but doesn't own the premium offered yet).
 */
function mkAllowAllDeps(): DepsFixture {
  const findConversation = vi.fn().mockResolvedValue({
    id: CONVERSATION_ID,
    userOneId: CREATOR_ID,
    userTwoId: RECIPIENT_ID,
    productId: CHAT_PRODUCT_ID,
  });
  // Two-product grant mock: chat-context grant exists (Rule 2 passes),
  // offered-product grant absent (Rule 5 passes \u2014 anti-redundancy OK).
  const findActiveGrant = vi.fn().mockImplementation(async ({ productId }) => {
    if (productId === CHAT_PRODUCT_ID) {
      return { id: "grant_chat", sourceType: "free_enrollment" };
    }
    return null; // OFFERED_PRODUCT_ID \u2192 no grant (\u2192 Rule 5 OK)
  });
  const findProduct = vi.fn().mockResolvedValue({
    id: OFFERED_PRODUCT_ID,
    creatorId: CREATOR_ID,
    status: "published",
  });
  const findPreference = vi.fn().mockResolvedValue({
    inappChatReply: true,
    emailNewLesson: true,
  });
  const findSentOfferCardsInWindow = vi.fn().mockResolvedValue([]);
  return {
    deps: {
      findConversation,
      findActiveGrant,
      findProduct,
      findPreference,
      findSentOfferCardsInWindow,
    },
    mocks: {
      findConversation,
      findActiveGrant,
      findProduct,
      findPreference,
      findSentOfferCardsInWindow,
    },
  };
}

beforeEach(() => vi.clearAllMocks());

// \u2500\u2500\u2500\u2500 Rule 1: Conversation validation \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
describe("Rule 1: ELIGIBILITY_NO_CONVERSATION", () => {
  it("denies when no conversation exists for (creator, recipient, conversationProductId)", async () => {
    const { deps, mocks } = mkAllowAllDeps();
    mocks.findConversation.mockResolvedValueOnce(null);

    const result = await evaluateOfferEligibility({ draft: BASE_DRAFT, now: T_NOW }, deps);
    expect(result).toEqual({ eligible: false, reason: "ELIGIBILITY_NO_CONVERSATION" });
    expect(mocks.findConversation).toHaveBeenCalledWith({
      userIdA: CREATOR_ID,
      userIdB: RECIPIENT_ID,
      productId: CHAT_PRODUCT_ID, // \u2190 conversationProductId (NOT offered)
    });
  });

  it("allows when conversation exists with creator as userOne", async () => {
    const { deps } = mkAllowAllDeps();
    const result = await evaluateOfferEligibility({ draft: BASE_DRAFT, now: T_NOW }, deps);
    expect(result.eligible).toBe(true);
  });

  it("allows when conversation exists with creator as userTwo (symmetric)", async () => {
    const { deps, mocks } = mkAllowAllDeps();
    mocks.findConversation.mockResolvedValueOnce({
      id: CONVERSATION_ID,
      userOneId: RECIPIENT_ID, // recipient is userOne
      userTwoId: CREATOR_ID,   // creator is userTwo
      productId: CHAT_PRODUCT_ID,
    });
    const result = await evaluateOfferEligibility({ draft: BASE_DRAFT, now: T_NOW }, deps);
    expect(result.eligible).toBe(true);
  });
});

// \u2500\u2500\u2500\u2500 Rule 2: Engagement (chat-context grant) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
describe("Rule 2: ELIGIBILITY_NO_ENGAGEMENT", () => {
  it("denies when recipient has NO active grant on chat product", async () => {
    const { deps, mocks } = mkAllowAllDeps();
    // Override for chat productId: no grant (deny).
    mocks.findActiveGrant.mockImplementation(async ({ productId }) => {
      return productId === CHAT_PRODUCT_ID ? null : null; // both null
    });

    const result = await evaluateOfferEligibility({ draft: BASE_DRAFT, now: T_NOW }, deps);
    expect(result).toEqual({ eligible: false, reason: "ELIGIBILITY_NO_ENGAGEMENT" });
    // Verify Rule 2 specifically targeted the CHAT product (not the offered).
    expect(mocks.findActiveGrant).toHaveBeenCalledWith({
      userId: RECIPIENT_ID,
      productId: CHAT_PRODUCT_ID,
    });
  });

  it("allows when recipient has free_enrollment grant on chat product", async () => {
    const { deps, mocks } = mkAllowAllDeps();
    mocks.findActiveGrant.mockImplementation(async ({ productId }) => {
      if (productId === CHAT_PRODUCT_ID) {
        return { id: "grant_free", sourceType: "free_enrollment" };
      }
      return null;
    });
    const result = await evaluateOfferEligibility({ draft: BASE_DRAFT, now: T_NOW }, deps);
    expect(result.eligible).toBe(true);
  });

  it("allows when recipient has order grant (paid customer) on chat product", async () => {
    const { deps, mocks } = mkAllowAllDeps();
    mocks.findActiveGrant.mockImplementation(async ({ productId }) => {
      if (productId === CHAT_PRODUCT_ID) {
        return { id: "grant_order", sourceType: "order" };
      }
      return null;
    });
    const result = await evaluateOfferEligibility({ draft: BASE_DRAFT, now: T_NOW }, deps);
    expect(result.eligible).toBe(true);
  });

  it("port contract: findActiveGrant checks status='active' filter (caller enforcement)", async () => {
    // \u2014 Per the port: findActiveGrant should only return rows with
    // status='active'. The Prisma adapter (future) must filter server-side.
    const { deps, mocks } = mkAllowAllDeps();
    mocks.findActiveGrant.mockImplementation(async () => null);
    const result = await evaluateOfferEligibility({ draft: BASE_DRAFT, now: T_NOW }, deps);
    expect(result).toEqual({ eligible: false, reason: "ELIGIBILITY_NO_ENGAGEMENT" });
  });
});

// \u2500\u2500\u2500\u2500 Rule 3: Creator ownership of OFFERED product \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
describe("Rule 3: ELIGIBILITY_OFFER_NOT_FROM_CREATOR", () => {
  it("denies when offered.creatorId is not the draft.creatorId", async () => {
    const { deps, mocks } = mkAllowAllDeps();
    mocks.findProduct.mockResolvedValueOnce({
      id: OFFERED_PRODUCT_ID,
      creatorId: "creator_other" as CreatorId, // mismatch
      status: "published",
    });
    const result = await evaluateOfferEligibility({ draft: BASE_DRAFT, now: T_NOW }, deps);
    expect(result).toEqual({ eligible: false, reason: "ELIGIBILITY_OFFER_NOT_FROM_CREATOR" });
  });

  it("allows when offered.creatorId matches the draft.creatorId", async () => {
    const { deps } = mkAllowAllDeps();
    const result = await evaluateOfferEligibility({ draft: BASE_DRAFT, now: T_NOW }, deps);
    expect(result.eligible).toBe(true);
  });

  it("throws on programmer error: productId does not resolve to a Product", async () => {
    const { deps, mocks } = mkAllowAllDeps();
    mocks.findProduct.mockResolvedValueOnce(null);

    await expect(
      evaluateOfferEligibility({ draft: BASE_DRAFT, now: T_NOW }, deps),
    ).rejects.toThrow(/does not resolve to a Product/);
  });
});

// \u2500\u2500\u2500\u2500 Rule 4: Offered product published \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
describe("Rule 4: ELIGIBILITY_PRODUCT_NOT_PUBLISHED", () => {
  it.each([
    ["draft", "Offered Product.status='draft' \u2192 deny"],
    ["archived", "Offered Product.status='archived' \u2192 deny"],
  ] as const)("denies when offered product.status='%s'", async (status, _desc) => {
    const { deps, mocks } = mkAllowAllDeps();
    mocks.findProduct.mockResolvedValueOnce({
      id: OFFERED_PRODUCT_ID,
      creatorId: CREATOR_ID,
      status,
    });
    const result = await evaluateOfferEligibility({ draft: BASE_DRAFT, now: T_NOW }, deps);
    expect(result).toEqual({ eligible: false, reason: "ELIGIBILITY_PRODUCT_NOT_PUBLISHED" });
  });

  it("allows when offered product.status='published'", async () => {
    const { deps } = mkAllowAllDeps();
    const result = await evaluateOfferEligibility({ draft: BASE_DRAFT, now: T_NOW }, deps);
    expect(result.eligible).toBe(true);
  });
});

// \u2500\u2500\u2500\u2500 Rule 5: No ownership of OFFERED product \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
describe("Rule 5: ELIGIBILITY_USER_ALREADY_OWNS (OFFERED product only)", () => {
  it("denies when recipient has active grant on OFFERED productId (and chat grant exists)", async () => {
    const { deps, mocks } = mkAllowAllDeps();
    // Both products grant exist \u2014 Rule 2 passes (chat) but Rule 5 fails (offered).
    mocks.findActiveGrant.mockImplementation(async () => ({
      id: "grant_any",
      sourceType: "order",
    }));
    const result = await evaluateOfferEligibility({ draft: BASE_DRAFT, now: T_NOW }, deps);
    expect(result).toEqual({ eligible: false, reason: "ELIGIBILITY_USER_ALREADY_OWNS" });
    // Verify Rule 5 targeted the OFFERED product.
    const calls = mocks.findActiveGrant.mock.calls;
    expect(calls[1][0]).toEqual({
      userId: RECIPIENT_ID,
      productId: OFFERED_PRODUCT_ID,
    });
  });

  it("allows when ONLY chat grant exists (canonical upsell scenario)", async () => {
    // Default fixture: chat grant present, offered grant absent \u2192 Rule 5 passes.
    const { deps } = mkAllowAllDeps();
    const result = await evaluateOfferEligibility({ draft: BASE_DRAFT, now: T_NOW }, deps);
    expect(result).toEqual({
      eligible: true,
      conversationAnchor: {
        creatorId: CREATOR_ID,
        recipientId: RECIPIENT_ID,
        conversationProductId: CHAT_PRODUCT_ID,
      },
    });
  });
});

// \u2500\u2500\u2500\u2500 Rule 6: Frequency limit \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
describe(`Rule 6: ELIGIBILITY_FREQUENCY_EXCEEDED (window=${DEFAULT_FREQUENCY_WINDOW_DAYS}d, max=${MAX_OFFERS_PER_WINDOW})`, () => {
  it(`denies when ${MAX_OFFERS_PER_WINDOW} offer already sent within window`, async () => {
    const { deps, mocks } = mkAllowAllDeps();
    mocks.findSentOfferCardsInWindow.mockResolvedValueOnce([T_5_DAYS_AGO]);
    const result = await evaluateOfferEligibility({ draft: BASE_DRAFT, now: T_NOW }, deps);
    expect(result).toEqual({ eligible: false, reason: "ELIGIBILITY_FREQUENCY_EXCEEDED" });
  });

  it("allows when prior offer is outside the rolling window (>7d ago)", async () => {
    const { deps, mocks } = mkAllowAllDeps();
    // Adapter contract: findSentOfferCardsInWindow must FILTER dates
    // server-side. The 8-day-old date was already excluded — returning
    // [] to simulate the adapter filtering complete with windowDays=7.
    mocks.findSentOfferCardsInWindow.mockResolvedValueOnce([]);
    const result = await evaluateOfferEligibility({ draft: BASE_DRAFT, now: T_NOW }, deps);
    expect(result.eligible).toBe(true);
  });

  it("allows when no prior offers exist in window", async () => {
    const { deps, mocks } = mkAllowAllDeps();
    mocks.findSentOfferCardsInWindow.mockResolvedValueOnce([]);
    const result = await evaluateOfferEligibility({ draft: BASE_DRAFT, now: T_NOW }, deps);
    expect(result.eligible).toBe(true);
  });
});

// \u2500\u2500\u2500\u2500 Rule 7: Opt-in \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
describe("Rule 7: ELIGIBILITY_OPT_OUT (proxy: inappChatReply)", () => {
  it("denies when preference.inappChatReply === false", async () => {
    const { deps, mocks } = mkAllowAllDeps();
    mocks.findPreference.mockResolvedValueOnce({
      inappChatReply: false,
      emailNewLesson: true,
    });
    const result = await evaluateOfferEligibility({ draft: BASE_DRAFT, now: T_NOW }, deps);
    expect(result).toEqual({ eligible: false, reason: "ELIGIBILITY_OPT_OUT" });
  });

  it("denies when preference row missing (null)", async () => {
    const { deps, mocks } = mkAllowAllDeps();
    mocks.findPreference.mockResolvedValueOnce(null);
    const result = await evaluateOfferEligibility({ draft: BASE_DRAFT, now: T_NOW }, deps);
    expect(result).toEqual({ eligible: false, reason: "ELIGIBILITY_OPT_OUT" });
  });

  it("allows when preference.inappChatReply === true", async () => {
    const { deps, mocks } = mkAllowAllDeps();
    mocks.findPreference.mockResolvedValueOnce({
      inappChatReply: true,
      emailNewLesson: false,
    });
    const result = await evaluateOfferEligibility({ draft: BASE_DRAFT, now: T_NOW }, deps);
    expect(result.eligible).toBe(true);
  });
});

// \u2500\u2500\u2500\u2500 Composition (short-circuit AND + happy path) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
describe("Composition (short-circuit AND)", () => {
  it("returns FIRST denial reason when multiple rules fail (Rule 1 fires before Rule 7)", async () => {
    const { deps, mocks } = mkAllowAllDeps();
    // Force Rules 1, 2, 7 to all fail. Expected: Rule 1 wins (first check).
    mocks.findConversation.mockResolvedValueOnce(null);
    mocks.findActiveGrant.mockImplementation(async () => null);
    mocks.findPreference.mockResolvedValueOnce(null);

    const result = await evaluateOfferEligibility({ draft: BASE_DRAFT, now: T_NOW }, deps);
    expect(result).toEqual({ eligible: false, reason: "ELIGIBILITY_NO_CONVERSATION" });
  });

  it("happy path: all 7 rules pass (canonical upsell: free chat \u2192 premium offer)", async () => {
    const { deps } = mkAllowAllDeps();
    const result = await evaluateOfferEligibility({ draft: BASE_DRAFT, now: T_NOW }, deps);
    expect(result).toEqual({
      eligible: true,
      conversationAnchor: {
        creatorId: CREATOR_ID,
        recipientId: RECIPIENT_ID,
        conversationProductId: CHAT_PRODUCT_ID,
      },
    });
  });

  it("determinism: same input + deps + now \u2192 identical output across re-runs", async () => {
    const { deps } = mkAllowAllDeps();
    const run1 = await evaluateOfferEligibility({ draft: BASE_DRAFT, now: T_NOW }, deps);
    const run2 = await evaluateOfferEligibility({ draft: BASE_DRAFT, now: T_NOW }, deps);
    expect(run1).toEqual(run2);
  });

  it("doesn't call later rule methods after an early denial (short-circuit)", async () => {
    const { deps, mocks } = mkAllowAllDeps();
    mocks.findConversation.mockResolvedValueOnce(null); // Rule 1 fail (first check)

    await evaluateOfferEligibility({ draft: BASE_DRAFT, now: T_NOW }, deps);

    // Rules 2-7 should NOT be called after Rule 1 failure.
    expect(mocks.findActiveGrant).not.toHaveBeenCalled();
    expect(mocks.findProduct).not.toHaveBeenCalled();
    expect(mocks.findPreference).not.toHaveBeenCalled();
    expect(mocks.findSentOfferCardsInWindow).not.toHaveBeenCalled();
  });
});
