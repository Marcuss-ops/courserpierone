-- ============================================================================
-- Migration: 20260715000000_add_notifications
--
-- Centro Notifiche (Bell) Skool-style feature for the
-- (member) course area. Introduces:
--
--   1. Notification            — immutable in-app feed entry for a user
--   2. NotificationPreference  — per-user delivery channel preferences
--                                (email/inapp toggles per category)
--
-- ── Design rationale ──────────────────────────────────────────────────────
--
-- * Single Notification table with polymorphic `entityId` (string).
--   Keeps fan-out cheap (one INSERT per event) and avoids per-type
--   tables that would need JOINs to render the bell dropdown.
--   `type` enum-like string is constrained by the application layer
--   (see src/lib/notifications/create-notification.ts). Future
--   community_reply type is reserved but not fired yet (no
--   CommunityTopic/Post schema).
--
-- * `read` boolean + `readAt` timestamp enables paginated "show
--   last 50" UX without soft-delete semantics. `read=false` rows
--   drive the badge count via the (userId, read) index.
--
-- * NotificationPreference uses userId as PK (1:1 with User). Default
--   all-on so the bell badge works out of the box for new users
--   without an explicit preferences row. create-notification helper
--   auto-creates the row if missing (idempotent upsert).
--
-- * ON DELETE CASCADE on Notification/User — orphaned notifications
--   have no semantic value. NotificationPreference uses CASCADE too
--   so deletion of a User cleans up preferences automatically.
--
-- ── Triggers (V1) ────────────────────────────────────────────────────────
--
--   * chat_reply   — auto, fired from createMessageAndNotify in
--                    src/lib/messaging/create-message.ts (after WS
--                    emit, before email offline-notify).
--   * lesson/course/system  — manual, via admin endpoint
--                             POST /api/admin/notifications/broadcast
--                             (community_reply reserved for V2 once
--                              CommunityTopic/Post schema exists).
--
-- ── Idempotency ──────────────────────────────────────────────────────────
--
-- All DDL uses IF NOT EXISTS / DO $$ blocks. Re-applying this
-- migration on a partially-applied DB is safe.
-- ============================================================================

-- ─── 1. Notification table ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Notification" (
    "id"         TEXT NOT NULL,
    "userId"     TEXT NOT NULL,
    "type"       TEXT NOT NULL,             -- chat_reply | new_lesson | new_course | lesson_update | course_update | system_admin | community_reply
    "entityId"   TEXT NOT NULL,             -- polymorphic ref (messageId, lessonId, productId, ...)
    "title"      TEXT NOT NULL,
    "body"       TEXT,
    "link"       TEXT,                      -- URL dove navigare al click
    "read"       BOOLEAN NOT NULL DEFAULT false,
    "readAt"     TIMESTAMP(3),
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- @@index([userId, read]) — badge counter hot path
--   SELECT count(*) FROM "Notification" WHERE userId = X AND read = false
CREATE INDEX IF NOT EXISTS "Notification_userId_read_idx"
    ON "Notification"("userId", "read");

-- @@index([userId, createdAt]) — dropdown list pagination
--   SELECT * FROM "Notification" WHERE userId = X ORDER BY createdAt DESC LIMIT 50
CREATE INDEX IF NOT EXISTS "Notification_userId_createdAt_idx"
    ON "Notification"("userId", "createdAt");

-- ─── 2. NotificationPreference table ────────────────────────────────────
CREATE TABLE IF NOT EXISTS "NotificationPreference" (
    "userId"              TEXT NOT NULL,
    "emailNewLesson"      BOOLEAN NOT NULL DEFAULT true,
    "emailCommunityReply" BOOLEAN NOT NULL DEFAULT true,
    "inappChatReply"      BOOLEAN NOT NULL DEFAULT true,
    "inappNewLesson"      BOOLEAN NOT NULL DEFAULT true,
    "inappCommunityReply" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("userId")
);

-- ─── 3. Foreign keys (idempotent) ───────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Notification_userId_fkey'
    ) THEN
        ALTER TABLE "Notification"
            ADD CONSTRAINT "Notification_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'NotificationPreference_userId_fkey'
    ) THEN
        ALTER TABLE "NotificationPreference"
            ADD CONSTRAINT "NotificationPreference_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END
$$;
