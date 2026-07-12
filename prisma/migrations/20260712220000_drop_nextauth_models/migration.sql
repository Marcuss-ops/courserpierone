-- ============================================================================
-- Migration: 20260712220000_drop_nextauth_models
--
-- Drop delle 3 tabelle NextAuth (Account, Session, VerificationToken)
-- post Supabase Auth migration. Auth è 100% Supabase Auth da V1.5+;
-- i modelli sono debito puro (occupano spazio + mascherano RLS regression
-- + complicano la evolution di User). Nessun codice applicativo li
-- referenzia post-drop (scripts/audit-v1-readiness.ts ha già rimosso i
-- count references; src/lib/auth/README.md non li cita più; get-user
-- smoke test post-NextAuth-drop è in src/lib/supabase/get-user.test.ts).
--
-- Self-defending: BAD. DROP TABLE IF EXISTS rende idempotente — se
-- l'operatore ri-applica la migration dopo un primo successo, le
-- DROP ritornano silenziosamente (IF EXISTS). Eseguire la migration una
-- volta sola è sufficiente.
--
-- CASCADE on DROP:
--   Sicuro perché nessun FK incoming punta a queste tabelle (relazioni
--   nel model User rimosse dal schema Prisma nella stessa commit).
--   In particolare:
--     - Delete su Account aveva `user User @relation(userId, onDelete: Cascade)`.
--       Rimosso.
--     - Delete su Session aveva `user User @relation(userId, onDelete: Cascade)`.
--       Rimosso.
--   Sui FK outgoing: solo Account.userId → User.id e Session.userId →
--   User.id — entrambi droppati con questo comando.
--
-- Non tocca i dati di altre tabelle (User, Message, Conversation, ecc.).
-- ============================================================================

DROP TABLE IF EXISTS "Account" CASCADE;
DROP TABLE IF EXISTS "Session" CASCADE;
DROP TABLE IF EXISTS "VerificationToken" CASCADE;
