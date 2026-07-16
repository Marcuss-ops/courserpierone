-- Migration: add AgentJob table (Phase 5 — draft-first agent flow)

CREATE TABLE "AgentJob" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL,
    "input" JSONB NOT NULL,
    "output" JSONB,
    "verifiableOutput" JSONB,
    "lastError" JSONB,
    "nextAttemptAt" TIMESTAMP(3),
    "externalOperationId" TEXT,
    "createdBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "cancelledBy" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentJob_pkey" PRIMARY KEY ("id")
);

-- Unique idempotency key per job
CREATE UNIQUE INDEX "AgentJob_idempotencyKey_key" ON "AgentJob"("idempotencyKey");

-- Worker polling: find retryable jobs ordered by next attempt
CREATE INDEX "AgentJob_status_nextAttemptAt_idx" ON "AgentJob"("status", "nextAttemptAt");

-- Dashboard / admin filters by agent + status
CREATE INDEX "AgentJob_agentId_status_idx" ON "AgentJob"("agentId", "status");

-- Foreign keys to User (Restrict on creator delete, SetNull on approver/canceller)
ALTER TABLE "AgentJob" ADD CONSTRAINT "AgentJob_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AgentJob" ADD CONSTRAINT "AgentJob_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgentJob" ADD CONSTRAINT "AgentJob_cancelledBy_fkey" FOREIGN KEY ("cancelledBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
