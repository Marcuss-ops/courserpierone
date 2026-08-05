-- Make webhook idempotency reservations observable and retryable.
ALTER TABLE "ProcessedWebhook"
  ALTER COLUMN "processedAt" DROP NOT NULL,
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'completed',
  ADD COLUMN "payloadHash" TEXT,
  ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "lastError" TEXT,
  ADD COLUMN "processingStartedAt" TIMESTAMP(3),
  ADD COLUMN "completedAt" TIMESTAMP(3),
  ADD COLUMN "failedAt" TIMESTAMP(3),
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Rows written by the previous implementation are already successful.
UPDATE "ProcessedWebhook"
SET "completedAt" = COALESCE("processedAt", "createdAt")
WHERE "status" = 'completed';

CREATE INDEX "ProcessedWebhook_status_updatedAt_idx"
  ON "ProcessedWebhook"("status", "updatedAt");
