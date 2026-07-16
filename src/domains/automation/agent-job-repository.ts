/**
 * src/domains/automation/agent-job-repository.ts
 *
 * Phase 5 — Agent Job Repository Port.
 *
 * Pure TypeScript interface for persisting and retrieving AgentJob
 * records. The Domain layer depends on this port; the Prisma adapter
 * in `prisma-agent-job-repository.ts` implements it.
 */

import type { AgentJobRecord } from "./agent-job-record";

export interface AgentJobRepository {
  /**
   * Persist a job record. Upserts by id if it already exists.
   * Returns the saved domain record.
   */
  save(job: AgentJobRecord): Promise<AgentJobRecord>;

  /** Find a job by its stable id. */
  findById(id: string): Promise<AgentJobRecord | null>;

  /** Find a job by its deterministic idempotency key. */
  findByIdempotencyKey(key: string): Promise<AgentJobRecord | null>;

  /**
   * Find jobs eligible for retry, ordered by next attempt time.
   * Used by the worker polling loop.
   */
  findRetryable(options: {
    /** Maximum number of records to return. */
    limit: number;
    /** Only return jobs whose nextAttemptAt is <= now. */
    now: Date;
  }): Promise<readonly AgentJobRecord[]>;
}
