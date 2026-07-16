/**
 * src/domains/automation/prisma-agent-job-repository.ts
 *
 * Phase 5 — Agent Job Prisma Adapter.
 *
 * Implements the `AgentJobRepository` port. Maps between Prisma's
 * camelCase JSON fields and the Domain's snake_case `AgentJobRecord`.
 */

import { prisma } from "@/lib/db/prisma";
import type { Prisma, AgentJob as PrismaAgentJob } from "@prisma/client";
import { AGENT_RUN_STATES, type AgentRunState } from "./agent-run-states";
import type {
  AgentJobRecord,
  AgentJobLastError,
  AgentVerifiableOutput,
} from "./agent-job-record";
import type { AgentJobRepository } from "./agent-job-repository";

function asAgentVerifiableOutput(
  value: Prisma.JsonValue | null,
): AgentVerifiableOutput | undefined {
  if (value === null || value === undefined) return undefined;
  return value as AgentVerifiableOutput;
}

function parseLastError(
  value: unknown,
  fallbackOccurredAt?: Date,
): AgentJobLastError | undefined {
  if (value === null || value === undefined) return undefined;
  const raw = value as { reason?: unknown; message?: unknown; occurred_at?: string | Date };
  return {
    reason: typeof raw.reason === "string" ? raw.reason : "unknown",
    message: typeof raw.message === "string" ? raw.message : "",
    occurred_at: raw.occurred_at
      ? new Date(raw.occurred_at)
      : fallbackOccurredAt ?? new Date(),
  };
}

function toDomain(row: PrismaAgentJob): AgentJobRecord {
  const status = AGENT_RUN_STATES.has(row.status as AgentRunState)
    ? (row.status as AgentRunState)
    : "permanent_failed";
  return {
    id: row.id,
    idempotency_key: row.idempotencyKey,
    agent_id: row.agentId,
    status,
    attempt_count: row.attemptCount,
    max_attempts: row.maxAttempts,
    input: row.input,
    output: row.output ?? undefined,
    verifiable_output: asAgentVerifiableOutput(row.verifiableOutput),
    last_error: parseLastError(row.lastError, row.updatedAt),
    next_attempt_at: row.nextAttemptAt ?? undefined,
    external_operation_id: row.externalOperationId ?? undefined,
    created_by: row.createdBy,
    approved_by: row.approvedBy ?? undefined,
    approved_at: row.approvedAt ?? undefined,
    cancelled_by: row.cancelledBy ?? undefined,
    cancelled_at: row.cancelledAt ?? undefined,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

// Plain mutable fields shared between create and update. Kept as a plain
// object type so it can be spread into create inputs and safely cast to the
// update input.
type AgentJobMutableFields = Pick<
  Prisma.AgentJobUncheckedCreateInput,
  | "agentId"
  | "status"
  | "attemptCount"
  | "maxAttempts"
  | "input"
  | "output"
  | "verifiableOutput"
  | "lastError"
  | "nextAttemptAt"
  | "externalOperationId"
  | "approvedBy"
  | "approvedAt"
  | "cancelledBy"
  | "cancelledAt"
  | "updatedAt"
>;

function toPrismaMutableFields(job: AgentJobRecord): AgentJobMutableFields {
  return {
    agentId: job.agent_id,
    status: job.status,
    attemptCount: job.attempt_count,
    maxAttempts: job.max_attempts,
    input: job.input as Prisma.InputJsonValue,
    output: job.output as Prisma.InputJsonValue | undefined,
    verifiableOutput: job.verifiable_output as Prisma.InputJsonValue | undefined,
    lastError: job.last_error as Prisma.InputJsonValue | undefined,
    nextAttemptAt: job.next_attempt_at,
    externalOperationId: job.external_operation_id,
    approvedBy: job.approved_by,
    approvedAt: job.approved_at,
    cancelledBy: job.cancelled_by,
    cancelledAt: job.cancelled_at,
    updatedAt: job.updated_at,
  };
}

function toPrismaCreate(
  job: AgentJobRecord,
): Prisma.AgentJobUncheckedCreateInput {
  return {
    id: job.id,
    idempotencyKey: job.idempotency_key,
    ...toPrismaMutableFields(job),
    createdBy: job.created_by,
    createdAt: job.created_at,
  };
}

function toPrismaUpdate(
  job: AgentJobRecord,
): Prisma.AgentJobUncheckedUpdateInput {
  return toPrismaMutableFields(job);
}

// ─── Adapter implementation ─────────────────────────────────────────

export const prismaAgentJobRepository: AgentJobRepository = {
  async save(job: AgentJobRecord): Promise<AgentJobRecord> {
    const row = await prisma.agentJob.upsert({
      where: { id: job.id },
      create: toPrismaCreate(job),
      update: toPrismaUpdate(job),
    });
    return toDomain(row);
  },

  async findById(id: string): Promise<AgentJobRecord | null> {
    const row = await prisma.agentJob.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  },

  async findByIdempotencyKey(key: string): Promise<AgentJobRecord | null> {
    const row = await prisma.agentJob.findUnique({
      where: { idempotencyKey: key },
    });
    return row ? toDomain(row) : null;
  },

  async findRetryable({
    limit,
    now,
  }: {
    limit: number;
    now: Date;
  }): Promise<readonly AgentJobRecord[]> {
    const rows = await prisma.agentJob.findMany({
      where: {
        status: "retryable_failed",
        nextAttemptAt: { lte: now },
      },
      orderBy: { nextAttemptAt: "asc" },
      take: limit,
    });
    return rows.map(toDomain);
  },
};

// Re-export mappers for tests that want to exercise mapping in isolation.
export { toDomain as prismaAgentJobToDomain, toPrismaCreate as agentJobRecordToPrismaCreate };
