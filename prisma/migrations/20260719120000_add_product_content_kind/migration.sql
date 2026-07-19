-- AlterTable
ALTER TABLE "Product" ADD COLUMN "contentKind" TEXT NOT NULL DEFAULT 'video_course';

-- ─── MCR Step 12 — Product.contentKind SSOT discriminator ─────────
-- This is the new canonical product-type slot. Values are validated
-- app-side (NOT a Prisma enum) by `src/domains/catalog/content-type-registry.ts`
-- — the schema column is intentionally a plain TEXT with a DEFAULT to
-- allow future extensions (e.g. "podcast", "audiobook", "live_cohort")
-- without DB migrations, matching the `Product.status` pattern.
--
-- Existing rows get auto-backfilled with the literal 'video_course'
-- (Postgres ≥11 fast metadata-only column add — no full-table
-- rewrite). New rows may omit the field and rely on the DEFAULT.
--
-- The Zod registry already lists 'video_course' as a valid ContentKind
-- (added in the same atomic PR); the Prisma client auto-generated
-- for this schema will expose `prisma.product.create({data:{...,
-- contentKind: 'video_course'}})` and the DB reads will use the
-- enum-typed column accessor naturally.
