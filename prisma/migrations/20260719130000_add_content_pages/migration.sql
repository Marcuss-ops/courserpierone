-- MCR Phase 1 — Add ContentPage + ContentPageTranslation (Notion-like pages)
-- Hand-written because local env cannot run `prisma migrate dev` (no
-- interactive shell) and `prisma migrate diff --from-migrations` requires
-- --shadow-database-url. DDL below matches Prisma's standard output for the
-- schema additions: two CreateTable blocks, four indexes (1 unique on
-- pages, 2 indexes on pages, 1 unique + 1 index on translations), and
-- three AddForeignKey statements (one for product, one for parent self-FK,
-- one for translation page).

-- CreateTable ContentPage
CREATE TABLE "ContentPage" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "parentId" TEXT,
    "slug" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable ContentPageTranslation
CREATE TABLE "ContentPageTranslation" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "document" JSONB NOT NULL,
    "plainText" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ContentPageTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex on ContentPage
CREATE UNIQUE INDEX "ContentPage_productId_slug_key" ON "ContentPage"("productId", "slug");

-- Index for canonical tree traversal order
CREATE INDEX "ContentPage_productId_parentId_position_idx" ON "ContentPage"("productId", "parentId", "position");

-- CreateIndex + CreateUnique on ContentPageTranslation
CREATE UNIQUE INDEX "ContentPageTranslation_pageId_locale_key" ON "ContentPageTranslation"("pageId", "locale");

-- Inverse lookup index: find all translations for a pageId
CREATE INDEX "ContentPageTranslation_pageId_idx" ON "ContentPageTranslation"("pageId");

-- AddForeignKey: ContentPage → Product (Cascade, matches Conversation pattern)
ALTER TABLE "ContentPage" ADD CONSTRAINT "ContentPage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: ContentPage → self (parent FK, Cascade; deleting a parent silently removes its sub-tree)
ALTER TABLE "ContentPage" ADD CONSTRAINT "ContentPage_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ContentPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: ContentPageTranslation → ContentPage (Cascade)
ALTER TABLE "ContentPageTranslation" ADD CONSTRAINT "ContentPageTranslation_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "ContentPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
