-- ============================================================================
-- Migration: 20260716190000_add_offer_card_to_message
--
-- Links a Message to an optional OfferCard. This allows an offer card
-- to be delivered inside a DM thread without embedding a commercial
-- URL in the message content.
--
-- Idempotency: all DDL uses IF NOT EXISTS / DO $$ blocks.
-- ============================================================================

-- Add the optional foreign-key column
ALTER TABLE "Message"
    ADD COLUMN IF NOT EXISTS "offerCardId" TEXT;

-- @@index([offerCardId]) — lookup messages by offer card
CREATE INDEX IF NOT EXISTS "Message_offerCardId_idx"
    ON "Message"("offerCardId");

-- Foreign key to OfferCard (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Message_offerCardId_fkey'
    ) THEN
        ALTER TABLE "Message"
            ADD CONSTRAINT "Message_offerCardId_fkey"
            FOREIGN KEY ("offerCardId") REFERENCES "OfferCard"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END
$$;
