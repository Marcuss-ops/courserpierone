/**
 * src/domains/messaging/offer-card/send-offer-card.ts
 *
 * Phase 4 — Application use case for sending an Offer Card inside a DM.
 *
 * Orchestrates:
 *   1. Eligibility check (domain rule).
 *   2. State-machine transition draft → sent.
 *   3. Persistence via the OfferCardRepository port.
 *
 * ADR-0016 §1: this file lives in the Application/UseCase layer.
 * It imports the domain policy and the repository port, but NOT the
 * Prisma client directly.
 */

import { randomUUID } from "node:crypto";

import type { EligibilityDenialReason, EligibilityPolicyDeps } from "./offer-eligibility-types";
import { evaluateOfferEligibility } from "./offer-eligibility-policy";
import type { OfferCard, OfferCardDraft } from "./offer-card-types";
import { isValidStatusTransition, toLinkToken } from "./offer-card-discriminator";
import type { OfferCardRepository } from "./offer-card-repository";

export interface SendOfferCardInput {
  /** Pre-validated draft (caller already knows creator/recipient/products). */
  draft: OfferCardDraft;
  /** Optional conversation id to link the card to a DM thread. */
  conversationId?: string;
  /** Injectable clock for deterministic tests. */
  now?: Date;
}

export interface SendOfferCardDeps {
  /** Read-only port consumed by the eligibility policy. */
  eligibility: EligibilityPolicyDeps;
  /** Write port for OfferCard persistence. */
  repo: OfferCardRepository;
}

export type SendOfferCardResult =
  | { success: true; offerCard: OfferCard }
  | { success: false; reason: EligibilityDenialReason };

/**
 * Send an Offer Card: evaluate eligibility, then persist the card
 * with status `sent` and a server-generated opaque link token.
 *
 * The caller (route) is responsible for creating the DM Message that
 * carries the `offerCardId`; this keeps the use case free of
 * messaging side-effects and makes it testable without Message mocks.
 */
export async function sendOfferCard(
  input: SendOfferCardInput,
  deps: SendOfferCardDeps,
): Promise<SendOfferCardResult> {
  const now = input.now ?? new Date();

  const eligibility = await evaluateOfferEligibility(
    { draft: input.draft, now },
    deps.eligibility,
  );

  if (!eligibility.eligible) {
    return { success: false, reason: eligibility.reason };
  }

  const linkToken = toLinkToken(randomUUID());

  // State machine: draft → sent. Persisting as draft first, then
  // transitioning to sent, exercises the canonical state transition
  // and keeps `sentAt` semantically tied to the "sent" event.
  const draftCard = await deps.repo.create({
    creatorId: input.draft.creatorId,
    recipientId: input.draft.recipientId,
    conversationId: input.conversationId ?? null,
    conversationProductId: input.draft.conversationProductId,
    productId: input.draft.productId,
    status: "draft",
    reason: input.draft.reason,
    localizedPrice: input.draft.localizedPrice,
    coupon: input.draft.coupon,
    linkToken,
    sentAt: null,
  });

  if (!isValidStatusTransition(draftCard.status, "sent")) {
    throw new Error(`Illegal OfferCard state transition: ${draftCard.status} -> sent`);
  }

  const offerCard = await deps.repo.updateStatus(draftCard.id, {
    status: "sent",
    sentAt: now,
  });

  return { success: true, offerCard };
}
