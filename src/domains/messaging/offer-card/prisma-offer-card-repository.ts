/**
 * src/domains/messaging/offer-card/prisma-offer-card-repository.ts
 *
 * Phase 4 — Prisma adapter for OfferCard persistence.
 *
 * ADR-0016 §1: this file lives in the Adapter layer and is the ONLY
 * file in the offer-card domain that imports `@prisma/client`.
 */

import { prisma } from "@/lib/db/prisma";
import type {
  CreateOfferCardInput,
  OfferCardRepository,
  UpdateOfferCardStatusInput,
} from "./offer-card-repository";
import type { OfferCard } from "./offer-card-types";
import { isValidOfferCardStatus } from "./offer-card-discriminator";

function toDomain(row: {
  id: string;
  creatorId: string;
  recipientId: string;
  conversationId: string | null;
  conversationProductId: string;
  productId: string;
  status: string;
  reason: string;
  currency: string;
  amountCents: number;
  couponCode: string | null;
  couponType: string | null;
  couponValue: number | null;
  linkToken: string;
  sentAt: Date | null;
  convertedAt: Date | null;
  convertedOrderId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): OfferCard {
  if (!isValidOfferCardStatus(row.status)) {
    throw new Error(`Invalid OfferCard.status stored in DB: ${row.status}`);
  }
  return {
    id: row.id,
    creatorId: row.creatorId as OfferCard["creatorId"],
    recipientId: row.recipientId as OfferCard["recipientId"],
    conversationProductId: row.conversationProductId as OfferCard["conversationProductId"],
    productId: row.productId as OfferCard["productId"],
    localizedPrice: {
      currency: row.currency,
      amountCents: row.amountCents,
    },
    reason: row.reason as OfferCard["reason"],
    coupon:
      row.couponCode != null
        ? {
            code: row.couponCode,
            type: row.couponType === "percent" ? "percent" : "fixed",
            value: row.couponValue ?? 0,
          }
        : undefined,
    status: row.status,
    linkToken: row.linkToken as OfferCard["linkToken"],
    createdAt: row.createdAt,
    sentAt: row.sentAt,
    convertedAt: row.convertedAt,
    convertedOrderId: row.convertedOrderId,
  };
}

export const prismaOfferCardRepository: OfferCardRepository = {
  async create(input: CreateOfferCardInput): Promise<OfferCard> {
    const row = await prisma.offerCard.create({
      data: {
        creatorId: input.creatorId,
        recipientId: input.recipientId,
        conversationId: input.conversationId,
        conversationProductId: input.conversationProductId,
        productId: input.productId,
        status: input.status,
        reason: input.reason,
        currency: input.localizedPrice.currency,
        amountCents: input.localizedPrice.amountCents,
        couponCode: input.coupon?.code,
        couponType: input.coupon?.type,
        couponValue: input.coupon?.value,
        linkToken: input.linkToken,
        sentAt: input.sentAt,
      },
    });
    return toDomain(row);
  },

  async updateStatus(id: string, input: UpdateOfferCardStatusInput): Promise<OfferCard> {
    const row = await prisma.offerCard.update({
      where: { id },
      data: {
        status: input.status,
        sentAt: input.sentAt,
        convertedAt: input.convertedAt,
        convertedOrderId: input.convertedOrderId,
      },
    });
    return toDomain(row);
  },

  async findById(id: string): Promise<OfferCard | null> {
    const row = await prisma.offerCard.findUnique({
      where: { id },
    });
    if (!row) return null;
    return toDomain(row);
  },
};
