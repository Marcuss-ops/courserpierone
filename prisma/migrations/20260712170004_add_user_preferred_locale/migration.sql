-- ═══════════════════════════════════════════════════════════════
-- Migration: User.preferredLocale (Phase 1.2 addendum del piano DMs)
-- ═══════════════════════════════════════════════════════════════
-- Aggiunge la colonna User.preferredLocale nullable con default 'en'
-- per le email di notifica localizzate (DM offline + future use cases).
-- La colonna è valorizzata:
--   1. Schema-level default 'en' per le righe esistenti (migrate deploy).
--   2. Schema-level default 'en' per nuovi INSERT senza explicit value.
--   3. signup backfill: getServerUser (OAuth callback flow) e
--      order-service (guest checkout) scrivono il primo segmento
--      Accept-Language al primo user-create (mai sull'update,
--      per preservare la scelta manuale dell'utente).
--   4. Future profile/settings page per override manuale.
--
-- ═══ Hardening (idempotency wrapper) ═══════════════════════════
-- Wrapped in IF NOT EXISTS per rendere la migration safe da re-run
-- accidentale (CI retry, prisma migrate reset su DB pre-popolato,
-- ri-deploy dopo parziale failure).
--
--   - ADD COLUMN IF NOT EXISTS       (PG ≥9.6 native)
--   - UPDATE WHERE preferredLocale IS NULL → idempotent backfill
--     (se la colonna esiste già e ha NULL legacy, li valorizza.
--      Se le righe hanno già il default, l'UPDATE è no-op.)
--
-- Il file modificato invalida il checksum Prisma (vedi
-- `_prisma_migrations`). I DB dove questa migration è già stata
-- applicata devono eseguire, prima del prossimo deploy:
--
--     npx prisma migrate resolve --applied 20260712170004_add_user_preferred_locale
--
-- per marcare il nuovo checksum come "già applicato" e silenziare
-- il warning di drift. Fresh DB eseguono la versione idempotente
-- senza intervento manuale.
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. Aggiunta colonna preferredLocale (nullable + default 'en') ────
-- IF NOT EXISTS supportato nativamente in Postgres ≥9.6. Il
-- progetto target è Postgres 16 (vedi docker-compose.yml).
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "preferredLocale" TEXT DEFAULT 'en';

-- ─── 2. Backfill difensivo: righe NULL pre-migration → 'en' ──────────
-- Questo UPDATE è idempotente: se preferredLocale è già valorizzato
-- (perché la colonna esiste già da qualche esecuzione precedente, o
-- per il default Postgres), il WHERE IS NULL è no-op.
--
-- NB: in Prisma la mappa @default("en") Valorizza la colonna al
-- momento dell'ADD COLUMN, quindi in condizioni normali questo
-- UPDATE è un safety net per scenari legacy (es. migration applicata
-- manualmente con `prisma db push --accept-data-loss`).
UPDATE "User"
  SET "preferredLocale" = 'en'
  WHERE "preferredLocale" IS NULL;

COMMIT;
