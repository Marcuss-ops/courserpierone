-- CreateTable
CREATE TABLE "OutboxDeliveryAttempt" (
    "id" TEXT NOT NULL,
    "outboxEventId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "attemptCount" INTEGER NOT NULL DEFAULT 1,
    "lockedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboxDeliveryAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OutboxDeliveryAttempt_outboxEventId_channel_key"
ON "OutboxDeliveryAttempt"("outboxEventId", "channel");
CREATE INDEX "OutboxDeliveryAttempt_status_lockedAt_idx"
ON "OutboxDeliveryAttempt"("status", "lockedAt");

-- AddForeignKey
ALTER TABLE "OutboxDeliveryAttempt"
ADD CONSTRAINT "OutboxDeliveryAttempt_outboxEventId_fkey"
FOREIGN KEY ("outboxEventId") REFERENCES "OutboxEvent"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
