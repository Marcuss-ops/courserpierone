-- Normalize analytics product identity.
-- Canonical meanings:
--   productId         = Product.id
--   productSlug       = Product.slug
--   providerProductId = external provider product/variant identifier
ALTER TABLE "AnalyticEvent" ADD COLUMN "productSlug" TEXT;
ALTER TABLE "AnalyticEvent" ADD COLUMN "providerProductId" TEXT;

-- Repair historical rows that stored Product.id in productId.
UPDATE "AnalyticEvent" ae
SET "productSlug" = p.slug
FROM "Product" p
WHERE ae."productId" = p.id
  AND ae."productSlug" IS NULL;

-- Repair historical rows that stored Product.slug in productId. Keep the
-- original slug in productSlug and restore productId to the internal ID.
UPDATE "AnalyticEvent" ae
SET "productId" = p.id,
    "productSlug" = p.slug
FROM "Product" p
WHERE ae."productId" = p.slug
  AND ae."productSlug" IS NULL;

CREATE INDEX "AnalyticEvent_productSlug_idx" ON "AnalyticEvent"("productSlug");
CREATE INDEX "AnalyticEvent_providerProductId_idx" ON "AnalyticEvent"("providerProductId");
