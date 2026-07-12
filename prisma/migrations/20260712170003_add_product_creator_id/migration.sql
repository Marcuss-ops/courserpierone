-- ═══════════════════════════════════════════════════════════════
-- Migration: Product.creatorId (Phase 1.2 del piano DMs)
-- ═══════════════════════════════════════════════════════════════
-- Aggiunge la colonna Product.creatorId nullable, la FK verso User
-- con ON DELETE SET NULL (preserve prodotti storici quando un
-- account admin/creator viene eliminato, scelta safety-first per
-- gli ordini e le lezioni già emesse), e un indice per le query
-- "tutti i prodotti del creator X".
--
-- Il BACKFILL della colonna NON viene eseguito qui: è responsabilità
-- della Fase 1.4 (segnare uno o più admin come creator primario e
-- assegnare tutti i prodotti esistenti). Tutti gli usi esistenti di
-- Product continuano a funzionare con creatorId NULL — la
-- risoluzione effettiva del creator avverrà via fallback documentato
-- nel permission resolver di Fase 1.5 (es. "se Product.creatorId IS
-- NULL, prendi designato admin").
--
-- ═══ Hardening (idempotency wrapper) ═══════════════════════════
-- Wrapped in IF NOT EXISTS / DO block per rendere la migration
-- safe da re-run accidentale (CI retry, prisma migrate reset su
-- DB pre-popolato, ri-deploy dopo parziale failure). Tutti e tre
-- gli statements sono no-op se già applicati:
--
--   - ADD COLUMN IF NOT EXISTS       (PG ≥9.6 native)
--   - ADD CONSTRAINT wrappato in DO $$ ... END $$ con lookup
--     sulla system catalog `pg_constraint` (le CONSTRAINT non
--     supportano IF NOT EXISTS nativo; richiedono plpgsql block)
--   - CREATE INDEX IF NOT EXISTS     (tutte le versioni PG)
--
-- Il file modificato invalida il checksum Prisma (vedi
-- `_prisma_migrations`). I DB dove questa migration è già stata
-- applicata devono eseguire, prima del prossimo deploy:
--
--     npx prisma migrate resolve --applied 20260712170003_add_product_creator_id
--
-- per marcare il nuovo checksum come "già applicato" e silenziare
-- il warning di drift. Fresh DB (staging, preview, init locale)
-- eseguono la versione idempotente e ne traggono il beneficio
-- re-run-safe senza alcun intervento manuale.
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. Aggiunta colonna creatorId (nullable) ────────────────
-- IF NOT EXISTS supportato nativamente in Postgres ≥9.6. Il
-- progetto target è Postgres 16 (vedi docker-compose.yml), ma
-- scriviamo SQL portabile per coprire anche staging o future
-- versioni regression.
ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS "creatorId" TEXT;

-- ─── 2. FK verso User, ON DELETE SET NULL ────────────────────
-- SetNull preserva i prodotti che hanno ordini o lezioni già
-- emessi se l'account creator viene in futuro eliminato. I
-- prodotti restano "orfani" (senza creator) ma NON vengono persi.
--
-- Le CONSTRAINT Postgres non supportano `IF NOT EXISTS` nativo
-- (nemmeno in PG ≥16). Workaround canonico: wrappare in un DO
-- block che interroga `pg_constraint` prima di emettere
-- ADD CONSTRAINT. Il DO block è atomico e vive nella stessa
-- transaction esterna (BEGIN/COMMIT sopra).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Product_creatorId_fkey'
      AND conrelid = '"Product"'::regclass
  ) THEN
    ALTER TABLE "Product"
      ADD CONSTRAINT "Product_creatorId_fkey"
      FOREIGN KEY ("creatorId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- ─── 3. Indice di lookup "prodotti del creator X" ────────────
-- IF NOT EXISTS supportato nativamente in tutte le versioni PG.
CREATE INDEX IF NOT EXISTS "Product_creatorId_idx"
  ON "Product"("creatorId");

COMMIT;
