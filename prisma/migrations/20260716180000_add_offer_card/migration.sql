-- ============================================================================
-- Migration: 20260716180000_add_offer_card
--
-- Phase 4 — DM commercial Offer Cards.
--
-- Stores upsell offers sent by a creator to a recipient inside an
-- context of an existing conversation. Status follows the canonical
-- state machine in src/domains/messaging/offer-card/offer-card-discriminator.ts.
-- The linkToken is opaque and unique, enforcing the "no free commercial
-- URLs in messages" rule.
--
-- Idempotency: all DDL uses IF NOT EXISTS / DO $$ blocks so the
-- migration can be re-applied safely.
-- ============================================================================

-- ─── OfferCard table ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "OfferCard" (
    "id"                    TEXT NOT NULL,
    "creatorId"             TEXT NOT NULL,
    "recipientId"           TEXT NOT NULL,
    "conversationId"        TEXT,
    "conversationProductId" TEXT NOT NULL,
    "productId"             TEXT NOT NULL,
    "status"                TEXT NOT NULL DEFAULT 'draft',
    "reason"                TEXT NOT NULL,
    "currency"              TEXT NOT NULL,
    "amountCents"           INTEGER NOT NULL,
    "couponCode"            TEXT,
    "couponType"            TEXT,
    "couponValue"           INTEGER,
    "linkToken"             TEXT NOT NULL,
    "sentAt"                TIMESTAMP(3),
    "convertedAt"           TIMESTAMP(3),
    "convertedOrderId"      TEXT,
    "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfferCard_pkey" PRIMARY KEY ("id")
);

-- @@unique([linkToken]) — opaque token lookup for authenticated routes
CREATE UNIQUE INDEX IF NOT EXISTS "OfferCard_linkToken_key"
    ON "OfferCard"("linkToken");

-- @@index([recipientId, createdAt]) — frequency-window eligibility query
CREATE INDEX IF NOT EXISTS "OfferCard_recipientId_createdAt_idx"
    ON "OfferCard"("recipientId", "createdAt");

-- @@index([creatorId, productId]) — creator dashboard / analytics queries
CREATE INDEX IF NOT EXISTS "OfferCard_creatorId_productId_idx"
    ON "OfferCard"("creatorId", "productId");

-- ─── Foreign keys (idempotent) ───────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'OfferCard_creatorId_fkey'
    ) THEN
        ALTER TABLE "OfferCard"
            ADD CONSTRAINT "OfferCard_creatorId_fkey"
            FOREIGN KEY ("creatorId") REFERENCES "User"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'OfferCard_recipientId_fkey'
    ) THEN
        ALTER TABLE "OfferCard"
            ADD CONSTRAINT "OfferCard_recipientId_fkey"
            FOREIGN KEY ("recipientId") REFERENCES "User"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'OfferCard_conversationId_fkey'
    ) THEN
        ALTER TABLE "OfferCard"
            ADD CONSTRAINT "OfferCard_conversationId_fkey"
            FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'OfferCard_productId_fkey'
    ) THEN
        ALTER TABLE "OfferCard"
            ADD CONSTRAINT "OfferCard_productId_fkey"
            FOREIGN KEY ("productId") REFERENCES "Product"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END
$$;
