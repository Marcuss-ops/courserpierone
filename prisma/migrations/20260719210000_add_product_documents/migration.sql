-- MCR Phase 2 — Add ProductDocument (Notion-like long description for
-- product landing pages).
--
-- Conceptually separate from `ContentPage`/`ContentPageTranslation`:
--   - `ContentPage` — the per-product page tree that enrolled students
--     traverse after purchase (the structured student-side content).
--   - `ProductDocument` — the long-form *marketing* description shown on
--     the public product landing page (above the funnel), allowing the
--     seller to attach a rich Notion-like block document instead of a
--     plain "storia"/"description" string.
--
-- One row per (productId, locale). Cascading delete on product removal
-- matches the ContentPage cascade posture. The optional `plainText`
-- column is denormalized for FTS/SEO/AI indexing; nullable for lazy
-- derivation (mirrors ContentPageTranslation.plainText). The READ
-- endpoint trusts writer-side validation (same posture as
-- `resolve-published-content`); future commits add a write use case
-- (mirroring `SaveContentDocument`).

-- CreateTable ProductDocument
CREATE TABLE "ProductDocument" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "document" JSONB NOT NULL,
    "plainText" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductDocument_pkey" PRIMARY KEY ("id")
);

-- CreateUnique on (productId, locale) — one canonical document per locale.
CREATE UNIQUE INDEX "ProductDocument_productId_locale_key" ON "ProductDocument"("productId", "locale");

-- Inverse lookup: "find all documents for a product" (admin tooling, future
-- translation overview). Distinct from the unique (productId, locale) above.
CREATE INDEX "ProductDocument_productId_idx" ON "ProductDocument"("productId");

-- AddForeignKey: ProductDocument → Product
-- Cascade on product removal matches ContentPage's posture: a deleted
-- product also removes its long-form description rows.
ALTER TABLE "ProductDocument" ADD CONSTRAINT "ProductDocument_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
