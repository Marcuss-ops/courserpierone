-- ═══════════════════════════════════════════════════════════════
-- Migration: una conversazione per coppia (creator, cliente, prodotto)
-- ═══════════════════════════════════════════════════════════════
-- Questa migration trasforma il modello `Conversation` da "una sola
-- chat globale per coppia di utenti" a "una chat per prodotto acquistato".
--
-- Tre passi:
--
--   1) BACKFILL dei NULL esistenti
--      Per ogni Conversation con productId IS NULL, assegniamo il
--      productId dell'Order completed più recente il cui userId è
--      uno dei due partecipanti. Le Conversation senza alcun Order
--      completed (orfani) vengono eliminate: non hanno contesto
--      creator/cliente legittimo e quindi non appartengono al nuovo
--      modello.
--
--   2) NUOVO UNIQUE CONSTRAINT
--      Sostituiamo `@@unique([userOneId, userTwoId])` con
--      `@@unique([userOneId, userTwoId, productId])`. Adesso Mario e
--      il creator possono avere conversazioni separate per Corsi
--      diversi senza collidere.
--
--   3) productId NON-NULL
--      Sull'API layer Fase 1.5 introdurremo `resolveMessagingPermission`
--      che garantisce l'esistenza di un prodotto valido prima di
--      creare/ricercare Conversation. Lo schema diventa quindi
--      NOT NULL per riflettere questa invariante di dominio.
--
-- NB: il nuovo indice `@@index([productId, updatedAt])` (vedi
-- schema.prisma) viene emesso automaticamente da Prisma in
-- "Add Prisma index" steps subito dopo questo commit. Per evitare
-- drift tra schema e migration, NON creiamo manualmente l'indice qui.
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. BACKFILL productId dai Order completed dei partecipanti ──
UPDATE "Conversation" c
SET "productId" = (
  SELECT o."productId"
  FROM "Order" o
  WHERE o."userId" IN (c."userOneId", c."userTwoId")
    AND o."status" = 'completed'
    AND o."productId" IS NOT NULL
  ORDER BY o."createdAt" DESC
  LIMIT 1
)
WHERE c."productId" IS NULL;

-- Cancella le conversazioni orfane: nessun Order completed lega i
-- due partecipanti a un prodotto reale. Cascade elimina anche i Message.
DELETE FROM "Conversation" WHERE "productId" IS NULL;

-- ─── 2. NUOVO UNIQUE INDEX ─────────────────────────────────────
DROP INDEX IF EXISTS "Conversation_userOneId_userTwoId_key";

CREATE UNIQUE INDEX "Conversation_userOneId_userTwoId_productId_key"
  ON "Conversation"("userOneId", "userTwoId", "productId");

-- ─── 3. productId diventa obbligatorio ─────────────────────────
ALTER TABLE "Conversation" ALTER COLUMN "productId" SET NOT NULL;

-- Aggiorniamo anche l'FK verso Product: il comportamento onDelete
-- passa da SET NULL (vecchia FK nullable) a CASCADE (productId NOT NULL).
ALTER TABLE "Conversation" DROP CONSTRAINT IF EXISTS "Conversation_productId_fkey";

ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;

-- ─── 4. NOTA su indice di lookup per prodotto ─────────────────
-- Il `@@index([productId, updatedAt])` dichiarato in schema.prisma
-- verrà generato da Prisma in una migration di follow-up
-- automatica (Prisma gestisce @@index via "Add Prisma index"). Non
-- includiamo qui CREATE INDEX per non creare drift schema↔SQL.
