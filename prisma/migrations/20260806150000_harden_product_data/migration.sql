-- Product data hardening: JSONB, state invariants, soft-delete, and safe product retention.
-- The preflight blocks deliberately fail before schema changes when legacy data
-- is malformed or outside the canonical application contracts.

DO $$
DECLARE
  product_row RECORD;
  entry RECORD;
  parsed_prices jsonb;
  parsed_countries jsonb;
  parsed_price numeric;
BEGIN
  FOR product_row IN
    SELECT id, "pricesByCurrency", "countryOverrides"
    FROM "Product"
    WHERE "pricesByCurrency" IS NOT NULL
       OR "countryOverrides" IS NOT NULL
  LOOP
    IF product_row."pricesByCurrency" IS NOT NULL THEN
      BEGIN
        parsed_prices := product_row."pricesByCurrency"::jsonb;
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'Product % has invalid pricesByCurrency JSON: %', product_row.id, SQLERRM;
      END;

      IF jsonb_typeof(parsed_prices) IS DISTINCT FROM 'object'
         AND jsonb_typeof(parsed_prices) IS DISTINCT FROM 'null' THEN
        RAISE EXCEPTION 'Product % has non-object pricesByCurrency JSON', product_row.id;
      END IF;

      IF jsonb_typeof(parsed_prices) = 'object' THEN
        FOR entry IN SELECT value FROM jsonb_each(parsed_prices)
        LOOP
          IF jsonb_typeof(entry.value) IS DISTINCT FROM 'object'
             OR NOT (entry.value ? 'price')
             OR jsonb_typeof(entry.value->'price') IS DISTINCT FROM 'number'
             OR (entry.value ? 'symbol'
                 AND jsonb_typeof(entry.value->'symbol') IS DISTINCT FROM 'string')
             OR (entry.value ? 'lemonVariantId'
                 AND jsonb_typeof(entry.value->'lemonVariantId') NOT IN ('string', 'null'))
          THEN
            RAISE EXCEPTION 'Product % has invalid pricesByCurrency entry: %', product_row.id, entry.value;
          END IF;

          BEGIN
            parsed_price := (entry.value->>'price')::numeric;
          EXCEPTION WHEN others THEN
            RAISE EXCEPTION 'Product % has invalid pricesByCurrency price: %', product_row.id, entry.value;
          END;

          IF parsed_price < 0 OR parsed_price <> trunc(parsed_price) THEN
            RAISE EXCEPTION 'Product % has invalid pricesByCurrency price: %', product_row.id, entry.value;
          END IF;
        END LOOP;
      END IF;
    END IF;

    IF product_row."countryOverrides" IS NOT NULL THEN
      BEGIN
        parsed_countries := product_row."countryOverrides"::jsonb;
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'Product % has invalid countryOverrides JSON: %', product_row.id, SQLERRM;
      END;

      IF jsonb_typeof(parsed_countries) IS DISTINCT FROM 'object'
         AND jsonb_typeof(parsed_countries) IS DISTINCT FROM 'null' THEN
        RAISE EXCEPTION 'Product % has non-object countryOverrides JSON', product_row.id;
      END IF;

      IF jsonb_typeof(parsed_countries) = 'object' THEN
        FOR entry IN SELECT value FROM jsonb_each(parsed_countries)
        LOOP
          IF jsonb_typeof(entry.value) IS DISTINCT FROM 'object'
             OR NOT (entry.value ? 'currency')
             OR jsonb_typeof(entry.value->'currency') IS DISTINCT FROM 'string'
             OR length(entry.value->>'currency') <> 3
             OR NOT (entry.value ? 'price')
             OR jsonb_typeof(entry.value->'price') IS DISTINCT FROM 'number'
             OR (entry.value ? 'symbol'
                 AND jsonb_typeof(entry.value->'symbol') IS DISTINCT FROM 'string')
             OR (entry.value ? 'lemonVariantId'
                 AND jsonb_typeof(entry.value->'lemonVariantId') NOT IN ('string', 'null'))
          THEN
            RAISE EXCEPTION 'Product % has invalid countryOverrides entry: %', product_row.id, entry.value;
          END IF;

          BEGIN
            parsed_price := (entry.value->>'price')::numeric;
          EXCEPTION WHEN others THEN
            RAISE EXCEPTION 'Product % has invalid countryOverrides price: %', product_row.id, entry.value;
          END;

          IF parsed_price < 0 OR parsed_price <> trunc(parsed_price) THEN
            RAISE EXCEPTION 'Product % has invalid countryOverrides price: %', product_row.id, entry.value;
          END IF;
        END LOOP;
      END IF;
    END IF;
  END LOOP;
END $$;

-- Legacy JSON null sentinels represent absent optional values. Normalize them
-- to SQL NULL so the post-migration object-or-NULL contract is consistent with
-- Prisma DbNull writes.
UPDATE "Product"
SET "pricesByCurrency" = NULL
WHERE "pricesByCurrency" IS NOT NULL
  AND "pricesByCurrency"::jsonb = 'null'::jsonb;

UPDATE "Product"
SET "countryOverrides" = NULL
WHERE "countryOverrides" IS NOT NULL
  AND "countryOverrides"::jsonb = 'null'::jsonb;

