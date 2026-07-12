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
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. Aggiunta colonna creatorId (nullable) ────────────────
ALTER TABLE "Product" ADD COLUMN "creatorId" TEXT;

-- ─── 2. FK verso User, ON DELETE SET NULL ────────────────────
-- SetNull preserva i prodotti che hanno ordini o lezioni già emessi
-- se l'account creator viene in futuro eliminato. I prodotti
-- restano "orfani" (senza creator) ma NON vengono persi.
ALTER TABLE "Product"
  ADD CONSTRAINT "Product_creatorId_fkey"
  FOREIGN KEY ("creatorId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── 3. Indice di lookup "prodotti del creator X" ────────────
CREATE INDEX "Product_creatorId_idx" ON "Product"("creatorId");

COMMIT;
