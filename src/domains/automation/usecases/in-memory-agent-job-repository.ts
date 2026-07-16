/**
 * src/domains/automation/usecases/in-memory-agent-job-repository.ts
 *
 * Test-only in-memory implementation of AgentJobRepository.
 */

import type { AgentJobRecord } from "../agent-job-record";
import type { AgentJobRepository } from "../agent-job-repository";

export function createInMemoryAgentJobRepository(): AgentJobRepository {
  const byId = new Map<string, AgentJobRecord>();
  const byIdempotencyKey = new Map<string, AgentJobRecord>();

  return {
    async save(job: AgentJobRecord): Promise<AgentJobRecord> {
      byId.set(job.id, job);
      byIdempotencyKey.set(job.idempotency_key, job);
      return job;
    },

    async findById(id: string): Promise<AgentJobRecord | null> {
      return byId.get(id) ?? null;
    },

    async findByIdempotencyKey(key: string): Promise<AgentJobRecord | null> {
      return byIdempotencyKey.get(key) ?? null;
    },

    async findRetryable({
      limit,
      now,
    }: {
      limit: number;
      now: Date;
    }): Promise<readonly AgentJobRecord[]> {
      return Array.from(byId.values())
        .filter(
          (job) =>
            job.status === "retryable_failed" &&
            job.next_attempt_at !== undefined &&
            job.next_attempt_at <= now,
        )
        .sort(
          (a, b) =>
            (a.next_attempt_at?.getTime() ?? 0) -
            (b.next_attempt_at?.getTime() ?? 0),
        )
        .slice(0, limit);
    },
  };
}