-- Validate existing economic state values before adding database CHECKs.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "Product"
    WHERE "status" IS NULL OR "status" NOT IN ('draft', 'published', 'archived')
  ) THEN
    RAISE EXCEPTION 'Product contains an unsupported status';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "Order"
    WHERE "status" IS NULL OR "status" NOT IN ('pending', 'completed', 'failed', 'refunded')
  ) THEN
    RAISE EXCEPTION 'Order contains an unsupported status';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "AccessGrant"
    WHERE "sourceType" IS NULL
       OR "sourceType" NOT IN ('order', 'free_enrollment', 'admin', 'bundle', 'watchlist')
  ) THEN
    RAISE EXCEPTION 'AccessGrant contains an unsupported sourceType';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "AccessGrant"
    WHERE "status" IS NULL OR "status" NOT IN ('active', 'revoked', 'expired')
  ) THEN
    RAISE EXCEPTION 'AccessGrant contains an unsupported status';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "OutboxEvent"
    WHERE "status" IS NULL
       OR "status" NOT IN ('pending', 'processing', 'completed', 'retryable', 'dead_letter')
  ) THEN
    RAISE EXCEPTION 'OutboxEvent contains an unsupported status';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "OutboxDeliveryAttempt"
    WHERE "status" IS NULL OR "status" NOT IN ('processing', 'sent', 'failed', 'uncertain')
  ) THEN
    RAISE EXCEPTION 'OutboxDeliveryAttempt contains an unsupported status';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "ProcessedWebhook"
    WHERE "status" IS NULL
       OR "status" NOT IN ('processing', 'completed', 'ignored_unsupported', 'failed', 'retryable')
  ) THEN
    RAISE EXCEPTION 'ProcessedWebhook contains an unsupported status';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "OfferCard"
    WHERE "status" IS NULL
       OR "status" NOT IN ('draft', 'sent', 'viewed', 'clicked', 'converted', 'expired', 'withdrawn')
  ) THEN
    RAISE EXCEPTION 'OfferCard contains an unsupported status';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "AbandonedCheckout"
    WHERE "status" IS NULL OR "status" NOT IN ('pending', 'recovered', 'expired')
  ) THEN
    RAISE EXCEPTION 'AbandonedCheckout contains an unsupported status';
  END IF;
END $$;

ALTER TABLE "Product"
  ALTER COLUMN "pricesByCurrency" TYPE JSONB
    USING "pricesByCurrency"::jsonb,
  ALTER COLUMN "countryOverrides" TYPE JSONB
    USING "countryOverrides"::jsonb,
  ADD COLUMN "deletedAt" TIMESTAMP(3);

ALTER TABLE "Conversation" DROP CONSTRAINT IF EXISTS "Conversation_productId_fkey";
ALTER TABLE "Conversation"
  ADD CONSTRAINT "Conversation_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Product"
  ADD CONSTRAINT "Product_status_check"
  CHECK ("status" IN ('draft', 'published', 'archived')),
  ADD CONSTRAINT "Product_json_pricesByCurrency_check"
  CHECK ("pricesByCurrency" IS NULL OR jsonb_typeof("pricesByCurrency") = 'object'),
  ADD CONSTRAINT "Product_json_countryOverrides_check"
  CHECK ("countryOverrides" IS NULL OR jsonb_typeof("countryOverrides") = 'object');

ALTER TABLE "Order"
  ADD CONSTRAINT "Order_status_check"
  CHECK ("status" IN ('pending', 'completed', 'failed', 'refunded'));

ALTER TABLE "AccessGrant"
  ADD CONSTRAINT "AccessGrant_sourceType_check"
  CHECK ("sourceType" IN ('order', 'free_enrollment', 'admin', 'bundle', 'watchlist')),
  ADD CONSTRAINT "AccessGrant_status_check"
  CHECK ("status" IN ('active', 'revoked', 'expired'));

ALTER TABLE "OutboxEvent"
  ADD CONSTRAINT "OutboxEvent_status_check"
  CHECK ("status" IN ('pending', 'processing', 'completed', 'retryable', 'dead_letter'));

ALTER TABLE "OutboxDeliveryAttempt"
  ADD CONSTRAINT "OutboxDeliveryAttempt_status_check"
  CHECK ("status" IN ('processing', 'sent', 'failed', 'uncertain'));

ALTER TABLE "ProcessedWebhook"
  ADD CONSTRAINT "ProcessedWebhook_status_check"
  CHECK ("status" IN ('processing', 'completed', 'ignored_unsupported', 'failed', 'retryable'));

ALTER TABLE "OfferCard"
  ADD CONSTRAINT "OfferCard_status_check"
  CHECK ("status" IN ('draft', 'sent', 'viewed', 'clicked', 'converted', 'expired', 'withdrawn'));

ALTER TABLE "AbandonedCheckout"
  ADD CONSTRAINT "AbandonedCheckout_status_check"
  CHECK ("status" IN ('pending', 'recovered', 'expired'));

CREATE INDEX "Product_deletedAt_idx" ON "Product"("deletedAt");
