-- ============================================================================
-- Migration: 20260712210000_creator_id_required_restrict
--
-- Fase 4 hardening: Product.creatorId IS NOT NULL + FK Restrict.
--
-- Self-defending:
--   La prima ALTER COLUMN fallirà loudmente con PG constraint violation
--   se qualche riga ha ancora creatorId IS NULL (la query del prerequisite
--   audit `scripts/audit-v1-readiness.ts` conferma zero orphans). Eseguire
--   recovery pre-migration via scripts/products/backfill-primary-creator.ts
--   (versione mutante pre-fase 4) prima di applicare questa migration.
--
-- Allinea schema.prisma `Product.creatorId String` + `creator User @relation
-- "...onDelete: Restrict)`. Rimuove il legacy fallback al "primo admin"
-- dal resolver `resolve-message-permission.ts`.
--
-- Safe to re-run:
--   - `SET NOT NULL` su colonna già NOT NULL è idempotente (no-op).
--   - `DROP CONSTRAINT IF EXISTS` gestisce re-application.
--   - `ADD CONSTRAINT` riapplica il vincolo appena droppato; ok se
--     facciamo rollback+riapply nello stesso deploy.
-- ============================================================================

-- Phase 1: Promote FK column to NOT NULL.
ALTER TABLE "Product" ALTER COLUMN "creatorId" SET NOT NULL;

-- Phase 2: Recreate FK with ON DELETE RESTRICT (replaces legacy SetNull).
-- Prisma constraint naming convention for Product.creatorId is
-- `Product_creatorId_fkey` (snake_case <Table>_<column>_fkey).
ALTER TABLE "Product" DROP CONSTRAINT IF EXISTS "Product_creatorId_fkey";

ALTER TABLE "Product"
  ADD CONSTRAINT "Product_creatorId_fkey"
  FOREIGN KEY ("creatorId")
  REFERENCES "User"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;
