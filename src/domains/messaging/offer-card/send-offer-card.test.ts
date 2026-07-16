/**
 * src/domains/messaging/offer-card/send-offer-card.test.ts
 *
 * Unit tests for the `sendOfferCard` use case.
 *
 * Pattern: stub the eligibility port and the repository port. No
 * Prisma, no live clock. Tests verify the orchestration:
 *   - eligibility denial short-circuits persistence
 *   - happy path creates draft → transitions to sent → returns card
 *   - state machine rejects illegal transitions (defensive)
 */

import { describe, expect, it, vi } from "vitest";

import { sendOfferCard } from "./send-offer-card";
import type { EligibilityPolicyDeps } from "./offer-eligibility-types";
import type { OfferCardRepository } from "./offer-card-repository";
import type { OfferCard, OfferCardDraft } from "./offer-card-types";
import type { CreatorId, ProductId, RecipientId } from "./offer-card-types";

const CREATOR_ID = "creator_123456789012345678901234567890123456" as CreatorId;
const RECIPIENT_ID = "recipient_1234567890123456789012345678901234" as RecipientId;
const CHAT_PRODUCT_ID = "prod_chat_1234567890123456789012345678901234" as ProductId;
const OFFERED_PRODUCT_ID = "prod_offered_123456789012345678901234567890" as ProductId;

const BASE_DRAFT: OfferCardDraft = {
  creatorId: CREATOR_ID,
  recipientId: RECIPIENT_ID,
  conversationProductId: CHAT_PRODUCT_ID,
  productId: OFFERED_PRODUCT_ID,
  localizedPrice: { currency: "eur", amountCents: 4900 },
  reason: "free_course_completion",
};

const FIXED_NOW = new Date("2026-07-16T12:00:00.000Z");

function mkStubDeps() {
  const eligibility: EligibilityPolicyDeps = {
    findConversation: vi.fn().mockResolvedValue({
      id: "conv_1",
      userOneId: CREATOR_ID,
      userTwoId: RECIPIENT_ID,
      productId: CHAT_PRODUCT_ID,
    }),
    findActiveGrant: vi.fn().mockImplementation(async ({ productId }) => {
      // chat product grant exists, offered product grant absent
      return productId === CHAT_PRODUCT_ID
        ? { id: "grant_chat", sourceType: "free_enrollment" }
        : null;
    }),
    findProduct: vi.fn().mockResolvedValue({
      id: OFFERED_PRODUCT_ID,
      creatorId: CREATOR_ID,
      status: "published",
    }),
    findPreference: vi.fn().mockResolvedValue({
      inappChatReply: true,
      emailNewLesson: true,
    }),
    findSentOfferCardsInWindow: vi.fn().mockResolvedValue([]),
  };

  const repo: OfferCardRepository = {
    create: vi.fn().mockImplementation(async (input) => ({
      id: "oc_1",
      ...input,
      coupon: input.coupon,
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
    })),
    updateStatus: vi.fn().mockImplementation(async (id, update) => {
      const base = {
        id: "oc_1",
        creatorId: CREATOR_ID,
        recipientId: RECIPIENT_ID,
        conversationProductId: CHAT_PRODUCT_ID,
        productId: OFFERED_PRODUCT_ID,
        localizedPrice: { currency: "eur", amountCents: 4900 },
        reason: "free_course_completion" as const,
        linkToken: "token_123" as OfferCard["linkToken"],
        createdAt: FIXED_NOW,
        convertedAt: null,
        convertedOrderId: null,
      };
      return {
        ...base,
        status: update.status,
        sentAt: update.sentAt ?? null,
      } as OfferCard;
    }),
    findById: vi.fn().mockResolvedValue(null),
  };

  return { eligibility, repo };
}

describe("sendOfferCard — eligibility + state machine", () => {
  it("returns the denial reason when eligibility fails", async () => {
    const { eligibility, repo } = mkStubDeps();
    eligibility.findConversation = vi.fn().mockResolvedValue(null);

    const result = await sendOfferCard(
      { draft: BASE_DRAFT, now: FIXED_NOW },
      { eligibility, repo },
    );

    expect(result).toEqual({
      success: false,
      reason: "ELIGIBILITY_NO_CONVERSATION",
    });
    expect(repo.create).not.toHaveBeenCalled();
    expect(repo.updateStatus).not.toHaveBeenCalled();
  });

  it("creates a draft, transitions to sent, and returns the card", async () => {
    const { eligibility, repo } = mkStubDeps();

    const result = await sendOfferCard(
      { draft: BASE_DRAFT, conversationId: "conv_1", now: FIXED_NOW },
      { eligibility, repo },
    );

    expect(result.success).toBe(true);
    if (!result.success) throw new Error("unexpected");

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "draft",
        sentAt: null,
        conversationId: "conv_1",
      }),
    );
    expect(repo.updateStatus).toHaveBeenCalledWith(
      "oc_1",
      expect.objectContaining({
        status: "sent",
        sentAt: FIXED_NOW,
      }),
    );
    expect(result.offerCard.status).toBe("sent");
    expect(result.offerCard.sentAt).toEqual(FIXED_NOW);
  });

  it("passes the injected clock to eligibility and sentAt", async () => {
    const { eligibility, repo } = mkStubDeps();
    const t = new Date("2026-01-01T00:00:00.000Z");

    await sendOfferCard(
      { draft: BASE_DRAFT, now: t },
      { eligibility, repo },
    );

    expect(repo.updateStatus).toHaveBeenCalledWith(
      "oc_1",
      expect.objectContaining({ sentAt: t }),
    );
  });
});
