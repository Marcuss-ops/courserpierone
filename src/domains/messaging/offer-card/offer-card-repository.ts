/**
 * src/domains/messaging/offer-card/offer-card-repository.ts
 *
 * Phase 4 — Offer Card persistence port (Domain layer).
 *
 * ADR-0016 §1: this file contains ONLY the port contract + input
 * types. The Prisma adapter lives in `prisma-offer-card-repository.ts`.
 */

import type { LinkToken, OfferCardStatus } from "./offer-card-discriminator";
import type { LocalizedPrice, OfferCard, OfferCoupon, OfferReason } from "./offer-card-types";

export interface CreateOfferCardInput {
  creatorId: string;
  recipientId: string;
  conversationId: string | null;
  conversationProductId: string;
  productId: string;
  status: OfferCardStatus;
  reason: OfferReason;
  localizedPrice: LocalizedPrice;
  coupon?: OfferCoupon;
  linkToken: LinkToken;
  sentAt: Date | null;
}

export interface UpdateOfferCardStatusInput {
  status: OfferCardStatus;
  sentAt?: Date;
  convertedAt?: Date;
  convertedOrderId?: string;
}

/**
 * Persistence port for OfferCard. The domain use case depends on
 * this interface; the Prisma adapter implements it.
 */
export interface OfferCardRepository {
  create(input: CreateOfferCardInput): Promise<OfferCard>;
  updateStatus(id: string, input: UpdateOfferCardStatusInput): Promise<OfferCard>;
  findById(id: string): Promise<OfferCard | null>;
}
