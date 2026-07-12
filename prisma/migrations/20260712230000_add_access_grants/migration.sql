-- ============================================================================
-- Migration: 20260712230000_add_access_grants
--
-- MCR Phase 2 — Unified access domain.
--
-- Introduces the AccessGrant table as the canonical "is this user
-- authorized to access this product?" tuple. Will be queried by the
-- resolver cutover in PR 3 of MCR (resolved-message-permission.ts
-- still reads Order.status in this PR — additive migration only).
--
-- ── Design rationale ──────────────────────────────────────────────────────
--
-- * sourceType ∈ { "order", "free_enrollment", "admin", "bundle" }
--   The discriminator decouples "where does this access come from"
--   from the actual authorization decision. Future direct grant
--   (admin grants, bundle inclusions) doesn't need Order machinery.
--
-- * @@unique([sourceType, sourceId, productId])
--   Prevents duplicates from legitimate concurrent retries (Order
--   dual-write + backfill script, both upsert). Grant dedupe is by
--   construction: the same source can never grant the same product
--   twice, but different sources CAN coexist (e.g., bundle + admin
--   override). The refund-revoke flow only marks the order-derived
--   grant as revoked, leaving other active grants untouched.
--
-- * ON DELETE RESTRICT on both FKs
--   Matches the project's defensive FK philosophy (see
--   20260712210000_creator_id_required_restrict). Deleting a User
--   or Product requires explicit cleanup scripts, never silent
--   cascade orphans.
--
-- ── Idempotency hardening ────────────────────────────────────────────────
--
-- All DDL uses PG-native "IF NOT EXISTS" guards or DO $$ blocks
-- with constraint-existence checks. Re-applying this migration on a
-- partially-applied DB is safe (e.g., drift after manual psql fix
-- or interrupted Prisma migrate deploy).
-- ============================================================================

-- ─── 1. Table ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "AccessGrant" (
    "id"          TEXT NOT NULL,
    "userId"      TEXT NOT NULL,
    "productId"   TEXT NOT NULL,
    "sourceType"  TEXT NOT NULL,
    "sourceId"    TEXT NOT NULL,
    "status"      TEXT NOT NULL DEFAULT 'active',
    "grantedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt"   TIMESTAMP(3),
    "expiresAt"   TIMESTAMP(3),

    CONSTRAINT "AccessGrant_pkey" PRIMARY KEY ("id")
);

-- ─── 2. Indexes ────────────────────────────────────────────────────────
-- @@unique([sourceType, sourceId, productId]) — Prisma generates
-- the constraint name "AccessGrant_sourceType_sourceId_productId_key".
CREATE UNIQUE INDEX IF NOT EXISTS "AccessGrant_sourceType_sourceId_productId_key"
    ON "AccessGrant"("sourceType", "sourceId", "productId");

-- @@index([userId, productId, status]) — resolver hot path.
CREATE INDEX IF NOT EXISTS "AccessGrant_userId_productId_status_idx"
    ON "AccessGrant"("userId", "productId", "status");

-- ─── 3. Foreign keys (idempotent) ───────────────────────────────────────
-- ON DELETE RESTRICT on both User and Product: deletion requires
-- explicit cleanup, never silent cascade (matches
-- Product_creatorId_fkey Restrict policy from migration
-- 20260712210000_creator_id_required_restrict).

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'AccessGrant_userId_fkey'
    ) THEN
        ALTER TABLE "AccessGrant"
            ADD CONSTRAINT "AccessGrant_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id")
            ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'AccessGrant_productId_fkey'
    ) THEN
        ALTER TABLE "AccessGrant"
            ADD CONSTRAINT "AccessGrant_productId_fkey"
            FOREIGN KEY ("productId") REFERENCES "Product"("id")
            ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END
$$;
